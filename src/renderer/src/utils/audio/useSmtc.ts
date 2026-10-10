/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * This software is the confidential and proprietary information of 时迁酱.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 *
 * @author 时迁酱，无聊的霜霜
 * @since 2025-9-19
 * @version 2.0
 */

/**
 * 系统媒体控件（SMTC）控制器。
 *
 * 双通道设计：
 *   1. **原生通道（优先）** —— 主进程加载了 `external-media-integration` 原生模块时，
 *      封面以**原始字节**交给系统，系统卡片显示高清封面（实现参照 SPlayer）。
 *   2. **浏览器通道（回落）** —— 原生不可用时用 `navigator.mediaSession`。
 *      注意它只能传封面 **URL**，系统会自行压缩，清晰度受限于源图。
 *
 * 对外 API 保持不变，调用方无需关心走的是哪条通道。
 */

import { usePlaySettingStore } from '@renderer/store'
import { toRaw } from 'vue'
import type { MusicItem } from '@common/musicItem'

interface MediaSessionCallbacks {
  play: () => void
  pause: () => void
  playPrevious: () => void
  playNext: () => void
}

interface TrackMetadata {
  title: string
  artist: string
  album: string
  artworkUrl: string
  /** 歌曲时长（毫秒），用于原生通道的进度条。 */
  duration?: number
  /**
   * 完整歌曲信息（可选）。开启「系统媒体控件高清封面」后，会连同它一起
   * 交给「高清封面协议」向插件换取大图 —— 插件通常直接用其中的 `img` 转换。
   */
  songInfo?: MusicItem
  /**
   * 上游 CDN 原链接（可选）。**只用于高清封面转换**，与 `artworkUrl`
   * （显示用的 blob:/file:）严格区分 —— 两者混用会把本地缓存地址当成
   * 上游 URL 传给插件，导致转换结果错误。
   *
   * 为空时（如命中本地封面缓存）退而使用 `songInfo.img`。
   */
  sourceArtworkUrl?: string
}

/** 原生通道可用的探测结果缓存。 */
let nativeAvailable: boolean | null = null

function hasNativeBridge(): boolean {
  return typeof window !== 'undefined' && !!window.api?.emi
}

/** 探测原生通道是否可用（结果会缓存，只探测一次）。 */
async function detectNative(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable
  if (!hasNativeBridge()) {
    nativeAvailable = false
    return false
  }
  try {
    nativeAvailable = await window.api.emi.isAvailable()
  } catch {
    nativeAvailable = false
  }
  return nativeAvailable
}

/**
 * Media Session API 控制器
 * 用于管理浏览器的媒体会话，支持系统级媒体控制
 */
class MediaSessionController {
  private audioElement: HTMLAudioElement | null = null
  private callbacks: MediaSessionCallbacks | null = null
  // 元数据异步解析封面时的修订号：防止快速切歌时旧结果覆盖新结果
  private metadataRevision = 0
  private eventListeners: Array<{
    element: HTMLAudioElement
    event: string
    handler: EventListener
  }> = []
  // 最近一次提交的元数据：窗口重新可见时用它强制重刷系统卡片
  private lastMetadata: TrackMetadata | null = null
  // 封面 url -> data URL 缓存，避免重复转换（同一首歌多次提交 / 可见性重刷）
  private artworkCache = new Map<string, string>()
  private visibilityBound = false
  // 原生通道可用性（异步探测，探测完成前先走浏览器通道，避免首帧无 metadata）
  private nativeReady = false
  private nativeProbeStarted = false
  private nativeEventHandler: (() => void) | null = null
  // 最近一次播放状态，原生通道需要显式同步
  private currentPlaybackState: MediaSessionPlaybackState = 'none'

