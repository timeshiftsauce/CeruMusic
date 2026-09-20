import main from './service'
import { ipcMain } from 'electron'
export type MainApi = ReturnType<typeof main>
export type MethodParams<T extends keyof MainApi> = MainApi[T] extends (...args: any[]) => any
  ? Parameters<MainApi[T]>[0]
  : never
export async function request<T extends keyof MainApi>(
  _: any,
  method: T,
  options: {
    source: any
  } & (MethodParams<T> extends object ? MethodParams<T> : { [key: string]: any })
): Promise<any> {
  try {
    const { source, ...args } = options
    if (!source) throw new Error('请配置音源')
    const Api = main(source)
    if (Api.hasOwnProperty(method)) {
      return await (Api[method] as (args: any) => any)(args)
    }
    throw new Error(`未知的方法: ${method}`)
  } catch (error: any) {
    if (/Plugin runtime stopped|插件.*(?:未安装|未启用|停止|卸载)|未安装提供/.test(error.message)) {
      return { error: error.message }
    }
    throw new Error(error.message)
  }
}
ipcMain.handle('service-music-sdk-request', async (event, method, options) => {
  try {
    return await request(event, method, options)
  } catch (error) {
    // Keep plugin errors as structured strings across IPC instead of Electron's
    // native exception logger, which also prints a stack for every denied request.
    return {
      __ceruMusicSdkError: true,
      message: error instanceof Error ? error.message : String(error)
    }
  }
})

// 处理搜索联想请求
ipcMain.handle('service-music-tip-search', async (_, source, keyword) => {
  try {
    if (!source) throw new Error('请配置音源')
    const Api = main(source)
    return await Api.tipSearch({ keyword })
  } catch (error: any) {
    console.error('搜索联想错误:', error)
    return { result: { songs: [], order: ['songs'] } }
  }
})
