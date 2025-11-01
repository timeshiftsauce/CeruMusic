import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const access = promisify(fs.access)

export const CONFIG_NAME = 'sqj_config.json'

// 配置管理器类
export class ConfigManager {
  private static instance: ConfigManager
  private configPath: string
  private config: Record<string, any> = {}

  private constructor() {
    this.configPath = join(app.getPath('userData'), CONFIG_NAME)
    this.loadConfig()
  }

  // 单例模式获取实例
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  // 加载配置
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf-8')
        this.config = JSON.parse(configData)
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      this.config = {}
    }
  }

  // 保存配置
  public saveConfig(): boolean {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
      return true
    } catch (error) {
      console.error('保存配置失败:', error)
      return false
    }
  }

  // 获取配置项
  public get<T>(key: string, defaultValue?: T): T {
    const value = this.config[key]
    return value !== undefined ? value : (defaultValue as T)
  }

  // 设置配置项
  public set<T>(key: string, value: T): void {
    this.config[key] = value
    this.saveConfig()
  }

  // 删除配置项
  public delete(key: string): void {
    delete this.config[key]
  }

  // 重置所有配置
  public reset(): void {
    this.config = {}
    this.saveConfig()
  }

  // 获取所有配置
  public getAll(): Record<string, any> {
    return { ...this.config }
  }

  // 确保目录存在
  public async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await access(dirPath)
    } catch {
      await mkdir(dirPath, { recursive: true })
    }
  }

  // 获取目录配置
  public getDirectories() {
    const userDataPath = app.getPath('userData')
    const defaults = {
      cacheDir: join(userDataPath, 'music-cache'),
      downloadDir: join(app.getPath('music'), 'CeruMusic/songs')
    }

    return {
      cacheDir: this.get('cacheDir', defaults.cacheDir),
      downloadDir: this.get('downloadDir', defaults.downloadDir)
    }
  }

  // 保存目录配置
  public async saveDirectories(directories: {
    cacheDir: string
    downloadDir: string
  }): Promise<boolean> {
    try {
      await this.ensureDirectoryExists(directories.cacheDir)
      await this.ensureDirectoryExists(directories.downloadDir)

      this.set('cacheDir', directories.cacheDir)
      this.set('downloadDir', directories.downloadDir)
      return this.saveConfig()
    } catch (error) {
      console.error('保存目录配置失败:', error)
      return false
    }
  }

  // 保存窗口位置和大小
  public saveWindowBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.set('windowBounds', bounds)
    this.saveConfig()
  }

  // 获取窗口位置和大小，确保窗口完全在屏幕内
  public getWindowBounds(): { x: number; y: number; width: number; height: number } | null {
    const bounds = this.get<{ x: number; y: number; width: number; height: number } | null>(
      'windowBounds',
      null
    )

    if (bounds) {
      const { screen } = require('electron')

      // 获取主显示器
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

      // 确保窗口在屏幕内
      if (bounds.x < 0) bounds.x = 0
      if (bounds.y < 0) bounds.y = 0

      // 确保窗口右侧不超出屏幕
      if (bounds.x + bounds.width > screenWidth) {
        bounds.x = Math.max(0, screenWidth - bounds.width)
      }

      // 确保窗口底部不超出屏幕
      if (bounds.y + bounds.height > screenHeight) {
        bounds.y = Math.max(0, screenHeight - bounds.height)
      }
    }

    return bounds
  }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance()