  /**
   * 检查浏览器是否支持 Media Session API
   */
  private get isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator
  }

  /**
   * 更新媒体会话元数据
   *
   * 采用“同步先行，异步增强”策略：
   * 1. 标题/歌手/专辑（命中缓存时含封面）立即同步写入，绝不等待异步环节 ——
   *    此前封面下载/转换的 await 一旦被拖住（后台节流、隐藏窗口等场景），
   *    整条更新都会作废，系统卡片就会停留在上一首歌。
   * 2. 封面异步转 data URL（带超时），成功后且仍是最新提交时再覆盖一次。
   * 修订号防止快速切歌时旧结果覆盖新结果。
   */
  updateMetadata(metadata: TrackMetadata): void {
    this.lastMetadata = metadata
    const revision = ++this.metadataRevision

    // 原生通道：封面走字节流，直接异步下载原始图片 → 交给主进程。
    if (this.nativeReady && hasNativeBridge()) {
      void this.pushNativeMetadata(metadata, revision)
      // 原生通道下不再走 mediaSession，避免两套卡片打架。
      return
    }

    if (!this.isSupported) return

    // 只有原生通道支持高清封面协议；浏览器通道只能给 URL，受系统二次压缩。
    if (hiresCoverEnabled()) {
      console.warn(
        '[SMTC-高清] 已开启开关，但当前走的是「浏览器通道」(原生模块不可用) → ' +
          '高清封面协议不生效，仍为原有封面。'
      )
    }

    const cachedArtwork = this.getCachedArtwork(metadata.artworkUrl)
    this.applyMetadataNow(metadata, cachedArtwork, revision)

    if (cachedArtwork || !metadata.artworkUrl) return
    void this.enrichArtwork(metadata, revision)
  }

  /**
   * 原生通道：把元数据（含封面原始字节）推给主进程。
   *
   * 封面的清晰度取决于这里拿到的字节：直接下载源图，不做缩放，
   * 这样才能让系统卡片显示高清封面。
   *
   * 若开启「系统媒体控件高清封面」且卡片用的是原生通道，会先尝试通过
   * 「高清封面协议」向插件换一张更大的图（插件通常直接用 songInfo.img 转换，
   * 无需新请求）；插件不支持 / 取不到时静默回落 `metadata.artworkUrl`。
   */
  private async pushNativeMetadata(metadata: TrackMetadata, revision: number): Promise<void> {
    try {
      // 1) 优先尝试高清封面协议（可选能力）。任一步失败都不影响后续回落。
      let coverUrl = metadata.artworkUrl
      let hiresApplied = false
      const hiresOn = hiresCoverEnabled()
      if (hiresOn && metadata.songInfo) {
        // 关键：传给高清转换的必须是「上游 CDN 原链接」。
        // artworkUrl 是显示用的 blob:/file:，绝不能当作上游 URL ——
        // 优先用显式透传的 sourceArtworkUrl，其次才是 songInfo.img（插件记录里
        // 也可能存了真实 CDN 地址）。两者都没有时放弃高清，直接用原封面。
        const upstreamUrl = pickUpstreamArtworkUrl(metadata)
        console.log(
          `[SMTC-高清] 开关=开启 歌曲「${metadata.title || '未知歌曲'}」` +
            ` 上游原链接=${upstreamUrl || '（无，放弃高清）'}`
        )
        if (upstreamUrl) {
          const hiresUrl = await resolveHiresArtwork(metadata.songInfo, upstreamUrl)
          if (revision !== this.metadataRevision) {
            console.log('[SMTC-高清] 结果已过期（期间切歌），丢弃')
            return
          }
          if (hiresUrl && hiresUrl !== upstreamUrl) {
            coverUrl = hiresUrl
            hiresApplied = true
            console.log(`[SMTC-高清] ✅ 插件返回高清：${hiresUrl}`)
          } else if (hiresUrl) {
            console.log('[SMTC-高清] 插件返回与上游相同，视为无可升级 → 用原封面')
          } else {
            console.log('[SMTC-高清] ⚠️ 插件未返回高清（未实现/取不到/出错）→ 回落原封面')
          }
        }
      } else if (!hiresOn) {
        console.log(
          `[SMTC-高清] 开关=关闭 → 使用原有封面（${shortUrlForLog(metadata.artworkUrl)}）`
        )
      } else {
        console.log('[SMTC-高清] 开关=开启，但无 songInfo（拿不到上游链接）→ 用原封面')
      }

      // 2) 下载封面原始字节交给系统（hires 与回落走同一条）。
      //    注意：非 JPEG/PNG（尤其 WebP）系统不认，必须转码后再推，
      //    否则卡片会**完全不显示封面**。
      let coverData: Uint8Array | undefined
      if (coverUrl) {
        const fetched = await fetchArtworkBytes(coverUrl)
        if (fetched) {
          const normalized = await normalizeArtworkBytes(fetched.bytes, fetched.mime)
          coverData = normalized.bytes
          console.log(
            `[SMTC-高清] 封面字节：${fetched.bytes.byteLength} bytes → ${normalized.bytes.byteLength} bytes` +
              ` (${normalized.mime}${normalized.transcoded ? ', 已转码' : ''})` +
              ` 来源=${hiresApplied ? '高清' : '原封面'} ${shortUrlForLog(coverUrl)}`
          )
        } else {
          console.log(`[SMTC-高清] 封面字节：下载失败(空) 来源=${hiresApplied ? '高清' : '原封面'} ${shortUrlForLog(coverUrl)}`)
        }
      } else {
        console.log('[SMTC-高清] 无封面 URL，跳过封面字节；仅更新文字元数据')
      }
      if (revision !== this.metadataRevision) {
        console.log('[SMTC-高清] 结果已过期（期间切歌），丢弃')
        return
      }
      // 注意：native 侧的 Option<T> 只认 undefined，传 null 会抛
      // "Failed to convert napi value Null into rust type"。
      window.api.emi.updateMetadata({
        songName: metadata.title || '未知歌曲',
        authorName: metadata.artist || '未知艺术家',
        albumName: metadata.album || '未知专辑',
        coverData,
        duration: metadata.duration ?? undefined
      })
      console.log(
        `[SMTC-高清] 已推送给系统卡片：${hiresApplied ? '高清封面' : '原有封面'}` +
          `（coverData ${coverData ? `${coverData.byteLength}B` : '无'}）`
      )
      // 注意：**不要**在这里顺带推播放状态。
      // 切歌瞬间 `currentPlaybackState` 往往是上一首/初始的过期值（首次播放时
      // audio.paused 仍为 true，会被记成 paused），一并推过去会让系统卡片
      // 在歌曲已经出声时仍显示「暂停」。状态只由 updatePlaybackState 驱动。
    } catch (error) {
      console.warn('原生通道更新元数据失败，回落 mediaSession:', error)
      this.nativeReady = false
      this.updateMetadata(metadata)
    }
  }

  private applyMetadataNow(
    metadata: TrackMetadata,
    artworkDataUrl: string | null,
    revision: number
  ): void {
    if (revision !== this.metadataRevision) return
    if (!this.isSupported) return
    try {
      // 确保元数据完整性，避免空值导致SMTC显示异常
      const safeMetadata = {
        title: metadata.title || '未知歌曲',
        artist: metadata.artist || '未知艺术家',
        album: metadata.album || '未知专辑',
        artwork: artworkDataUrl ? this.generateArtworkSizes(artworkDataUrl) : []
      }

      navigator.mediaSession.metadata = new MediaMetadata(safeMetadata)
    } catch (error) {
      console.warn('Failed to update media session metadata:', error)
    }
  }

  private async enrichArtwork(metadata: TrackMetadata, revision: number): Promise<void> {
    const dataUrl = await toArtworkDataUrl(metadata.artworkUrl)
    if (!dataUrl) return
    this.setCachedArtwork(metadata.artworkUrl, dataUrl)
    if (revision !== this.metadataRevision) return
    this.applyMetadataNow(metadata, dataUrl, revision)
  }

  private getCachedArtwork(url: string): string | null {
    if (!url) return null
    return this.artworkCache.get(url) || null
  }

  private setCachedArtwork(url: string, dataUrl: string): void {
    if (!url) return
    if (this.artworkCache.size >= 40) {
      const oldest = this.artworkCache.keys().next().value
      if (oldest !== undefined) this.artworkCache.delete(oldest)
    }
    this.artworkCache.set(url, dataUrl)
  }

  /**
   * 窗口重新可见时，用最近一次元数据强制重刷系统卡片。
   * 后台期间系统卡片存在刷新滞后时，这一步保证打开窗口后立即对齐当前歌曲。
   */
  private bindVisibilityRefresh(): void {
    if (this.visibilityBound) return
    this.visibilityBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (!this.lastMetadata) return
      this.updateMetadata(this.lastMetadata)
      // 元数据刷新可能让系统卡片把状态重置，按最近一次已知状态重申一次。
      if (this.currentPlaybackState === 'playing' || this.currentPlaybackState === 'paused') {
        this.updatePlaybackState(this.currentPlaybackState)
      }
    })
  }

  /**
   * 生成不同尺寸的封面图片配置。
   *
   * 注意：浏览器通道只能给 URL，系统会自行缩放；同一 URL 复制成多个
   * sizes 不会提升清晰度，但能让系统在需要时挑到最接近的声明尺寸。
   * 真正的高清封面请走原生通道。
   */
  private generateArtworkSizes(artworkUrl: string): MediaImage[] {
    const sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']
    return sizes.map((size) => ({
      src: artworkUrl,
      sizes: size,
      type: 'image/png'
    }))
  }

  /**
   * 初始化媒体会话控制器。
   *
   * 会异步探测原生通道；探测成功后，后续 `updateMetadata` 自动走原生。
   */
  init(audioElement: HTMLAudioElement, callbacks: MediaSessionCallbacks): void {
    // 清理之前的监听器
    this.cleanup()

    this.audioElement = audioElement
    this.callbacks = callbacks

    // 启动原生探测（只探一次）；探测成功则绑定原生事件回调。
    if (!this.nativeProbeStarted) {
      this.nativeProbeStarted = true
      void detectNative().then((ok) => {
        this.nativeReady = ok
        if (ok) {
          console.log('[emi] 使用原生系统媒体控件通道（高清封面）')
          console.log('[SMTC-高清] 原生通道就绪 → 高清封面协议可用（受设置开关控制）')
          // 关键：一旦原生就绪，必须把 Chromium 自己的 mediaSession 会话拆掉，
          // 否则系统里会同时出现两张媒体卡片（一张插件的、一张浏览器原生的）。
          this.releaseBrowserMediaSession()
          this.bindNativeEvents()
          // 用最近一次元数据立即刷新原生卡片
          if (this.lastMetadata) this.updateMetadata(this.lastMetadata)
        } else if (this.lastMetadata) {
          // 探测期间已经提交过元数据 → 补一次 mediaSession 提交
          this.updateMetadata(this.lastMetadata)
        }
        if (!ok)
          console.warn(
            '[SMTC-高清] 原生模块不可用 → 走浏览器通道，高清封面协议不会生效（开关无意义）'
          )
      })
    }

    // 原生通道需要一个进度源（系统卡片的时间轴）。节流推送，避免 timeupdate 高频刷爆 IPC。
    this.bindNativeTimeline(audioElement)

    // 原生通道已就绪时，完全不碰浏览器 mediaSession。
    if (this.nativeReady) return

    if (!this.isSupported) {
      if (!hasNativeBridge()) {
        console.warn('Media Session API is not supported in this browser')
      }
      return
    }

    // 只设置媒体会话动作处理器，不自动监听音频事件
    // 让应用层手动控制播放状态更新，避免循环调用
    this.setupMediaSessionActionHandlers()

    // 窗口重新可见时强制重刷系统媒体卡片
    this.bindVisibilityRefresh()

    // 初始同步播放状态，确保组件重挂载后 UI 与实际状态一致
    try {
      if (this.audioElement) {
        const state = this.audioElement.paused ? 'paused' : 'playing'
        this.currentPlaybackState = state
        navigator.mediaSession.playbackState = state
      }
    } catch (error) {
      console.warn('Failed to sync initial playback state:', error)
    }
  }

  /**
   * 彻底释放浏览器的 mediaSession 会话。
   *
   * Chromium 只要检测到 `mediaSession.metadata` 或任意 action handler
   * 就会向系统注册一张 SMTC 卡片。原生通道启用时必须把两者都拆掉，
   * 否则系统里会同时出现两张媒体卡片。
   */
  private releaseBrowserMediaSession(): void {
    if (!this.isSupported) return
    try {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.playbackState = 'none'
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekto',
        'seekbackward',
        'seekforward',
        'stop'
      ]
      actions.forEach((action) => {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // 某些 action 在部分平台不支持，忽略
        }
      })
    } catch (error) {
      console.warn('释放浏览器 mediaSession 失败:', error)
    }
  }

  /**
   * 绑定原生通道的进度源。
   *
   * Windows SMTC / Linux MPRIS 的系统卡片需要显式的时间轴；这里监听
   * `timeupdate` 并节流推送给主进程（1s 一次足够系统卡片显示进度，
   * 且避免高频 IPC）。
   */
  private bindNativeTimeline(audioElement: HTMLAudioElement): void {
    if (!hasNativeBridge()) return
    this.unbindNativeTimeline()

    let lastPush = 0
    const handler = (): void => {
      if (!this.nativeReady) return
      const now = Date.now()
      if (now - lastPush < 1000) return
      lastPush = now
      const total = Number.isFinite(audioElement.duration) ? audioElement.duration : 0
      if (total <= 0) return
      this.updateTimeline(audioElement.currentTime * 1000, total * 1000)
    }

    audioElement.addEventListener('timeupdate', handler)
    this.eventListeners.push({ element: audioElement, event: 'timeupdate', handler })
  }

  private unbindNativeTimeline(): void {
    const idx = this.eventListeners.findIndex((l) => l.event === 'timeupdate')
    if (idx >= 0) {
      const { element, event, handler } = this.eventListeners[idx]
      element.removeEventListener(event, handler)
      this.eventListeners.splice(idx, 1)
    }
  }

  /**
   * 绑定原生通道的系统按键事件，转发到应用层回调。
   */
  private bindNativeEvents(): void {
    if (this.nativeEventHandler || !hasNativeBridge()) return
    this.nativeEventHandler = window.api.emi.onMediaEvent((event) => {
      console.log('[emi] 收到系统媒体按键:', event, 'callbacks=', !!this.callbacks)
      if (!this.callbacks) return
      switch (event.type) {
        case 'Play':
          this.callbacks.play()
          break
        case 'Pause':
          this.callbacks.pause()
          break
        case 'NextSong':
          this.callbacks.playNext()
          break
        case 'PreviousSong':
          this.callbacks.playPrevious()
          break
        case 'Seek':
          if (event.positionMs != null && this.audioElement) {
            try {
              this.audioElement.currentTime = event.positionMs / 1000
            } catch (e) {
              console.warn('原生 seek 失败:', e)
            }
          }
          break
        default:
          break
      }
    })
  }

  /**
   * 设置媒体会话动作处理器
   */
  private setupMediaSessionActionHandlers(): void {
    if (!this.callbacks) return

    const actionHandlers: Array<[MediaSessionAction, () => void]> = [
      ['play', this.callbacks.play],
      ['pause', this.callbacks.pause],
      ['previoustrack', this.callbacks.playPrevious],
      ['nexttrack', this.callbacks.playNext]
    ]

    actionHandlers.forEach(([action, handler]) => {
      navigator.mediaSession.setActionHandler(action, handler)
    })

    // 设置 seekto 处理器
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (!this.audioElement || !details.seekTime) return

      try {
        if (details.fastSeek && 'fastSeek' in this.audioElement) {
          this.audioElement.fastSeek(details.seekTime)
        } else {
          this.audioElement.currentTime = details.seekTime
        }
      } catch (error) {
        console.warn('Failed to seek audio:', error)
      }
    })
  }

  /**
   * 更新播放状态
   */
  updatePlaybackState(state: MediaSessionPlaybackState): void {
    this.currentPlaybackState = state

    // 原生通道
    if (this.nativeReady && hasNativeBridge()) {
      try {
        window.api.emi.updatePlaybackStatus(state === 'paused' ? 'Paused' : 'Playing')
      } catch (error) {
        console.warn('原生通道更新播放状态失败:', error)
      }
      return
    }

    if (!this.isSupported) return

    try {
      navigator.mediaSession.playbackState = state
    } catch (error) {
      console.warn('Failed to update playback state:', error)
    }
  }

  /**
   * 更新进度（原生通道用）。
   *
   * 浏览器通道的 `setPositionState` 由调用方按需调用；
   * 这里只在原生通道下转发，避免污染现有行为。
   */
  updateTimeline(currentTimeMs: number, totalTimeMs: number): void {
    if (!this.nativeReady || !hasNativeBridge()) return
    try {
      window.api.emi.updateTimeline({ currentTime: currentTimeMs, totalTime: totalTimeMs })
    } catch {}
  }

  /**
   * 更新播放模式（原生通道用）。
   */
  updatePlayMode(repeatMode: 'Track' | 'List' | 'None', isShuffling: boolean): void {
    if (!this.nativeReady || !hasNativeBridge()) return
    try {
      window.api.emi.updatePlayMode({ repeatMode, isShuffling })
    } catch {}
  }

  /** 原生通道是否已就绪（高清封面生效中）。 */
  get isNativeActive(): boolean {
    return this.nativeReady
  }

  /**
   * 清理事件监听器和媒体会话
   */
  cleanup(): void {
    // 移除音频事件监听器
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler)
    })
    this.eventListeners = []

    // 清理媒体会话动作处理器
    if (this.isSupported) {
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekto'
      ]
      actions.forEach((action) => {
        navigator.mediaSession.setActionHandler(action, null)
      })
    }

    // 原生事件回调保留（跨组件重挂载仍有意义），此处不解除。

    this.audioElement = null
    this.callbacks = null
  }
}

