/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * Plugin sandbox worker.
 * Runs untrusted third-party plugin code in an isolated worker_thread + vm sandbox.
 * Communicates with main thread via parentPort RPC.
 */

import * as vm from 'vm'
import * as crypto from 'crypto'
import { parentPort, isMainThread } from 'worker_threads'
import fetch from 'node-fetch'

if (isMainThread) {
  throw new Error('pluginWorker.ts must be run inside a worker_thread')
}

const port = parentPort!

const API_VERSION = '1.0.4'
const ENVIRONMENT = 'nodejs'
const DEFAULT_REQUEST_TIMEOUT = 10_000
const INIT_SYNC_TIMEOUT = 5_000

// Log-bomb 防御：每个滑动窗口（1 秒）内最多放过这么多条 log。
// 超出后直接丢弃 — 不去尝试格式化、不去 postMessage，避免插件死循环把主进程内存打爆。
const LOG_RATE_PER_SECOND = 50
const NOTICE_RATE_PER_SECOND = 20
const THROTTLE_RATE_PER_SECOND = 5

// ==================== RPC types ====================
type InboundMsg =
  | { id: string; type: 'init'; pluginCode: string; pluginId: string }
  | { id: string; type: 'invoke'; method: string; args: any[]; timeout?: number }

type OutboundMsg =
  | {
      id: string
      type: 'init-ok'
      meta: {
        pluginInfo: any
        sources: any
        pluginType: string
        configSchema: any
        hasMethods: Record<string, boolean>
      }
    }
  | { id: string; type: 'result'; data: any }
  | {
      id: string
      type: 'error'
      error: { name: string; message: string; stack?: string; method?: string }
    }
  | { type: 'log'; level: 'log' | 'info' | 'warn' | 'error'; args: any[] }
  | { type: 'notice'; noticeType: string; data: any }
  | { type: 'throttle'; reason: string; duration?: number }
  | { type: 'heartbeat'; ts: number }

function send(msg: OutboundMsg): void {
  port.postMessage(msg)
}

// ==================== 速率限制 ====================
// 防御插件 log/notice 死循环把主进程 IPC 队列打爆。
// 超出窗口阈值后丢弃，并仅在窗口切换时打一条系统级提示。
class RateLimiter {
  private windowStart = 0
  private count = 0
  private droppedInWindow = 0
  private readonly limit: number

  constructor(limit: number) {
    this.limit = limit
  }

  /** 返回 true 表示放行，false 表示应丢弃。 */
  allow(now: number): boolean {
    if (now - this.windowStart >= 1000) {
      this.windowStart = now
      this.count = 0
      this.droppedInWindow = 0
    }
    if (this.count < this.limit) {
      this.count++
      return true
    }
    this.droppedInWindow++
    return false
  }

  /** 当前窗口内被丢弃的次数，用于在恢复时输出聚合提示。 */
  consumeDropped(): number {
    const n = this.droppedInWindow
    this.droppedInWindow = 0
    return n
  }
}

const logLimiter = new RateLimiter(LOG_RATE_PER_SECOND)
const noticeLimiter = new RateLimiter(NOTICE_RATE_PER_SECOND)
const throttleLimiter = new RateLimiter(THROTTLE_RATE_PER_SECOND)

// ==================== sandbox state ====================
let sandboxContext: vm.Context | null = null
let pluginExports: any = null
let pluginId = ''

