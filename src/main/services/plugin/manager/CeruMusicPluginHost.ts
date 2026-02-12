/*
 * Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
 *
 * This software is the confidential and proprietary information of 时迁酱.
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 *
 * @author 时迁酱，无聊的霜霜，Star
 * @since 2025-9-19
 * @version 1.0
 */

import * as vm from 'vm'
import fetch from 'node-fetch'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { MusicItem } from '../../musicSdk/type'
import { sendPluginNotice } from '../../../events/pluginNotice'
import { pluginLog } from '../../../logger'

// ==================== 常量定义 ====================
const CONSTANTS = {
  DEFAULT_TIMEOUT: 10000, // 10秒超时
  API_VERSION: '1.0.3',
  ENVIRONMENT: 'nodejs',
  NOTICE_DELAY: 100, // 通知延迟时间
  LOG_PREFIX: '[CeruMusic]'
} as const

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

interface CeruMusicPlugin {
  pluginInfo: PluginInfo
  sources: PluginSource[]
  musicUrl: (source: string, musicInfo: MusicInfo, quality: string) => Promise<string>
  getPic?: (source: string, musicInfo: MusicInfo) => Promise<string>
  getLyric?: (source: string, musicInfo: MusicInfo) => Promise<string>
}

interface MusicInfo extends MusicItem {
  id?: string
}

interface RequestResult {
  body: any
  statusCode: number
  headers: Record<string, string>
}

interface CeruMusicApiUtils {
  buffer: {
    from: (data: string | Buffer | ArrayBuffer, encoding?: BufferEncoding) => Buffer
    bufToString: (buffer: Buffer, encoding?: BufferEncoding) => string
  }
  crypto: {
    aesEncrypt: (data: any, mode: string, key: string | Buffer, iv?: string | Buffer) => Buffer
    md5: (str: string) => string
    randomBytes: (size: number) => Buffer
    rsaEncrypt: (data: string, key: string) => string
  }
}

interface CeruMusicApi {
  env: string
  version: string
  utils: CeruMusicApiUtils
  request: (
    url: string,
    options?: RequestOptions | RequestCallback,
    callback?: RequestCallback
  ) => Promise<RequestResult> | void
  NoticeCenter: (
    type: 'error' | 'info' | 'success' | 'warn' | 'update',
    data: {
      title: string
      content?: string
      url?: string
      version?: string
      pluginInfo: {
        name?: string // 插件名
        type: 'lx' | 'cr' //插件类型
      }
    }
  ) => void
}

type RequestOptions = {
  method?: string
  headers?: Record<string, string>
  body?: any
  timeout?: number
  [key: string]: any
}

type RequestCallback = (error: Error | null, result: RequestResult | null) => void

type Logger = {
  log: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  info: (...args: any[]) => void
}

type PluginMethodName = 'musicUrl' | 'getPic' | 'getLyric'

// ==================== 错误类定义 ====================
class PluginError extends Error {
  constructor(
    message: string,
    public readonly method?: string
  ) {
    super(message)
    this.name = 'PluginError'
  }
}

/**
 * CeruMusic 插件引擎
 * 负责加载和执行单个插件，并提供一个简洁的API。
 */
class CeruMusicPluginHost {
  private pluginCode: string | null
  private plugin: CeruMusicPlugin | null

  /**
   * 创建一个新的插件主机实例
   * @param pluginCode 插件的 JavaScript 代码字符串（可选）
   * @param logger 日志记录器
   */
  constructor(pluginCode: string | null = null, logger: Logger = console) {
    this.pluginCode = pluginCode
    this.plugin = null

    if (pluginCode) {
      this._initialize(logger)
    }
  }

  // ==================== 公共方法 ====================

  /**
   * 从文件加载插件
   * @param pluginPath 插件文件路径
   * @param logger 日志记录器
   */
  async loadPlugin(pluginPath: string, logger: Logger = console): Promise<CeruMusicPlugin> {
    try {
      this.pluginCode = fs.readFileSync(pluginPath, 'utf-8')
      this._initialize(logger)
      return this.plugin as CeruMusicPlugin
    } catch (error: any) {
      throw new PluginError(`无法加载插件 ${pluginPath}: ${error.message}`)
    }
  }

  /**
   * 获取插件信息
   */
  getPluginInfo(): PluginInfo {
    this._ensurePluginInitialized()
    return this.plugin!.pluginInfo
  }

