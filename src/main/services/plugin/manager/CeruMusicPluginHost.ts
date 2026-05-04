/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * This software is the confidential and proprietary information of 时迁酱.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 *
 * @author 时迁酱，无聊的霜霜，Star
 * @since 2025-9-19
 * @version 2.0
 *
 * v2 — 主线程 facade。插件代码运行在独立 worker_thread 中，host 仅持有元信息和 RPC 通道。
 */

import * as fs from 'fs'
import path from 'path'
import { Worker } from 'worker_threads'
import { randomUUID } from 'crypto'
import { MusicItem } from '../../musicSdk/type'
import { sendPluginNotice } from '../../../events/pluginNotice'
import { pluginLog } from '../../../logger'

// ==================== 常量定义 ====================
const CONSTANTS = {
  INVOKE_TIMEOUT: 15_000,
  INIT_TIMEOUT: 8_000,
  CRASH_LIMIT: 3,
  HEARTBEAT_TIMEOUT: 5_000,
  HEARTBEAT_CHECK_INTERVAL: 2_000,
  LOG_PREFIX: '[CeruMusic]'
} as const

// 编译产物路径：electron-vite 会把 pluginWorker 输出到 out/main/pluginWorker.js
const WORKER_PATH = path.join(__dirname, 'pluginWorker.js')

// ==================== 类型定义 ====================
export interface PluginInfo {
  name: string
  version: string
  author: string
  description?: string
  [key: string]: any
}

export interface PluginSource {
  name: string
  qualities: string[]
  [key: string]: any
}

export interface PluginConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'select'
  required?: boolean
  default?: any
  placeholder?: string
  options?: { label: string; value: any }[]
}

export interface ServicePlaylist {
  id: string
  name: string
  songCount: number
  coverImg?: string
  description?: string
}

export interface PlaylistSongResult {
  songs: ImportableSong[]
  total: number
}

export interface ImportableSong {
  name: string
  singer: string
  albumName: string
  albumId: string
  interval: string
  img: string
  source: string
  songmid: string
  url?: string
  types: string[]
  _types: Record<string, any>
  lrc: null | string
}

export type PluginType = 'music-source' | 'service'

interface MusicInfo extends MusicItem {
  id?: string
}

interface PluginMeta {
  pluginInfo: PluginInfo
  sources: PluginSource[]
  pluginType: PluginType
  configSchema: PluginConfigField[]
  hasMethods: Record<string, boolean>
}

type Logger = {
  log: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  info: (...args: any[]) => void
}

// ==================== 错误类 ====================
class PluginError extends Error {
  constructor(
    message: string,
    public readonly method?: string
  ) {
    super(message)
    this.name = 'PluginError'
  }
}

interface PendingCall {
  resolve: (v: any) => void
  reject: (e: any) => void
  timer: NodeJS.Timeout
  method: string
}

/**
 * CeruMusic 插件主机（主线程 Facade）
 * 真正的插件代码在 pluginWorker.ts 中执行；本类只负责：
 *  - 启动/重启/销毁 worker
 *  - 通过 RPC 调用插件方法
 *  - 缓存 metadata 让同步 getter 仍同步
 *  - 调用超时强杀 + 自动 respawn
 *  - 转发 worker 发来的 notice/log/throttle
 */
class CeruMusicPluginHost {
  private pluginCode: string | null = null
  private worker: Worker | null = null
  private meta: PluginMeta | null = null
  private logger: Logger = console
  private pending = new Map<string, PendingCall>()
  private crashCount = 0
  private destroyed = false
  private disabled = false

  /** 上次收到 worker heartbeat 的时间戳。0 表示尚未收到。 */
  private lastHeartbeat = 0
  private watchdogTimer: ReturnType<typeof setInterval> | null = null

  public pluginId?: string

  /** 节流状态：插件调用 stopRequests 后置为 true，阻止后续自动调用 */
  private _throttled: boolean = false
  private _throttleReason: string = ''
  private _throttleTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 插件触发限流时的外部回调，由 pluginService 注入。
   */
  public onThrottle: ((pluginId: string, reason: string, duration?: number) => void) | null = null

  /**
   * 插件被永久禁用（崩溃次数超阈值 / 重启失败）时的外部回调。
   * 由 pluginService 注入，通常用于通知渲染端。
   */
  public onDisabled: ((pluginId: string, reason: string) => void) | null = null