// ==================== cerumusic API ====================
function buildCerumusicApi(): any {
  const validateEncoding = (encoding?: BufferEncoding): BufferEncoding => {
    const supportedEncodings = ['base64', 'hex', 'utf8']
    if (encoding && !supportedEncodings.includes(encoding)) {
      throw new Error(
        `Unsupported encoding: ${encoding}. Only ${supportedEncodings.join(', ')} are supported.`
      )
    }
    return encoding || 'utf8'
  }

  const validateAesMode = (mode: string): string => {
    const supportedModes = ['aes-128-cbc', 'aes-128-ecb']
    if (!supportedModes.includes(mode)) {
      throw new Error(
        `Unsupported AES mode: ${mode}. Only ${supportedModes.join(', ')} are supported.`
      )
    }
    return mode
  }

  const utils = {
    buffer: {
      from: (data: any, encoding?: BufferEncoding) => {
        if (typeof data === 'string') {
          return Buffer.from(data, validateEncoding(encoding))
        } else if (data instanceof Buffer) {
          return data
        } else if (data instanceof ArrayBuffer) {
          return Buffer.from(new Uint8Array(data))
        }
        return Buffer.from(data)
      },
      bufToString: (buffer: Buffer, encoding?: BufferEncoding) => {
        return buffer.toString(validateEncoding(encoding))
      }
    },
    crypto: {
      aesEncrypt: (data: any, mode: string, key: any, iv?: any) => {
        const validatedMode = validateAesMode(mode)
        const cipher = crypto.createCipheriv(
          validatedMode,
          key,
          validatedMode === 'aes-128-ecb' ? Buffer.alloc(0) : iv || Buffer.alloc(0)
        )
        let encrypted: Buffer
        if (typeof data === 'string') {
          encrypted = cipher.update(data, 'utf8')
        } else if (Buffer.isBuffer(data)) {
          encrypted = cipher.update(data)
        } else {
          encrypted = cipher.update(JSON.stringify(data), 'utf8')
        }
        return Buffer.concat([encrypted, cipher.final()])
      },
      md5: (str: string) => crypto.createHash('md5').update(str).digest('hex'),
      randomBytes: (size: number) => crypto.randomBytes(size),
      rsaEncrypt: (data: string, key: string) => {
        const encrypted = crypto.publicEncrypt(
          { key, padding: crypto.constants.RSA_PKCS1_PADDING },
          Buffer.from(data, 'utf8')
        )
        return encrypted.toString('base64')
      }
    }
  }

  const request = async (url: string, options?: any, callback?: any): Promise<any> => {
    if (typeof options === 'function') {
      callback = options
      options = { method: 'GET' }
    }
    const opts = options || { method: 'GET' }
    const timeout = opts.timeout || DEFAULT_REQUEST_TIMEOUT
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)

    const exec = async () => {
      try {
        const response = await fetch(url, { method: 'GET', ...opts, signal: controller.signal })
        clearTimeout(timer)
        const body = await parseBody(response)
        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          headers[key] = value
        })
        return { body, statusCode: response.status, headers }
      } catch (err: any) {
        clearTimeout(timer)
        const isTimeout = err?.name === 'AbortError'
        return {
          body: { error: err?.name || 'RequestError', message: err?.message, url },
          statusCode: isTimeout ? 408 : 500,
          headers: {}
        }
      }
    }

    if (callback) {
      exec()
        .then((result) => callback(null, result))
        .catch((error) => callback(error, null))
      return undefined as any
    }
    return exec()
  }

  const NoticeCenter = (type: string, data: any): void => {
    if (!noticeLimiter.allow(Date.now())) return
    try {
      send({ type: 'notice', noticeType: type, data })
    } catch {}
  }

  const stopRequests = (reason: string, duration?: number): void => {
    if (!throttleLimiter.allow(Date.now())) return
    try {
      send({ type: 'throttle', reason: String(reason ?? ''), duration })
    } catch {}
  }

  return {
    env: ENVIRONMENT,
    version: API_VERSION,
    utils,
    request,
    NoticeCenter,
    stopRequests
  }
}

async function parseBody(response: any): Promise<any> {
  const contentType = response.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) return await response.json()
    if (contentType.includes('text/')) return await response.text()
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (err: any) {
    return { error: 'Parse failed', message: err?.message, statusCode: response.status }
  }
}