/**
 * 是否是可交给插件做「上游转换」的封面地址。
 *
 * 只认 http(s)：blob:/file:/data: 都是宿主本地产物（显示用缓存），
 * 把它们当上游 URL 传给插件会得到无意义甚至错误的转换结果。
 */
function isUpstreamArtworkUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

/**
 * 从元数据里挑出「上游 CDN 原链接」用于高清转换。
 *
 * 优先级：显式透传的 `sourceArtworkUrl` → `songInfo.img`（插件记录里可能存了
 * 真实 CDN 地址）。二者都必须是 http(s)；否则返回空，调用方放弃高清、用原封面。
 * 这样能避免把显示用的 blob:/file: 误当成上游 URL（那是本次要修的核心问题）。
 */
function pickUpstreamArtworkUrl(metadata: TrackMetadata): string | undefined {
  const candidates = [metadata.sourceArtworkUrl, metadata.songInfo?.img]
  for (const candidate of candidates) {
    if (isUpstreamArtworkUrl(candidate)) return candidate.trim()
  }
  return undefined
}

/**
 * 系统媒体控件是否启用高清封面（设置开关）。
 *
 * 在函数内解析 store（跟随本项目其它工具函数的写法），避免模块顶层就依赖
 * Pinia 实例；任何异常都按关闭处理，保证逐字节回落。
 */
