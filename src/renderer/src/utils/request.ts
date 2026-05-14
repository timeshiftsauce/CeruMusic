import axios, { AxiosRequestConfig, AxiosInstance } from 'axios'
import LogtoClient, { LogtoClientError } from '@logto/browser'
import { MessagePlugin } from 'tdesign-vue-next'
import { io as ioClient, type Socket } from 'socket.io-client'
import GlobaConfig from '@common/api/config.json'

// 常量定义
const DEFAULT_AUTH_URL = 'https://auth.shiqianjiang.cn'
const REQUEST_TIMEOUT = 30000
const ERROR_MESSAGES = {
  NOT_INITIALIZED: 'LogtoClient not initialized. Call Request.setLogtoClient() first.',
  LOGIN_EXPIRED: '登录已过期，请重新登录',
  REQUEST_FAILED: 'Request failed'
}

// 全局实例缓存
let logtoClientInstance: LogtoClient | null = null
const axiosInstances: Map<string, AxiosInstance> = new Map()

// 辅助函数：登出并通知
async function logoutAndNotify() {
  const { useAuthStore } = await import('@renderer/store')
  const userStore = useAuthStore()
  userStore.outlogin()
  MessagePlugin.warning(ERROR_MESSAGES.LOGIN_EXPIRED)
}

export class Request {
  private resource: string
  private instance: AxiosInstance

  constructor(resource: string = '') {
    this.resource = resource
    this.instance = this.getOrCreateAxiosInstance(resource)
  }

  // 静态方法：设置 LogtoClient
  static setLogtoClient(client: LogtoClient) {
    logtoClientInstance = client
  }

  // 私有方法：获取或创建 Axios 实例
  private getOrCreateAxiosInstance(resource: string): AxiosInstance {
    let instance = axiosInstances.get(resource)
    if (!instance) {
      const baseURL = resource || DEFAULT_AUTH_URL
      instance = axios.create({
        baseURL,
        timeout: REQUEST_TIMEOUT
      })
      axiosInstances.set(resource, instance)
    }
    return instance
  }

  // 私有方法：获取 Access Token
  private async getAccessToken(): Promise<string> {
    if (!logtoClientInstance) {
      throw new Error(ERROR_MESSAGES.NOT_INITIALIZED)
    }

    try {
      return await logtoClientInstance.getAccessToken(this.resource)
    } catch (error: any) {
      if (error instanceof LogtoClientError) {
        // 只有在明确是未认证错误时才触发登出
        if (error.code === 'not_authenticated') {
          await logoutAndNotify()
          throw new Error(ERROR_MESSAGES.LOGIN_EXPIRED)
        }
        // 其他 Logto 错误（如 user_cancelled, missing_scope 等）不应触发自动登出
        console.warn('Logto client error:', error.code, error)
      }
      throw error
    }
  }

  // 私有方法：处理响应错误
  private async handleResponseError(error: any): Promise<never> {
    const status = error?.response?.status
    const message = error.response?.data?.message || error.message || ERROR_MESSAGES.REQUEST_FAILED

    // Allow 304 to pass through if caught by axios (though axios usually treats 304 as success if body is empty, sometimes it might be configured otherwise)
    // Actually, if we want to handle 304 manually in the caller, we should rethrow it or return it.
    // But Request class is designed to return T.
    // Let's just rethrow 304 so caller can catch it.
    if (status === 304) {
      throw error
    }

    // 检查是否为认证相关错误
    const isAuthError = status === 401 || /token|授权|登录|过期|unauth/i.test(String(message))

    if (isAuthError) {
      await logoutAndNotify()
      throw new Error(ERROR_MESSAGES.LOGIN_EXPIRED)
    }

    console.error('Request Error:', error)
    throw new Error(message)
  }