  /**
   * 获取插件代码
   */
  getPluginCode(): string | null {
    return this.pluginCode
  }

  /**
   * 获取支持的音源和音质信息
   */
  getSupportedSources(): PluginSource[] {
    this._ensurePluginInitialized()
    return this.plugin!.sources
  }

  /**
   * 调用插件的 getMusicUrl 方法
   * @param source 音源标识
   * @param musicInfo 音乐信息
   * @param quality 音质
   */
  async getMusicUrl(source: string, musicInfo: MusicInfo, quality: string): Promise<string> {
    const songinfo = {
      ...musicInfo,
      id: musicInfo.songmid || musicInfo.hash
    }
    return this._callPluginMethod('musicUrl', source, songinfo, quality)
  }

  /**
   * 调用插件的 getPic 方法
   * @param source 音源标识
   * @param musicInfo 音乐信息
   */
  async getPic(source: string, musicInfo: MusicInfo): Promise<string> {
    return this._callPluginMethod('getPic', source, musicInfo)
  }

  /**
   * 调用插件的 getLyric 方法
   * @param source 音源标识
   * @param musicInfo 音乐信息
   */
  async getLyric(source: string, musicInfo: MusicInfo): Promise<string> {
    return this._callPluginMethod('getLyric', source, musicInfo)
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化沙箱环境，加载并验证插件
   * @private
   */
  private _initialize(logger: Logger): void {
    if (!this.pluginCode) {
      throw new PluginError('No plugin code provided.')
    }

    const sandbox = this._createSandbox(logger)

    try {
      vm.runInNewContext(this.pluginCode, sandbox)
      this.plugin = sandbox.module.exports as CeruMusicPlugin

      this._validatePlugin()

      logger.log(
        `${CONSTANTS.LOG_PREFIX} Plugin "${this.plugin.pluginInfo.name}" loaded successfully.`
      )
    } catch (error: any) {
      logger.error(`${CONSTANTS.LOG_PREFIX} Error executing plugin code:`, error)
      throw new PluginError('无法初始化澜音插件,可能是插件格式不正确.' + error.message)
    }
  }

  /**
   * 创建沙箱环境
   * @private
   */
  private _createSandbox(logger: Logger): any {
    return {
      module: { exports: {} },
      cerumusic: this._getCerumusicApi(),
      console: logger,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Buffer,
      JSON,
      require: () => ({}),
      global: {},
      process: { env: {} }
    }
  }

  /**
   * 验证插件结构
   * @private
   */
  private _validatePlugin(): void {
    if (!this.plugin?.pluginInfo || !this.plugin.sources || !this.plugin.musicUrl) {
      throw new PluginError(
        'Invalid plugin structure. Required fields: pluginInfo, sources, musicUrl.'
      )
    }
  }

  /**
   * 确保插件已初始化
   * @private
   */
  private _ensurePluginInitialized(): void {
    if (!this.plugin) {
      throw new PluginError('Plugin not initialized')
    }
  }

  /**
   * 统一的插件方法调用逻辑
   * @private
   */
  private async _callPluginMethod(
    methodName: PluginMethodName,
    ...args: readonly any[]
  ): Promise<string> {
    this._ensurePluginInitialized()
    const method = this.plugin![methodName] as any
    if (typeof method !== 'function') {
      throw new PluginError(`Action "${methodName}" is not implemented in plugin.`, methodName)
    }
    try {
      pluginLog.log(`${CONSTANTS.LOG_PREFIX} 开始调用插件的 ${methodName} 方法...`)

      const result = await method.call(...[{ cerumusic: this._getCerumusicApi() }], ...args)

      pluginLog.log(`${CONSTANTS.LOG_PREFIX} 插件 ${methodName} 方法调用成功`)
      return result
    } catch (error: any) {
      pluginLog.error(`${CONSTANTS.LOG_PREFIX} ${methodName} 方法执行失败:`, error.message)
      if (methodName === 'musicUrl') {
        pluginLog.error(`${CONSTANTS.LOG_PREFIX} 错误堆栈:`, error.stack)
      }
      throw new PluginError(`Plugin ${methodName} failed: ${error.message}`, methodName)
    }
  }

  // ==================== 工具方法 ====================

  // /**
  //  * 验证 URL 是否有效
  //  * @private
  //  */
  // private _isValidUrl(url: string): boolean {
  //   try {
  //     const urlObj = new URL(url)
  //     return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  //   } catch {
  //     return false
  //   }
  // }

  // /**
  //  * 根据通知类型获取标题
  //  * @private
  //  */
  // private _getNoticeTitle(type: string): string {
  //   const titleMap: Record<string, string> = {
  //     update: '插件更新',
  //     error: '插件错误',
  //     warning: '插件警告',
  //     info: '插件信息',
  //     success: '操作成功'
  //   }
  //   return titleMap[type] || '插件通知'
  // }

  // /**
  //  * 根据通知类型获取默认消息
  //  * @private
  //  */
  // private _getDefaultMessage(type: string, data: any): string {
  //   const pluginName = this.plugin?.pluginInfo?.name || '未知插件'

  //   switch (type) {
  //     case 'error':
  //       return `插件 "${pluginName}" 发生错误: ${data?.error || '未知错误'}`
  //     case 'warning':
  //       return `插件 "${pluginName}" 警告: ${data?.warning || '需要注意'}`
  //     case 'success':
  //       return `插件 "${pluginName}" 操作成功`
  //     case 'info':
  //     default:
  //       return `插件 "${pluginName}" 信息: ${JSON.stringify(data)}`
  //   }
  // }

  /**
   * 解析响应体
   * @private
   */
  private async _parseResponseBody(response: any): Promise<any> {
    const contentType = response.headers.get('content-type') || ''

    try {
      if (contentType.includes('application/json')) {
        return await response.json()
      } else if (contentType.includes('text/')) {
        return await response.text()
      } else {
        // 对于其他类型，尝试解析为 JSON，失败则返回文本
        const text = await response.text()
        try {
          return JSON.parse(text)
        } catch {
          return text
        }
      }
    } catch (parseError: any) {
      console.error(`${CONSTANTS.LOG_PREFIX} 解析响应失败: ${parseError.message}`)
      return {
        error: 'Parse failed',
        message: parseError.message,
        statusCode: response.status
      }
    }
  }

  /**
   * 创建错误结果
   * @private
   */
  private _createErrorResult(error: any, url: string): RequestResult {
    const isTimeout = error.name === 'AbortError'
    return {
      body: {
        error: error.name || 'RequestError',
        message: error.message,
        url
      },
      statusCode: isTimeout ? 408 : 500,
      headers: {}
    }
  }

  // ==================== API 构建方法 ====================

  /**
   * 获取 cerumusic API 对象
   * @private
   */
  private _getCerumusicApi(): CeruMusicApi {
    return {
      env: CONSTANTS.ENVIRONMENT,
      version: CONSTANTS.API_VERSION,
      utils: this._createApiUtils(),
      request: this._createRequestFunction(),
      NoticeCenter: this._createNoticeCenter()
    }
  }

  /**
   * 创建 API 工具对象
   * @private
   */
  private _createApiUtils(): CeruMusicApiUtils {
    // 验证编码格式是否支持
    const validateEncoding = (encoding?: BufferEncoding): BufferEncoding => {
      const supportedEncodings = ['base64', 'hex', 'utf8']
      if (encoding && !supportedEncodings.includes(encoding)) {
        throw new Error(
          `Unsupported encoding: ${encoding}. Only ${supportedEncodings.join(', ')} are supported.`
        )
      }
      return encoding || 'utf8'
    }

    // 验证AES模式是否支持
    const validateAesMode = (mode: string): string => {
      const supportedModes = ['aes-128-cbc', 'aes-128-ecb']
      if (!supportedModes.includes(mode)) {
        throw new Error(
          `Unsupported AES mode: ${mode}. Only ${supportedModes.join(', ')} are supported.`
        )
      }
      return mode
    }

    return {
      buffer: {
        from: (data: string | Buffer | ArrayBuffer, encoding?: BufferEncoding) => {
          if (typeof data === 'string') {
            const validatedEncoding = validateEncoding(encoding)
            return Buffer.from(data, validatedEncoding)
          } else if (data instanceof Buffer) {
            return data
          } else if (data instanceof ArrayBuffer) {
            return Buffer.from(new Uint8Array(data))
          } else {
            return Buffer.from(data as any)
          }
        },
        bufToString: (buffer: Buffer, encoding?: BufferEncoding) => {
          const validatedEncoding = validateEncoding(encoding)
          return buffer.toString(validatedEncoding)
        }
      },
      crypto: {
        aesEncrypt: (data: any, mode: string, key: string | Buffer, iv?: string | Buffer) => {
          // AES 加密实现
          const validatedMode = validateAesMode(mode)
          const cipher = crypto.createCipheriv(
            validatedMode,
            key,
            validatedMode === 'aes-128-ecb' ? Buffer.alloc(0) : iv || Buffer.alloc(0)
          )
          let encrypted
          if (typeof data === 'string') {
            encrypted = cipher.update(data, 'utf8')
          } else if (Buffer.isBuffer(data)) {
            encrypted = cipher.update(data)
          } else {
            encrypted = cipher.update(JSON.stringify(data), 'utf8')
          }
          encrypted = Buffer.concat([encrypted, cipher.final()])
          return encrypted
        },
        md5: (str: string) => {
          // MD5 哈希实现
          return crypto.createHash('md5').update(str).digest('hex')
        },
        randomBytes: (size: number) => {
          // 生成随机字节
          return crypto.randomBytes(size)
        },
        rsaEncrypt: (data: string, key: string) => {
          // RSA 加密实现
          // 注意：这里假设 key 是 PEM 格式的公钥
          const encrypted = crypto.publicEncrypt(
            { key, padding: crypto.constants.RSA_PKCS1_PADDING },
            Buffer.from(data, 'utf8')
          )
          return encrypted.toString('base64')
        }
      }
    }
  }

  /**
   * 创建请求函数
   * @private
   */
  private _createRequestFunction() {
    return (
      url: string,
      options?: RequestOptions | RequestCallback,
      callback?: RequestCallback
    ) => {
      // 支持 Promise 和 callback 两种调用方式
      if (typeof options === 'function') {
        callback = options as RequestCallback
        options = { method: 'GET' }
      }

      const requestOptions = options as RequestOptions
      const makeRequest = () => this._makeHttpRequest(url, requestOptions)

      // 执行请求
      if (callback) {
        makeRequest()
          .then((result) => callback(null, result))
          .catch((error) => {
            const errorResult = this._createErrorResult(error, url)
            callback(error, errorResult)
          })
        return undefined
      } else {
        return makeRequest()
      }
    }
  }

  /**
   * 执行 HTTP 请求
   * @private
   */
  private async _makeHttpRequest(url: string, options: RequestOptions): Promise<RequestResult> {
    const controller = new AbortController()
    const timeout = options.timeout || CONSTANTS.DEFAULT_TIMEOUT

    const timeoutId = setTimeout(() => {
      controller.abort()
      console.warn(`${CONSTANTS.LOG_PREFIX} 请求超时: ${url}`)
    }, timeout)

    try {
      // pluginLog.log(`${CONSTANTS.LOG_PREFIX} 发起请求: ${options.method || 'GET'} ${url}`)

      const fetchOptions = {
        method: 'GET',
        ...options,
        signal: controller.signal
      }
      // const date = Date.now()
      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      // pluginLog.log(`${CONSTANTS.LOG_PREFIX} 请求响应: ${response.status} ${response.statusText}`)

      const body = await this._parseResponseBody(response)
      const headers = this._extractHeaders(response)

      const result: RequestResult = {
        body,
        statusCode: response.status,
        headers
      }

      // pluginLog.log(`${CONSTANTS.LOG_PREFIX} 请求完成:`, {
      //   url,
      //   status: response.status,
      //   body: body,
      //   spend: Date.now() - date
      // })

      return result
    } catch (error: any) {
      clearTimeout(timeoutId)

      const errorMessage =
        error.name === 'AbortError' ? `请求超时: ${url}` : `请求失败: ${error.message}`

      console.error(`${CONSTANTS.LOG_PREFIX} ${errorMessage}`)
      return this._createErrorResult(error, url)
    }
  }

  /**
   * 提取响应头
   * @private
   */
  private _extractHeaders(response: any): Record<string, string> {
    const headers: Record<string, string> = {}
    response.headers.forEach((value: string, key: string) => {
      headers[key] = value
    })
    return headers
  }

  /**
   * 创建通知中心
   * @private
   */
  private _createNoticeCenter() {
    return (type: string, data: any) => {
      const sendNotice = () => {
        if (this.plugin?.pluginInfo) {
          sendPluginNotice(
            { type: type as any, data, currentVersion: this.plugin.pluginInfo.version },
            this.plugin.pluginInfo.name
          )
        } else {
          // 如果插件还未初始化，延迟执行
          setTimeout(sendNotice, CONSTANTS.NOTICE_DELAY)
        }
      }
      sendNotice()
    }
  }
}

export default CeruMusicPluginHost
