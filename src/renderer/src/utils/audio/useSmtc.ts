/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * This software is the confidential and proprietary information of 时迁酱.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 *
 * @author 时迁酱，无聊的霜霜
 * @since 2025-9-19
 * @version 1.0
 */

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

  /**
   * 检查浏览器是否支持 Media Session API
   */
  private get isSupported(): boolean {
    return 'mediaSession' in navigator
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
    if (!this.isSupported) return
    this.lastMetadata = metadata
    const revision = ++this.metadataRevision

    const cachedArtwork = this.getCachedArtwork(metadata.artworkUrl)
    this.applyMetadataNow(metadata, cachedArtwork, revision)

    if (cachedArtwork || !metadata.artworkUrl) return
    void this.enrichArtwork(metadata, revision)
  }

  private applyMetadataNow(
    metadata: TrackMetadata,
    artworkDataUrl: string | null,
    revision: number
  ): void {
    if (revision !== this.metadataRevision) return
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
    })
  }

  /**
   * 生成不同尺寸的封面图片配置
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
   * 初始化媒体会话控制器
   */
  init(audioElement: HTMLAudioElement, callbacks: MediaSessionCallbacks): void {
    if (!this.isSupported) {
      console.warn('Media Session API is not supported in this browser')
      return
    }

    // 清理之前的监听器
    this.cleanup()

    this.audioElement = audioElement
    this.callbacks = callbacks

    // 只设置媒体会话动作处理器，不自动监听音频事件
    // 让应用层手动控制播放状态更新，避免循环调用
    this.setupMediaSessionActionHandlers()

    // 窗口重新可见时强制重刷系统媒体卡片
    this.bindVisibilityRefresh()

    // 初始同步播放状态，确保组件重挂载后 UI 与实际状态一致
    try {
      if (this.audioElement) {
        navigator.mediaSession.playbackState = this.audioElement.paused ? 'paused' : 'playing'
      }
    } catch (error) {
      console.warn('Failed to sync initial playback state:', error)
    }
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
    if (!this.isSupported) return

    try {
      navigator.mediaSession.playbackState = state
    } catch (error) {
      console.warn('Failed to update playback state:', error)
    }
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

    this.audioElement = null
    this.callbacks = null
  }
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
