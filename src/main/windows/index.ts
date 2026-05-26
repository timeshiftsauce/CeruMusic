import { BrowserWindow, BrowserWindowConstructorOptions, app } from 'electron'
import { windowsLog } from '../logger'
import { join } from 'path'
import icon from '../../../resources/logo.png?asset'

export const createWindow = (
  options: BrowserWindowConstructorOptions = {}
): BrowserWindow | null => {
  try {
    const defaultOptions: BrowserWindowConstructorOptions = {
      title: app.getName(),
      width: 1280,
      height: 720,
      frame: false, // 创建后是否显示窗口
      center: true, // 窗口居中
      icon, // 窗口图标
      autoHideMenuBar: true, // 隐藏菜单栏
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        // 禁用渲染器沙盒
        sandbox: false,
        // 禁用同源策略
        webSecurity: false,
        // 允许 HTTP
        allowRunningInsecureContent: true,
        // 禁用拼写检查
        spellcheck: false,
        // 启用 Node.js
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        // 关闭上下文隔离，确保在窗口中注入 window.electron
        contextIsolation: false,
        backgroundThrottling: false
      }
    }
    // 深度合并 webPreferences：允许调用方覆盖单个字段而不丢失默认值
    const webPrefsOverride = options.webPreferences
    if (webPrefsOverride) {
      defaultOptions.webPreferences = {
        ...defaultOptions.webPreferences,
        ...webPrefsOverride
      }
    }
    // 合并其余顶层参数（排除 webPreferences 避免覆盖已合并的结果）
    const { webPreferences: _, ...restOptions } = options
    Object.assign(defaultOptions, restOptions)
    // 创建窗口
    const win = new BrowserWindow(defaultOptions)
    return win
  } catch (error) {
    windowsLog.error(error)
    return null
  }
}