function hiresCoverEnabled(): boolean {
  try {
    return usePlaySettingStore().getSmtcHiresCover === true
  } catch (e) {
    console.warn('[SMTC-高清] 读取设置开关失败，按关闭处理:', e)
    return false
  }
}

/** 日志用：把长 URL 截断，保留可辨认的头部（含尺寸参数）。 */
function shortUrlForLog(url: string | undefined): string {
  if (!url) return '（空）'
  const trimmed = url.trim()
  return trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 137)}…`
}

/**
 * 调用「高清封面协议」向插件换取高清封面 URL。
 *
 * 宿主把**完整 songInfo** 透传给插件；插件通常直接用它已有的 `img` 做尺寸
 * 转换（无需新请求），也可自行请求。插件未实现该协议 / 返回空 / 出错时，
 * 主进程侧会返回空字符串，这里统一回落到 `undefined`（调用方用原封面）。
 */
async function resolveHiresArtwork(
  songInfo: MusicItem,
  artworkUrl: string
): Promise<string | undefined> {
  try {
    if (!window.api?.music?.requestSdk) {
      console.warn('[SMTC-高清] 无 requestSdk 桥，跳过高清请求')
      return undefined
    }
    const source = songInfo?.source
    if (!source) {
      console.warn('[SMTC-高清] songInfo 缺少 source，无法路由到插件')
      return undefined
    }
    // 关键：songInfo 往往来自 Pinia（响应式 Proxy），直接经 IPC 会抛
    // "An object could not be cloned." —— IPC 的结构化克隆不认 Proxy。
    // 这里转成纯对象再传（toRaw 去 Proxy，JSON 深拷贝去掉嵌套响应式引用）。
    let plainSong: MusicItem
    try {
      plainSong = JSON.parse(JSON.stringify(toRaw(songInfo)))
    } catch (e) {
      console.warn('[SMTC-高清] songInfo 无法序列化，跳过高清请求:', e)
      return undefined
    }
    // source 是 requestSdk 的路由必需字段；songInfo 一并透传给插件。
    console.log(
      `[SMTC-高清] → 请求插件 getHiresPic: source=${source} artworkUrl=${shortUrlForLog(artworkUrl)}`
    )
    const value = await window.api.music.requestSdk('getHiresPic', {
      source,
      songInfo: plainSong,
      artworkUrl
    })
    console.log(
      `[SMTC-高清] ← 插件返回: ${typeof value === 'string' ? shortUrlForLog(value) : JSON.stringify(value)}`
    )
    return typeof value === 'string' && value ? value : undefined
  } catch (e) {
    console.warn('[SMTC-高清] 请求高清封面失败，回落原封面:', e)
    return undefined
  }
}

/**
 * 兜底：Windows SMTC 的缩略图解码链不认 WebP（GDI+ 直接 "Out of memory"），
 * 传 WebP 字节会导致系统卡片**完全不显示封面**。
 *
 * 这里按 magic bytes 判断格式，非 JPEG/PNG 的一律用 canvas 重编码成 JPEG。
 * 只在格式不受支持时才转，JPEG/PNG 原样透传（避免无谓的有损二次编码）。
 *
 * canvas 解不出来（畸形图/超大图）时返回原字节 —— 宁可不显示，也不要抛错。
 */
async function normalizeArtworkBytes(
  bytes: Uint8Array,
  mime: string
): Promise<{ bytes: Uint8Array; mime: string; transcoded: boolean }> {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  if (isJpeg || isPng) return { bytes, mime: isJpeg ? 'image/jpeg' : 'image/png', transcoded: false }

  // 非 JPEG/PNG（WebP/GIF/AVIF 等）→ 重编码为 JPEG。
  try {
    const blob = new Blob([bytes as BlobPart], { type: mime || 'image/webp' })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return { bytes, mime, transcoded: false }
    }
    // JPEG 无透明通道，先铺白底，避免透明区域变黑。
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const jpegBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    )
    if (!jpegBlob) return { bytes, mime, transcoded: false }
    const out = new Uint8Array(await jpegBlob.arrayBuffer())
    console.log(
      `[SMTC-高清] 封面格式 ${mime || '未知'} 系统不认，已转 JPEG：` +
        `${bytes.byteLength}B → ${out.byteLength}B (${bitmap.width}x${bitmap.height})`
    )
    return { bytes: out, mime: 'image/jpeg', transcoded: true }
  } catch (e) {
    console.warn('[SMTC-高清] 封面重编码失败，按原字节推送（可能不显示）:', e)
    return { bytes, mime, transcoded: false }
  }
}

/**
 * 下载封面并返回原始字节。
 *
 * 原生通道用它把**原图**交给系统 —— 不做 data URL 转换，不做缩放，
 * 这是系统卡片能显示高清封面的前提。
 */
async function fetchArtworkBytes(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!url) return null
  if (url.startsWith('data:')) {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || '' }
    } catch {
      return null
    }
  }
  // /xxx 形式的 public 资源在打包后的 file:// 环境需要按页面相对路径兜底
  const candidates = url.startsWith('/') ? [url, `.${url}`] : [url]
  for (const candidate of candidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(candidate, { signal: controller.signal })
      if (!response.ok) continue
      const blob = await response.blob()
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || '' }
    } catch {
      continue
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/**
 * 把封面地址转换成系统媒体卡片可直接显示的 data URL。
 * 失败返回 null —— 此时照常更新文字元数据但不带头图，避免坏 URL 卡住更新或显示问号。
 */
async function toArtworkDataUrl(url: string): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  // /xxx 形式的 public 资源在打包后的 file:// 环境需要按页面相对路径兜底
  const candidates = url.startsWith('/') ? [url, `.${url}`] : [url]
  for (const candidate of candidates) {
    // 带超时兜底：隐藏/后台窗口下 fetch 可能被长时间挂起，
    // 不能让它无限阻塞封面补充（文字元数据已在同步阶段写入）。
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(candidate, { signal: controller.signal })
      if (!response.ok) continue
      const blob = await response.blob()
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    } catch {
      continue
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

// 导出单例实例
export default new MediaSessionController()
