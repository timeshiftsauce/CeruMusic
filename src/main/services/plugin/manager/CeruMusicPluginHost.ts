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
// 调整说明（修复「插件被无故禁用」bug）：
//  - INVOKE_TIMEOUT: 单次插件方法的最长等待。网络慢的歌单/歌词接口经常>15s，
//    放宽到 30s。这只影响该次调用 reject，不再直接强杀 worker。
//  - HEARTBEAT_TIMEOUT: 心跳每 1s 一次，原 5s 太激进；系统繁忙/休眠唤醒/
//    主进程 GC 都会瞬间触发误判。放宽到 15s，足够覆盖大多数抖动。
//  - HEARTBEAT_GRACE_AFTER_WAKE: 进程时间 vs 墙钟时间出现大跳变（典型表现：
//    系统休眠唤醒），watchdog 给一次宽限，刷新 lastHeartbeat 而不是直接强杀。
//  - CRASH_LIMIT: 上调到 5，并配合 CRASH_DECAY_MS 让 crashCount 随时间衰减，
//    避免长会话里偶发抖动累积导致永久禁用。
const CONSTANTS = {
  INVOKE_TIMEOUT: 30_000,
  INIT_TIMEOUT: 8_000,
  CRASH_LIMIT: 5,
  /** crashCount 衰减窗口：worker 稳定运行 5 分钟后衰减一次。 */
  CRASH_DECAY_MS: 5 * 60_000,
  HEARTBEAT_TIMEOUT: 15_000,
  HEARTBEAT_CHECK_INTERVAL: 2_000,
  /** 检测到 setInterval 实际间隔远大于预期（休眠唤醒）时的最小跳变阈值。 */
  WAKE_JUMP_THRESHOLD: 10_000,
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
  type: 'text' | 'password' | 'number' | 'select' | 'switch'
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
  serviceRole?: string
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
  /** 上次 watchdog tick 的时间戳，用于检测系统休眠/进程冻结导致的时钟跳变。 */
  private lastWatchdogTick = 0
  private watchdogTimer: ReturnType<typeof setInterval> | null = null
  private crashDecayTimer: ReturnType<typeof setInterval> | null = null

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

  getServiceRole(): string | undefined {
    this._ensureReady()
    return this.meta!.serviceRole
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
    // 同 _terminateAndRespawn：先置空再 terminate。
    // 这里 destroyed=true 已经能让 _onWorkerExit 提前返回，置空只是统一防御模式。
    const dyingWorker = this.worker
    this.worker = null
    if (dyingWorker) {
      try {
        await dyingWorker.terminate()
      } catch {}
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
      // init 失败，清掉这个 worker。
      // 必须先把 this.worker 置空再 terminate，否则 terminate() 触发的 exit
      // 事件会落入 _onWorkerExit 的"非预期退出"分支，被错误地累加 crashCount
      // 并触发自动 respawn，导致 init 失败连锁雪崩式禁用。
      this.worker = null
      try {
        await worker.terminate()
      } catch {}
      throw new PluginError('无法初始化澜音插件,可能是插件格式不正确. ' + err.message)
    }
  }

  private _startWatchdog(): void {
    this._stopWatchdog()
    this.lastWatchdogTick = Date.now()
    this.watchdogTimer = setInterval(() => {
      if (this.destroyed || !this.worker) return
      const now = Date.now()
      // 检测主线程时钟跳变（系统休眠唤醒、长 GC 暂停、调试器断点等）。
      // 此时 worker 心跳定时器也被冻结，elapsed 会假性超时，必须跳过本轮判断。
      const tickGap = now - this.lastWatchdogTick
      this.lastWatchdogTick = now
      const expectedGap = CONSTANTS.HEARTBEAT_CHECK_INTERVAL
      if (tickGap > expectedGap + CONSTANTS.WAKE_JUMP_THRESHOLD) {
        pluginLog.warn(
          `${CONSTANTS.LOG_PREFIX} 检测到主线程时钟跳变 ${tickGap}ms（疑似系统休眠/冻结），跳过本轮心跳检查`
        )
        // 重置心跳基线，等待 worker 自然恢复发送。
        this.lastHeartbeat = now
        return
      }

      const elapsed = now - this.lastHeartbeat
      if (elapsed > CONSTANTS.HEARTBEAT_TIMEOUT) {
        pluginLog.error(
          `${CONSTANTS.LOG_PREFIX} 插件 ${this.pluginId} worker 心跳丢失 ${elapsed}ms，判定为卡死`
        )
        this._stopWatchdog()
        this._terminateAndRespawn(`heartbeat lost ${elapsed}ms`).catch(() => {})
      }
    }, CONSTANTS.HEARTBEAT_CHECK_INTERVAL)
    this.watchdogTimer.unref?.()

    // 启动 crashCount 衰减：worker 持续稳定运行就缓慢恢复信用。
    this._startCrashDecay()
  }

  private _stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer)
      this.watchdogTimer = null
    }
    this._stopCrashDecay()
  }

  /**
   * crashCount 不能单调累加，否则长会话里偶发抖动会累积到禁用阈值。
   * 这里让它每 CRASH_DECAY_MS 衰减 1。
   */
  private _startCrashDecay(): void {
    this._stopCrashDecay()
    this.crashDecayTimer = setInterval(() => {
      if (this.destroyed) return
      if (this.crashCount <= 0) return
      const before = this.crashCount
      this.crashCount = Math.max(0, this.crashCount - 1)
      pluginLog.log(
        `${CONSTANTS.LOG_PREFIX} 插件 ${this.pluginId} 运行稳定，crashCount 衰减 ${before} -> ${this.crashCount}`
      )
    }, CONSTANTS.CRASH_DECAY_MS)
    this.crashDecayTimer.unref?.()
  }

  private _stopCrashDecay(): void {
    if (this.crashDecayTimer) {
      clearInterval(this.crashDecayTimer)
      this.crashDecayTimer = null
    }
  }

  private async _terminateAndRespawn(reason: string): Promise<void> {
    pluginLog.warn(`${CONSTANTS.LOG_PREFIX} 插件 worker 被强杀: ${reason}`)
    this._stopWatchdog()
    this._rejectAllPending(new PluginError(`Plugin worker terminated: ${reason}`))
    // 先把字段置空，让 terminate() 触发的 exit 事件落入 "受控终止" 分支
    // （_onWorkerExit 看到 this.worker === null 就 early return），
    // 避免与 crashCount++ 重复计数。
    const dyingWorker = this.worker
    this.worker = null
    if (dyingWorker) {
      try {
        await dyingWorker.terminate()
      } catch {}
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
      // 包含 group / groupEnd / debug 等扩展级别，全部转发给 Logger
      const level = msg.level as
        | 'log'
        | 'info'
        | 'warn'
        | 'error'
        | 'debug'
        | 'group'
        | 'groupEnd'
      const args = Array.isArray(msg.args) ? msg.args : []
      try {
        const fn = (this.logger as any)[level]
        if (typeof fn === 'function') {
          fn.apply(this.logger, args)
        } else {
          // logger 没实现该级别时 fallback 到 log
          ;(this.logger as any).log?.apply(this.logger, args)
        }
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
    // worker 字段已被 _terminateAndRespawn 主动清空 → 说明是受控终止，
    // respawn 流程会自己重启，这里不要重复处理。
    if (this.worker === null) return
    pluginLog.warn(`${CONSTANTS.LOG_PREFIX} worker 非预期退出 code=${code}`)
    this._rejectAllPending(new PluginError(`Worker exited with code ${code}`))
    this.worker = null
    this._stopWatchdog()

    // 非预期退出 = 一次崩溃。走与 watchdog 同样的累计/衰减/respawn 路径，
    // 避免出现 "worker 死了但 disabled=false、调用永远抛 not running" 的僵尸状态。
    this.crashCount++
    if (this.crashCount >= CONSTANTS.CRASH_LIMIT) {
      const reason = `worker exited ${this.crashCount} times (last code=${code})`
      pluginLog.error(
        `${CONSTANTS.LOG_PREFIX} 插件 ${this.pluginId} 退出次数过多，已禁用直到下次手动加载`
      )
      this._markDisabled(reason)
      return
    }

    pluginLog.warn(
      `${CONSTANTS.LOG_PREFIX} 尝试自动重启插件 ${this.pluginId}（第 ${this.crashCount}/${CONSTANTS.CRASH_LIMIT} 次）`
    )
    // 异步重启，不阻塞当前事件循环。
    this._spawn().catch((err: any) => {
      pluginLog.error(`${CONSTANTS.LOG_PREFIX} 自动重启 worker 失败: ${err?.message}`)
      this._markDisabled(`auto-respawn failed: ${err?.message}`)
    })
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
        // 仅当 worker 同时心跳丢失（真卡死）才强杀重启；
        // 单次 HTTP 慢不应等同 worker 崩溃，否则插件极易被无故禁用。
        const heartbeatElapsed = Date.now() - this.lastHeartbeat
        if (heartbeatElapsed > CONSTANTS.HEARTBEAT_TIMEOUT) {
          pluginLog.error(
            `${CONSTANTS.LOG_PREFIX} ${method} 超时且心跳丢失 ${heartbeatElapsed}ms，强杀 worker`
          )
          this._terminateAndRespawn(`${method} timeout + heartbeat lost`).catch(() => {})
        } else {
          pluginLog.warn(
            `${CONSTANTS.LOG_PREFIX} ${method} 超时但 worker 仍存活，仅 reject 本次调用`
          )
        }
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