  constructor(pluginCode: string | null = null, logger: Logger = console) {
    this.pluginCode = pluginCode
    this.logger = logger
    // 注意：构造函数不再同步初始化沙箱。需要调用方 await loadPlugin() 或显式 _spawn()。
  }

  // ==================== 公共方法（与旧版兼容） ====================

  async loadPlugin(pluginPath: string, logger: Logger = console): Promise<this> {
    this.logger = logger
    try {
      this.pluginCode = fs.readFileSync(pluginPath, 'utf-8')
    } catch (error: any) {
      throw new PluginError(`无法加载插件 ${pluginPath}: ${error.message}`)
    }
    await this._spawn()
    return this
  }

  /** 旧 API：构造函数传入 pluginCode 时，需要异步初始化。 */
  async ensureReady(): Promise<void> {
    if (this.meta) return
    if (!this.pluginCode) throw new PluginError('No plugin code provided.')
    await this._spawn()
  }

  getPluginInfo(): PluginInfo {
    this._ensureReady()
    return this.meta!.pluginInfo
  }

  getPluginCode(): string | null {
    return this.pluginCode
  }

  getSupportedSources(): PluginSource[] {
    this._ensureReady()
    return this.meta!.sources
  }

  getPluginType(): PluginType {
    this._ensureReady()
    return this.meta!.pluginType || 'music-source'
  }

  getConfigSchema(): PluginConfigField[] {
    this._ensureReady()
    return this.meta!.configSchema || []
  }

  /** 插件是否已被禁用（崩溃次数超阈值或重启失败）。 */
  isDisabled(): boolean {
    return this.disabled
  }

  // ---------- 音源类调用 ----------
  async getMusicUrl(source: string, musicInfo: MusicInfo, quality: string): Promise<string> {
    const songinfo = {
      ...musicInfo,
      id: musicInfo.songmid || (musicInfo as any).hash
    }
    return this._callPluginMethod('musicUrl', [source, songinfo, quality])
  }

  async getPic(source: string, musicInfo: MusicInfo): Promise<string> {
    return this._callPluginMethod('getPic', [source, musicInfo])
  }

  async getLyric(source: string, musicInfo: MusicInfo): Promise<string> {
    return this._callPluginMethod('getLyric', [source, musicInfo])
  }

  // ---------- 服务类调用 ----------
  async testConnection(
    config: Record<string, any>
  ): Promise<{ success: boolean; message: string }> {
    return this._callPluginMethod('testConnection', [config])
  }

  async getPlaylists(config: Record<string, any>): Promise<ServicePlaylist[]> {
    return this._callPluginMethod('getPlaylists', [config])
  }

  async getPlaylistSongs(
    config: Record<string, any>,
    playlistId: string
  ): Promise<PlaylistSongResult> {
    return this._callPluginMethod('getPlaylistSongs', [config, playlistId])
  }

  async getServiceLyric(config: Record<string, any>, songInfo: any): Promise<{ lyric: string }> {
    return this._callPluginMethod('getLyric', [config, songInfo])
  }

