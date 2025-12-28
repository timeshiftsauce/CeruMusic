import axios, { AxiosRequestConfig, AxiosInstance } from 'axios'
import LogtoClient from '@logto/browser'

// 全局唯一的 LogtoClient 实例，需要在使用 request 之前初始化
let logtoClientInstance: LogtoClient | null = null

// 缓存不同 resource 的 axios 实例
const axiosInstances: Map<string, AxiosInstance> = new Map()

export class Request {
  private resource: string
  private instance: AxiosInstance

  constructor(resource: string = '') {
    this.resource = resource

    // 尝试获取缓存的实例
    let cachedInstance = axiosInstances.get(resource)
    if (!cachedInstance) {
      // 如果 resource 为空，使用 endpoint 作为 baseURL (Auth API)
      // 否则使用 resource 本身作为 baseURL (Resource API)
      const baseURL = resource || 'https://auth.shiqianjiang.cn'

      cachedInstance = axios.create({
        baseURL,
        timeout: 10000
      })

      axiosInstances.set(resource, cachedInstance)
    }
    this.instance = cachedInstance
  }

  // 静态方法设置 LogtoClient
  static setLogtoClient(client: LogtoClient) {
    logtoClientInstance = client
  }

  // 发送请求的方法
  async request(config: AxiosRequestConfig) {
    if (!logtoClientInstance) {
      throw new Error('LogtoClient not initialized. Call Request.setLogtoClient() first.')
    }

    try {
      // 获取 token
      const token = await logtoClientInstance.getAccessToken(this.resource)

      // 合并配置，确保 token 被添加到 headers
      const finalConfig: AxiosRequestConfig = {
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`
        }
      }

      // 如果没有明确设置 Content-Type，则设置默认值
      if (!finalConfig.headers || !finalConfig.headers['Content-Type']) {
        finalConfig.headers = finalConfig.headers || {}
        finalConfig.headers['Content-Type'] = 'application/json'
      }

      const response = await this.instance(finalConfig)
      return response.data
    } catch (error: any) {
      // 简单的错误处理
      const message = error.response?.data?.message || error.message || 'Request failed'
      throw new Error(message)
    }
  }

  // 便捷方法：GET
  async get(url: string, config?: AxiosRequestConfig) {
    return this.request({ ...config, method: 'GET', url })
  }

  // 便捷方法：POST
  async post(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request({ ...config, method: 'POST', url, data })
  }

  // 便捷方法：PUT
  async put(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request({ ...config, method: 'PUT', url, data })
  }

  // 便捷方法：PATCH
  async patch(url: string, data?: any, config?: AxiosRequestConfig) {
    return this.request({ ...config, method: 'PATCH', url, data })
  }

  // 便捷方法：DELETE
  async delete(url: string, config?: AxiosRequestConfig) {
    return this.request({ ...config, method: 'DELETE', url })
  }

  // 文件上传方法
  async uploadFile(url: string, file: File, fieldName: string = 'file', config?: AxiosRequestConfig) {
    if (!logtoClientInstance) {
      throw new Error('LogtoClient not initialized. Call Request.setLogtoClient() first.')
    }

    try {
      // 获取 token
      const token = await logtoClientInstance.getAccessToken(this.resource)

      // 创建 FormData
      const formData = new FormData()
      formData.append(fieldName, file)

      // 合并配置
      const finalConfig: AxiosRequestConfig = {
        ...config,
        method: 'PUT',
        url,
        data: formData,
        headers: {
          Authorization: `Bearer ${token}`
          // 注意：不要手动设置 Content-Type，让浏览器自动设置 multipart/form-data 边界
        }
      }

      const response = await this.instance(finalConfig)
      return response.data
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Upload failed'
      throw new Error(message)
    }
  }
}

// 导出默认实例（resource 为空，用于 Logto Account API）
export const defaultRequest = new Request('')
