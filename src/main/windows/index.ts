import { rendererEntryArgument } from './rendererEntry'
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
        additionalArguments: [rendererEntryArgument()],
        sandbox: true,
        spellcheck: false,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        contextIsolation: true,
        backgroundThrottling: false
      }
    }
    // 合并参数
    options = Object.assign(defaultOptions, options)
    // 创建窗口
    const win = new BrowserWindow(options)
    return win
  } catch (error) {
    windowsLog.error(error)
    return null
  }
}
