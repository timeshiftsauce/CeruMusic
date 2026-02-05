import axios, { AxiosRequestConfig, AxiosInstance } from 'axios'
import LogtoClient, { LogtoClientError } from '@logto/browser'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuthStore } from '@renderer/store'

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
    const isAuthError =
      status === 401 || status === 403 || /token|授权|登录|过期|unauth/i.test(String(message))

    if (isAuthError) {
      await logoutAndNotify()
      throw new Error(ERROR_MESSAGES.LOGIN_EXPIRED)
    }

    console.error('Request Error:', error)
    throw new Error(message)
  }

  // 核心请求方法
  async request<T = any>(config: AxiosRequestConfig, returnRaw = false): Promise<T | any> {
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