  /** 释放 worker 与所有 pending。卸载/更新插件时必须调用。 */
  async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer)
      this._throttleTimer = null
    }
    this._stopWatchdog()
    this._rejectAllPending(new PluginError('Plugin host destroyed'))
    if (this.worker) {
      try {
        await this.worker.terminate()
      } catch {}
      this.worker = null
    }
  }

  // ==================== 私有：worker 生命周期 ====================
  private async _spawn(): Promise<void> {
    if (!this.pluginCode) throw new PluginError('No plugin code provided.')
    if (this.destroyed) throw new PluginError('Plugin host has been destroyed')

    const worker = new Worker(WORKER_PATH)
    this.worker = worker

    worker.on('message', (msg) => this._onWorkerMessage(msg))
    worker.on('error', (err) => this._onWorkerError(err))
    worker.on('exit', (code) => this._onWorkerExit(code))

    // 发送 init 并等 init-ok
    const id = randomUUID()
    const initPromise = new Promise<PluginMeta>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new PluginError(`Plugin init timed out after ${CONSTANTS.INIT_TIMEOUT}ms`))
      }, CONSTANTS.INIT_TIMEOUT)
      this.pending.set(id, {
        resolve: (data: any) => resolve(data),
        reject,
        timer,
        method: 'init'
      })
    })

    worker.postMessage({
      id,
      type: 'init',
      pluginCode: this.pluginCode,
      pluginId: this.pluginId || ''
    })

    try {
      this.meta = await initPromise
      this.lastHeartbeat = Date.now()
      this._startWatchdog()
      this.logger.log(
        `${CONSTANTS.LOG_PREFIX} Plugin "${this.meta.pluginInfo?.name}" loaded successfully.`
      )
    } catch (err: any) {
      // init 失败，清掉这个 worker
      try {
        await worker.terminate()
      } catch {}
      this.worker = null
      throw new PluginError('无法初始化澜音插件,可能是插件格式不正确. ' + err.message)
    }
  }

  private _startWatchdog(): void {
    this._stopWatchdog()
    this.watchdogTimer = setInterval(() => {
      if (this.destroyed || !this.worker) return
      const elapsed = Date.now() - this.lastHeartbeat
      if (elapsed > CONSTANTS.HEARTBEAT_TIMEOUT) {
        pluginLog.error(
          `${CONSTANTS.LOG_PREFIX} 插件 ${this.pluginId} worker 心跳丢失 ${elapsed}ms，判定为卡死`
        )
        this._stopWatchdog()
        this._terminateAndRespawn(`heartbeat lost ${elapsed}ms`).catch(() => {})
      }
    }, CONSTANTS.HEARTBEAT_CHECK_INTERVAL)
    this.watchdogTimer.unref?.()
  }

  private _stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
  }

  private async _terminateAndRespawn(reason: string): Promise<void> {
    pluginLog.warn(`${CONSTANTS.LOG_PREFIX} 插件 worker 被强杀: ${reason}`)
    this._stopWatchdog()
    this._rejectAllPending(new PluginError(`Plugin worker terminated: ${reason}`))
    if (this.worker) {
      try {
        await this.worker.terminate()
      } catch {}
      this.worker = null
    }

    this.crashCount++
    if (this.crashCount >= CONSTANTS.CRASH_LIMIT) {
      const disableReason = `crashed ${this.crashCount} times: ${reason}`
      pluginLog.error(
        `${CONSTANTS.LOG_PREFIX} 插件 ${this.pluginId} 崩溃次数过多，已禁用直到下次手动加载`
      )
      this._markDisabled(disableReason)
      return
    }

    if (this.destroyed) return
    try {
      await this._spawn()
    } catch (err: any) {
      pluginLog.error(`${CONSTANTS.LOG_PREFIX} 重启插件 worker 失败: ${err.message}`)
      this._markDisabled(`respawn failed: ${err.message}`)
    }
  }

  private _markDisabled(reason: string): void {
    if (this.disabled) return
    this.disabled = true
    this._stopWatchdog()
    try {
      this.onDisabled?.(this.pluginId ?? '', reason)
    } catch (e: any) {
      pluginLog.error(`${CONSTANTS.LOG_PREFIX} onDisabled 回调失败: ${e?.message}`)
    }
  }

  private _rejectAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }

  // ==================== 私有：消息处理 ====================
  private _onWorkerMessage(msg: any): void {
    if (!msg || typeof msg !== 'object') return

    // heartbeat — 任何 worker 消息都应当顺便刷新 lastHeartbeat，
    // 但 heartbeat 是专门的轻量事件，不需要进 RPC 分支。
    if (msg.type === 'heartbeat') {
      this.lastHeartbeat = Date.now()
      return
    }
    // 任何其他响应也算 worker 还活着
    this.lastHeartbeat = Date.now()

    // 带 id 的 RPC 响应
    if (msg.id && (msg.type === 'init-ok' || msg.type === 'result' || msg.type === 'error')) {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)
      clearTimeout(pending.timer)
      if (msg.type === 'init-ok') {
        pending.resolve(msg.meta)
      } else if (msg.type === 'result') {
        pending.resolve(msg.data)
      } else if (msg.type === 'error') {
        pending.reject(
          new PluginError(msg.error?.message || 'Plugin error', msg.error?.method || pending.method)
        )
      }
      return
    }

    // 广播事件
    if (msg.type === 'log') {
      const level = msg.level as 'log' | 'info' | 'warn' | 'error'
      const args = Array.isArray(msg.args) ? msg.args : []
      try {
        ;(this.logger as any)[level]?.(...args)
      } catch {}
      return
    }

    if (msg.type === 'notice') {
      try {
        if (this.meta?.pluginInfo) {
          sendPluginNotice(
            {
              type: msg.noticeType,
              data: msg.data,
              currentVersion: this.meta.pluginInfo.version,
              pluginId: this.pluginId
            },
            this.meta.pluginInfo.name
          )
        }
      } catch {}
      return
    }

    if (msg.type === 'throttle') {
      const reason: string = String(msg.reason ?? '')
      const duration: number | undefined = msg.duration
      this._throttled = true
      this._throttleReason = reason
      pluginLog.warn(
        `${CONSTANTS.LOG_PREFIX} 插件请求已暂停，原因: ${reason}${duration ? `，将在 ${duration}ms 后恢复` : ''}`
      )

      if (this._throttleTimer) {
        clearTimeout(this._throttleTimer)
        this._throttleTimer = null
      }

      this.onThrottle?.(this.pluginId ?? '', reason, duration)

      if (duration && duration > 0) {
        this._throttleTimer = setTimeout(() => {
          this._throttled = false
          this._throttleReason = ''
          this._throttleTimer = null
          pluginLog.log(`${CONSTANTS.LOG_PREFIX} 插件请求冷却结束，已恢复`)
        }, duration)
      }
      return
    }
  }

  private _onWorkerError(err: Error): void {
    pluginLog.error(`${CONSTANTS.LOG_PREFIX} worker 错误:`, err?.message || err)
    this._rejectAllPending(new PluginError(`Worker error: ${err?.message || err}`))
  }

  private _onWorkerExit(code: number): void {
    if (this.destroyed) return
    if (this.worker === null) return
    pluginLog.warn(`${CONSTANTS.LOG_PREFIX} worker 退出 code=${code}`)
    this._rejectAllPending(new PluginError(`Worker exited with code ${code}`))
    this.worker = null
  }

  // ==================== 私有：调用 ====================
  private _ensureReady(): void {
    if (!this.meta) {
      throw new PluginError('Plugin not initialized')
    }
  }

  private async _callPluginMethod(method: string, args: any[]): Promise<any> {
    this._ensureReady()
    if (this.disabled) {
      throw new PluginError(`Plugin is disabled due to repeated crashes`, method)
    }

    if (this._throttled) {
      pluginLog.warn(
        `${CONSTANTS.LOG_PREFIX} 插件已暂停请求，跳过 ${method} 调用。原因: ${this._throttleReason}`
      )
      throw new PluginError(`Plugin requests paused: ${this._throttleReason}`, method)
    }

    if (!this.meta!.hasMethods?.[method]) {
      throw new PluginError(`Action "${method}" is not implemented in plugin.`, method)
    }

    if (!this.worker) {
      throw new PluginError(`Plugin worker is not running`, method)
    }

    pluginLog.log(`${CONSTANTS.LOG_PREFIX} 开始调用插件的 ${method} 方法...`)
    const id = randomUUID()
    const worker = this.worker

    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        const errMsg = `Plugin ${method} timed out after ${CONSTANTS.INVOKE_TIMEOUT}ms`
        pluginLog.error(`${CONSTANTS.LOG_PREFIX} ${errMsg}`)
        // 强杀 + 重启
        this._terminateAndRespawn(`${method} timeout`).catch(() => {})
        reject(new PluginError(errMsg, method))
      }, CONSTANTS.INVOKE_TIMEOUT)

      this.pending.set(id, {
        resolve: (data: any) => {
          pluginLog.log(`${CONSTANTS.LOG_PREFIX} 插件 ${method} 方法调用成功`)
          resolve(data)
        },
        reject: (err: any) => {
          pluginLog.error(`${CONSTANTS.LOG_PREFIX} ${method} 方法执行失败:`, err?.message)
          reject(err)
        },
        timer,
        method
      })

      try {
        worker.postMessage({ id, type: 'invoke', method, args })
      } catch (err: any) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(new PluginError(`Failed to dispatch ${method}: ${err.message}`, method))
      }
    })
  }
}

export default CeruMusicPluginHost
