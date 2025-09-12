import main from './service'
import { ipcMain } from 'electron'
export type MainApi = ReturnType<typeof main>
export type MethodParams<T extends keyof MainApi> = MainApi[T] extends (...args: any[]) => any
  ? Parameters<MainApi[T]>[0]
  : never
export function request<T extends keyof MainApi>(
  _: any,
  method: T,
  options: {
    source: any
  } & (MethodParams<T> extends object ? MethodParams<T> : { [key: string]: any })
): ReturnType<MainApi[T]> {
  try {
    const { source, ...args } = options
    if (!source) throw new Error('请配置音源')
    const Api = main(source)
    if (Api.hasOwnProperty(method)) {
      return (Api[method] as (args: any) => any)(args)
    }
    throw new Error(`未知的方法: ${method}`)
  } catch (error: any) {
    throw new Error(error.message)
  }
}
ipcMain.handle('service-music-sdk-request', request)