  // 核心请求方法
  async request<T = any>(config: AxiosRequestConfig, returnRaw = false): Promise<T | any> {
    const authStore = await import('@renderer/store').then((m) => m.useAuthStore())
    if (!authStore.isAuthenticated) {
      MessagePlugin.warning('未登录，请先登录')
      throw new Error('未登录，请先登录')
    }
    // 1. 获取 Token
    const token = await this.getAccessToken()

    try {
      // 2. 组装配置
      const finalConfig: AxiosRequestConfig = {
        ...config,

        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`
        }
      }
      /* dev 切换:从 config.json 的 baseUrl 列表里查 url 等于 this.resource 的条目,
       * 启用 dev 时用 developmentUrl 覆盖 baseURL。与 SocketRequest.resolveBaseURL 同款数据驱动。 */
      const isDev = process.env.NODE_ENV === 'development' && Boolean(GlobaConfig.enableDev)
      if (isDev) {
        const list = (GlobaConfig as { baseUrl?: Array<{ url: string; developmentUrl?: string }> })
          .baseUrl
        const entry = list?.find((e) => e.url === this.resource)
        if (entry?.developmentUrl) {
          finalConfig.baseURL = entry.developmentUrl
        }
      }
      // 设置默认 Content-Type (非 FormData 时)
      if (
        (!finalConfig.headers || !finalConfig.headers['Content-Type']) &&
        !(finalConfig.data instanceof FormData)
      ) {
        finalConfig.headers = finalConfig.headers || {}
        finalConfig.headers['Content-Type'] = 'application/json'
      }

      // 3. 发送请求
      const response = await this.instance(finalConfig)
      return returnRaw ? response : response.data
    } catch (error: any) {
      // 4. 错误处理
      return this.handleResponseError(error)
    }
  }

  // 便捷方法：GET
  async get<T = any>(url: string, config?: AxiosRequestConfig, returnRaw = false) {
    return this.request<T>({ ...config, method: 'GET', url }, returnRaw)
  }

  // 便捷方法：POST
  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'POST', url, data })
  }

  // 便捷方法：PUT
  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'PUT', url, data })
  }

  // 便捷方法：PATCH
  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'PATCH', url, data })
  }

  // 便捷方法：DELETE
  async delete<T = any>(url: string, config?: AxiosRequestConfig) {
    return this.request<T>({ ...config, method: 'DELETE', url })
  }

  // 文件上传方法
  async uploadFile<T = any>(
    url: string,
    file: File,
    fieldName: string = 'file',
    config?: AxiosRequestConfig
  ) {
    const formData = new FormData()
    formData.append(fieldName, file)

    return this.request<T>({
      ...config,
      method: 'PUT',
      url,
      data: formData
    })
  }
}

// 导出默认实例（resource 为空，用于 Logto Account API）
export const defaultRequest = new Request('')

export const unwrap = async <T>(promise: Promise<any>): Promise<T> => {
  const res = await promise
  if (res && typeof res === 'object' && 'data' in res && 'code' in res) {
    return (res as any).data
  }
  return res
}

/* ============================================================
 *  SocketRequest —— Socket.IO 鉴权连接封装
 * ============================================================
 *
 * 与 Request 共享 logto token 获取链路 + dev/prod URL 切换 + AUTH_FAILED
 * 自动 refresh-token 重试。业务层只需 new SocketRequest('/lt', resource)
 * 然后 await connect() 拿到已鉴权的 socket。
 */

export interface SocketConnectOptions {
  transports?: string[]
  reconnection?: boolean
  reconnectionAttempts?: number
  reconnectionDelay?: number
  reconnectionDelayMax?: number
  /** 额外注入的 query 参数(例如 nickname) */
  query?: Record<string, string>
}

export class SocketRequest {
  /** namespace 例如 '/lt'。空串表示根命名空间。 */
  private namespace: string
  /** logto resource indicator —— 与 Request 一致,决定 token aud */
  private resource: string
  private socket: Socket | null = null

  /**
   * @param namespace Socket.IO namespace,需以 '/' 开头(如 '/lt')。空串则连根。
   * @param resource Logto resource indicator(同 Request 的 resource),决定 token aud
   *                 与服务端 baseURL。
   */
  constructor(namespace: string, resource: string) {
    this.namespace = namespace.startsWith('/') ? namespace : `/${namespace}`
    if (this.namespace === '/') this.namespace = ''
    this.resource = resource
  }

  /** 当前 socket 实例,未连接则 null */
  get instance(): Socket | null {
    return this.socket
  }

  /** 取 baseURL —— dev 模式按 config.json 切到对应 developmentUrl
   *
   * 数据驱动:在 `common/api/config.json` 的 baseUrl 列表里查 url 等于
   * this.resource 的条目,启用 dev 时用 developmentUrl,否则用 url。
   * 用 URL.origin 提取 socket 的 root(`https://x.com/api` → `https://x.com`)。
   */
  private resolveBaseURL(): string {
    if (!this.resource) return DEFAULT_AUTH_URL
    const isDev = process.env.NODE_ENV === 'development' && Boolean(GlobaConfig.enableDev)
    const list = (GlobaConfig as { baseUrl?: Array<{ url: string; developmentUrl?: string }> })
      .baseUrl
    const entry = list?.find((e) => e.url === this.resource)
    const target = isDev && entry?.developmentUrl ? entry.developmentUrl : this.resource
    try {
      return new URL(target).origin
    } catch {
      return DEFAULT_AUTH_URL
    }
  }

  private async getAccessToken(): Promise<string> {
    if (!logtoClientInstance) {
      throw new Error(ERROR_MESSAGES.NOT_INITIALIZED)
    }
    const token = await logtoClientInstance.getAccessToken(this.resource)
    if (!token) {
      throw new Error('未登录或 token 已失效')
    }
    return token
  }

  /** 强制刷新 token —— AUTH_FAILED 重试前调用 */
  private async refreshTokenForcefully(): Promise<void> {
    const client = logtoClientInstance as unknown as {
      clearAccessToken?: () => void
      fetchUserInfo?: () => Promise<unknown>
    }
    try {
      client.clearAccessToken?.()
    } catch {}
    try {
      await client.fetchUserInfo?.()
    } catch {}
    /* 等一点点让 sdk 完成 refresh + server JWKS 缓存稳定 */
    await new Promise((r) => setTimeout(r, 500))
  }

  /** 用给定 token 建立一次 socket 连接,resolve on 'connect',reject on 'connect_error' */
  private doConnect(token: string, options: SocketConnectOptions = {}): Promise<Socket> {
    const baseURL = this.resolveBaseURL()
    return new Promise<Socket>((resolve, reject) => {
      const sock = ioClient(`${baseURL}${this.namespace}`, {
        transports: options.transports || ['websocket'],
        auth: { token },
        reconnection: options.reconnection ?? true,
        reconnectionAttempts: options.reconnectionAttempts ?? 5,
        reconnectionDelay: options.reconnectionDelay ?? 800,
        reconnectionDelayMax: options.reconnectionDelayMax ?? 5000,
        query: options.query
      })
      const cleanup = () => {
        sock.off('connect', onConnect)
        sock.off('connect_error', onError)
      }
      const onConnect = () => {
        cleanup()
        this.socket = sock
        /* 一旦本 socket 正式断开(网络异常、服务器主动断、用户主动 disconnect),
         * 立刻把 this.socket 解引用,让下次 connect() 走干净的新建流程。
         *
         * 修复:之前断网后 this.socket 仍指向旧实例,后续 connect() 虽然 connected=false
         * 会进入 doConnect 但旧 socket 仍未释放,与新 socket 共用同一 manager + 同一 transport
         * 重试队列,出现 'TransportError: websocket error' 并持续到重启。 */
        sock.once('disconnect', () => {
          if (this.socket === sock) {
            this.socket = null
          }
        })
        resolve(sock)
      }
      const onError = (err: Error) => {
        cleanup()
        try {
          sock.removeAllListeners()
          sock.disconnect()
        } catch {}
        /* 防御:onError 路径下 this.socket 不该指向这个 sock(它从未被设过),
         * 但若调用方在 doConnect 过程中重入,这里多做一次清理无副作用。 */
        if (this.socket === sock) {
          this.socket = null
        }
        reject(err)
      }
      sock.once('connect', onConnect)
      sock.once('connect_error', onError)
    })
  }

  /**
   * 建立连接 —— 自动取 token,失败时刷新 token 重试一次
   *
   * 解决:
   *  - 首次连接 token 已 expired/被吊销(HTTP 自动 refresh,socket 拿旧 token 失败)
   *  - 服务端 JWKS cold cache 抖动导致首次 AUTH_FAILED
   *
   * 返回值是已 'connect' 过的 socket。业务层立即可以 emit/on 事件。
   */
  async connect(options: SocketConnectOptions = {}): Promise<Socket> {
    /* 已经连了同一个 socket 就复用 —— 调用方 idempotent */
    if (this.socket?.connected) return this.socket

    /* 关键修复:旧 socket 存在但已断开(connected=false)时,必须先彻底释放,
     * 否则它仍持有内部 manager + 在后台 reconnection 重试,与即将新建的 socket
     * 共用底层资源,造成 'TransportError: websocket error' 持续到重启的现象。
     *
     * 触发场景:
     *  1. 用户首次进入房间(网络正常)→ this.socket 设为已连接 sock
     *  2. 用户断网 → sock.connected=false,但 this.socket 仍指向它,
     *     内部 reconnectionAttempts=5 在后台不断失败
     *  3. 用户网络恢复后再次创建房间 → connected=false 判断不命中,
     *     直接 doConnect 新建 sock2,sock1 未释放 → 资源冲突
     *
     * 修复:发现废弃旧实例时主动断开 + 解引用,保证 doConnect 是一次干净的新建。 */
    if (this.socket && !this.socket.connected) {
      try {
        this.socket.removeAllListeners()
        this.socket.disconnect()
      } catch {}
      this.socket = null
    }

    const isAuthFail = (err: unknown): boolean => {
      const msg = (err as Error)?.message || ''
      return (
        msg.toLowerCase().includes('auth') || msg.includes('token') || msg.includes('AUTH_FAILED')
      )
    }

    let token = await this.getAccessToken()
    try {
      return await this.doConnect(token, options)
    } catch (err) {
      if (!isAuthFail(err)) throw err

      /* 第 1 次 AUTH_FAILED:清缓存 + fetchUserInfo + 等 500ms 重试 */
      console.warn('[SocketRequest] 首次鉴权失败,刷新 token 重试:', (err as Error).message)
      await this.refreshTokenForcefully()
      token = await this.getAccessToken()
      try {
        return await this.doConnect(token, options)
      } catch (err2) {
        if (!isAuthFail(err2)) throw err2
        /* 第 2 次还失败:再等更久(给后端 JWKS / sdk store 充分时间) */
        console.warn('[SocketRequest] 第 1 次重试仍失败,等更久再试:', (err2 as Error).message)
        await new Promise((r) => setTimeout(r, 1500))
        token = await this.getAccessToken()
        return await this.doConnect(token, options)
      }
    }
  }

  /** 主动断开 + 清理监听 */
  disconnect(): void {
    if (!this.socket) return
    try {
      this.socket.removeAllListeners()
      this.socket.disconnect()
    } catch {}
    this.socket = null
  }
}