// ==================== console proxy ====================
function buildConsoleProxy(): any {
  const make =
    (level: 'log' | 'info' | 'warn' | 'error') =>
    (...args: any[]) => {
      // 限流：插件 while(true) console.log(...) 时丢弃多余日志，避免主进程 IPC 队列爆炸
      if (!logLimiter.allow(Date.now())) return
      try {
        const safeArgs = args.map(stringifyForLog)
        send({ type: 'log', level, args: safeArgs })
      } catch {}
    }
  return {
    log: make('log'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
    debug: make('log'),
    trace: make('log'),
    group: make('log'),
    groupEnd: make('log')
  }
}

function stringifyForLog(arg: any): any {
  if (arg === null || arg === undefined) return arg
  const t = typeof arg
  if (t === 'string' || t === 'number' || t === 'boolean') return arg
  if (arg instanceof Error) return arg.message
  try {
    return JSON.parse(JSON.stringify(arg))
  } catch {
    return String(arg)
  }
}

// ==================== timer wrappers ====================
const activeTimers = new Set<NodeJS.Timeout>()

function buildTimerApis() {
  const wrappedSetTimeout = (cb: any, ms?: number, ...args: any[]) => {
    const t = setTimeout(
      (...a: any[]) => {
        activeTimers.delete(t)
        try {
          cb(...a)
        } catch (e: any) {
          send({ type: 'log', level: 'error', args: ['[plugin-timer]', e?.message || String(e)] })
        }
      },
      ms,
      ...args
    )
    activeTimers.add(t)
    return t
  }
  const wrappedClearTimeout = (t: any) => {
    if (t) activeTimers.delete(t)
    clearTimeout(t)
  }
  const wrappedSetInterval = (cb: any, ms?: number, ...args: any[]) => {
    const t = setInterval(
      (...a: any[]) => {
        try {
          cb(...a)
        } catch (e: any) {
          send({
            type: 'log',
            level: 'error',
            args: ['[plugin-interval]', e?.message || String(e)]
          })
        }
      },
      ms,
      ...args
    )
    activeTimers.add(t)
    return t
  }
  const wrappedClearInterval = (t: any) => {
    if (t) activeTimers.delete(t)
    clearInterval(t)
  }
  return { wrappedSetTimeout, wrappedClearTimeout, wrappedSetInterval, wrappedClearInterval }
}

// ==================== sandbox creation ====================
function createSandbox(): vm.Context {
  const moduleObj = { exports: {} as any }
  const cerumusic = buildCerumusicApi()
  const consoleProxy = buildConsoleProxy()
  const timers = buildTimerApis()

  const sandbox: Record<string, any> = {
    module: moduleObj,
    exports: moduleObj.exports,
    cerumusic,
    console: consoleProxy,
    setTimeout: timers.wrappedSetTimeout,
    clearTimeout: timers.wrappedClearTimeout,
    setInterval: timers.wrappedSetInterval,
    clearInterval: timers.wrappedClearInterval,
    Buffer,
    JSON,
    Math,
    Date,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Promise,
    require: (_name: string) => {
      throw new Error('require() is not available in plugin sandbox')
    }
  }

  const ctx = vm.createContext(sandbox, {
    name: `plugin-sandbox:${pluginId || 'unknown'}`,
    codeGeneration: {
      strings: true,
      wasm: false
    }
  })

  // Hardening: freeze a few well-known constructors so plugin code cannot reach
  // host realm via prototype chain (Buffer.constructor.constructor("return process")...)
  // Note: vm.createContext gives the sandbox its own globalThis/Object/Function realm,
  // but the Buffer reference we passed in is from the host realm. Freeze it.
  vm.runInContext(
    `
    'use strict';
    try {
      const guarded = [Buffer, Promise, Date, URL, URLSearchParams, TextEncoder, TextDecoder];
      for (const c of guarded) {
        try { Object.freeze(c); } catch (_) {}
        try { Object.freeze(c.prototype); } catch (_) {}
      }
    } catch (_) {}
    `,
    ctx,
    { timeout: 1000 }
  )

  return ctx
}

// ==================== init ====================
function initSandbox(pluginCode: string): {
  pluginInfo: any
  sources: any
  pluginType: string
  configSchema: any
  hasMethods: Record<string, boolean>
} {
  sandboxContext = createSandbox()

  // Reset module.exports right before run, in case plugin code re-binds.
  vm.runInContext(`module.exports = {}; exports = module.exports;`, sandboxContext, {
    timeout: 1000
  })

  // Run plugin code with a hard timeout for sync portion (catches `while(true)` at init).
  vm.runInContext(pluginCode, sandboxContext, {
    timeout: INIT_SYNC_TIMEOUT,
    displayErrors: true
  })

  pluginExports = (sandboxContext as any).module?.exports
  if (!pluginExports || typeof pluginExports !== 'object') {
    throw new Error('Plugin did not export a module.exports object')
  }
  if (!pluginExports.pluginInfo) {
    throw new Error('Invalid plugin structure. Required field: pluginInfo')
  }

  const pluginType: string = pluginExports.pluginType || 'music-source'
  if (pluginType !== 'service') {
    if (!pluginExports.sources || typeof pluginExports.musicUrl !== 'function') {
      throw new Error('Invalid plugin structure. Required fields: pluginInfo, sources, musicUrl')
    }
  }

  // Snapshot metadata for the host. Strip functions; only keep serializable shape.
  const safeSerialize = (v: any) => {
    try {
      return JSON.parse(JSON.stringify(v))
    } catch {
      return null
    }
  }

  return {
    pluginInfo: safeSerialize(pluginExports.pluginInfo),
    sources: safeSerialize(pluginExports.sources) || [],
    pluginType,
    configSchema: safeSerialize(pluginExports.configSchema) || [],
    hasMethods: {
      musicUrl: typeof pluginExports.musicUrl === 'function',
      getPic: typeof pluginExports.getPic === 'function',
      getLyric: typeof pluginExports.getLyric === 'function',
      testConnection: typeof pluginExports.testConnection === 'function',
      getPlaylists: typeof pluginExports.getPlaylists === 'function',
      getPlaylistSongs: typeof pluginExports.getPlaylistSongs === 'function',
      onConfigUpdate: typeof pluginExports.onConfigUpdate === 'function'
    }
  }
}

// ==================== invoke ====================
async function invokeMethod(method: string, args: any[]): Promise<any> {
  if (!pluginExports) {
    throw new Error('Plugin not initialized')
  }
  const fn = pluginExports[method]
  if (typeof fn !== 'function') {
    throw new Error(`Action "${method}" is not implemented in plugin`)
  }
  // Bind cerumusic API as `this.cerumusic` (matches the previous host behavior).
  const cerumusic = (sandboxContext as any).cerumusic
  return await fn.call({ cerumusic }, ...args)
}

// ==================== message handling ====================
port.on('message', async (msg: InboundMsg) => {
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'init') {
    pluginId = msg.pluginId
    try {
      const meta = initSandbox(msg.pluginCode)
      send({ id: msg.id, type: 'init-ok', meta })
    } catch (err: any) {
      send({
        id: msg.id,
        type: 'error',
        error: {
          name: err?.name || 'InitError',
          message: err?.message || String(err),
          stack: err?.stack
        }
      })
    }
    return
  }

  if (msg.type === 'invoke') {
    try {
      const data = await invokeMethod(msg.method, msg.args || [])
      send({ id: msg.id, type: 'result', data })
    } catch (err: any) {
      send({
        id: msg.id,
        type: 'error',
        error: {
          name: err?.name || 'PluginError',
          message: err?.message || String(err),
          stack: err?.stack,
          method: msg.method
        }
      })
    }
    return
  }
})

port.on('close', () => {
  for (const t of activeTimers) {
    try {
      clearTimeout(t)
      clearInterval(t)
    } catch {}
  }
  activeTimers.clear()
})

// ==================== watchdog heartbeat ====================
// 每秒回一次 heartbeat。如果插件代码用 while(true) 把 worker 主线程卡死，
// 心跳会停发，主线程 watchdog 检测到就 terminate worker。
// 用真 setInterval（避开 sandbox 的包装版），unref 让它不阻止退出。
const heartbeatTimer = setInterval(() => {
  try {
    send({ type: 'heartbeat', ts: Date.now() })
  } catch {}
}, 1000)
heartbeatTimer.unref?.()
