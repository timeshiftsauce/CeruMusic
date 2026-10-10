/*
 * 系统媒体控件（SMTC / MPRIS / NowPlayingInfoCenter）原生桥接服务。
 *
 * 为什么需要它：
 *   浏览器 `navigator.mediaSession` 交给系统的封面是一个 **URL**，
 *   系统（Windows SMTC）会自己去拉取并按自己的策略缩放，结果往往是
 *   低分辨率糊图。原生实现把**原始图片字节**通过
 *   `RandomAccessStreamReference` 直接塞给系统，能保留完整分辨率
 *   （实现参照 SPlayer 的 native/external-media-integration）。
 *
 * 设计要点：
 *   - 原生模块是**可选**的：未编译 / 加载失败时整体降级为 no-op，
 *     渲染端继续走 mediaSession，不影响播放。
 *   - 所有对外方法都做了 try/catch 兜底，绝不让原生层异常打断播放。
 */

import { app, ipcMain, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

type SystemMediaEventType =
  | 'Play'
  | 'Pause'
  | 'Stop'
  | 'NextSong'
  | 'PreviousSong'
  | 'ToggleShuffle'
  | 'ToggleRepeat'
  | 'SetRate'
  | 'SetVolume'
  | 'Seek'

interface SystemMediaEvent {
  type: SystemMediaEventType
  positionMs?: number | null
  rate?: number | null
  volume?: number | null
}

interface MetadataParam {
  songName: string
  authorName: string
  albumName: string
  coverData?: Buffer | Uint8Array | null
  ncmId?: number | null
  duration?: number | null
}

interface TimelineParam {
  currentTime: number
  totalTime: number
}

interface PlayModeParam {
  repeatMode: 'Track' | 'List' | 'None'
  isShuffling: boolean
}

/** 原生模块的导出签名（与 native/.../src/lib.rs 一一对应）。 */
interface NativeEmi {
  initialize(logDir: string): void
  shutdown(): void
  enableSystemMedia(): void
  disableSystemMedia(): void
  /** 回调收到的是事件的 JSON 字符串（原生侧不传结构体，避免跨线程转换失败）。 */
  registerEventHandler(callback: (eventJson: string) => void): void
  updateMetadata(payload: MetadataParam): void
  updatePlaybackStatus(payload: { status: 'Playing' | 'Paused' }): void
  updatePlaybackRate(rate: number): void
  updateVolume(volume: number): void
  updateTimeline(payload: TimelineParam): void
  updatePlayMode(payload: PlayModeParam): void
}

/**
 * 解析原生模块路径。
 * dev:   <repo>/native/external-media-integration/external-media-integration.node
 * 打包:  app.asar.unpacked/native/external-media-integration/external-media-integration.node
 *        （asarUnpack 配置见 electron-builder.yml）
 */
function resolveNativePath(): string[] {
  const file = 'external-media-integration.node'
  const dir = path.join('native', 'external-media-integration')
  if (app.isPackaged) {
    return [
      path.join(process.resourcesPath, 'app.asar.unpacked', dir, file),
      path.join(process.resourcesPath, dir, file)
    ]
  }
  return [path.join(app.getAppPath(), dir, file)]
}

class NativeMediaService {
  private native: NativeEmi | null = null
  private loaded = false
  private bound = false
  private win: BrowserWindow | null = null

  /** 原生模块当前是否可用（渲染端可据此决定是否走原生路径）。 */
  get isAvailable(): boolean {
    return this.native !== null
  }

  /**
   * 尝试加载原生模块并初始化。
   * 失败时静默降级（打一条 warn），不抛错。
   */
  init(win: BrowserWindow): void {
    this.win = win
    win.once('closed', () => {
      if (this.win === win) this.win = null
    })

    // 已加载过就只更新窗口引用，不重复 initialize/registerEventHandler
    // （重复注册会让原生侧覆盖回调，且 WinRT SMTC 会重建会话）。
    if (this.loaded) {
      console.log('[emi] 已初始化，仅更新窗口引用')
      return
    }

    const candidates = resolveNativePath()
    let loadedModule: NativeEmi | null = null
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loadedModule = require(p) as NativeEmi
        console.log(`[emi] 原生模块已加载: ${p}`)
        break
      } catch (e) {
        console.warn(`[emi] 加载 ${p} 失败:`, e)
      }
    }

    if (!loadedModule) {
      console.log(
        `[emi] 未找到原生模块（已尝试: ${candidates.join(' | ')}），SMTC 将使用浏览器 mediaSession`
      )
      return
    }

    this.native = loadedModule
    try {
      const logDir = path.join(app.getPath('userData'), 'logs', 'external-media-integration')
      this.native.initialize(logDir)
      this.native.registerEventHandler((eventJson) => {
        // 原生侧以 JSON 字符串回传事件（结构体跨线程转换会拿到 null）。
        let event: SystemMediaEvent
        try {
          event = typeof eventJson === 'string' ? JSON.parse(eventJson) : (eventJson as SystemMediaEvent)
        } catch (e) {
          console.warn('[emi] 解析原生事件失败:', eventJson, e)
          return
        }
        const target = this.win
        if (!target || target.isDestroyed()) {
          console.warn('[emi] 收到系统媒体事件，但主窗口不可用，丢弃:', event?.type)
          return
        }
        target.webContents.send('emi:media-event', event)
      })
      this.native.enableSystemMedia()
      this.loaded = true
    } catch (e) {
      console.warn('[emi] 初始化失败，降级为 mediaSession:', e)
      this.native = null
      return
    }

    this.bindIpc()
  }

  private bindIpc(): void {
    if (this.bound) return
    this.bound = true

    ipcMain.on('emi:update-metadata', (_e, payload: MetadataParam) => {
      this.native?.updateMetadata(payload)
    })
    ipcMain.on('emi:update-playback-status', (_e, status: 'Playing' | 'Paused') => {
      this.native?.updatePlaybackStatus({ status })
    })
    ipcMain.on('emi:update-timeline', (_e, payload: TimelineParam) => {
      this.native?.updateTimeline(payload)
    })
    ipcMain.on('emi:update-playback-rate', (_e, rate: number) => {
      this.native?.updatePlaybackRate(rate)
    })
    ipcMain.on('emi:update-play-mode', (_e, payload: PlayModeParam) => {
      this.native?.updatePlayMode(payload)
    })
    ipcMain.handle('emi:is-available', () => this.isAvailable)
  }

  shutdown(): void {
    if (!this.loaded) return
    try {
      this.native?.disableSystemMedia()
      this.native?.shutdown()
    } catch (e) {
      console.warn('[emi] shutdown 失败:', e)
    }
    this.native = null
    this.loaded = false
  }
}

export const nativeMediaService = new NativeMediaService()
export default nativeMediaService
