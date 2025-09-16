import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { promisify } from 'util'

const mkdir = promisify(fs.mkdir)
const access = promisify(fs.access)

export const CONFIG_NAME = 'sqj_config.json'

// 默认目录配置
const getDefaultDirectories = () => {
  const userDataPath = app.getPath('userData')
  return {
    cacheDir: join(userDataPath, 'music-cache'),
    downloadDir: join(app.getPath('music'), 'CeruMusic/songs')
  }
}

// 确保目录存在
const ensureDirectoryExists = async (dirPath: string) => {
  try {
    await access(dirPath)
  } catch {
    await mkdir(dirPath, { recursive: true })
  }
}

// 获取当前目录配置
ipcMain.handle('directory-settings:get-directories', async () => {
  try {
    const defaults = getDefaultDirectories()

    // 从配置文件读取用户设置的目录
    const configPath = join(app.getPath('userData'), CONFIG_NAME)
    let userConfig: any = {}

    try {
      const configData = fs.readFileSync(configPath, 'utf-8')
      userConfig = JSON.parse(configData)
    } catch {
      // 配置文件不存在或读取失败，使用默认配置
    }

    const directories = {
      cacheDir: userConfig.cacheDir || defaults.cacheDir,
      downloadDir: userConfig.downloadDir || defaults.downloadDir
    }

    // 确保目录存在
    await ensureDirectoryExists(directories.cacheDir)
    await ensureDirectoryExists(directories.downloadDir)

    return directories
  } catch (error) {
    console.error('获取目录配置失败:', error)
    const defaults = getDefaultDirectories()
    return defaults
  }
})

// 选择缓存目录
ipcMain.handle('directory-settings:select-cache-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择缓存目录',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择目录'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      await ensureDirectoryExists(selectedPath)
      return { success: true, path: selectedPath }
    }

    return { success: false, message: '用户取消选择' }
  } catch (error) {
    console.error('选择缓存目录失败:', error)
    return { success: false, message: '选择目录失败' }
  }
})

// 选择下载目录
ipcMain.handle('directory-settings:select-download-dir', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: '选择下载目录',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择目录'
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      await ensureDirectoryExists(selectedPath)
      return { success: true, path: selectedPath }
    }

    return { success: false, message: '用户取消选择' }
  } catch (error) {
    console.error('选择下载目录失败:', error)
    return { success: false, message: '选择目录失败' }
  }
})

// 保存目录配置
ipcMain.handle('directory-settings:save-directories', async (_, directories) => {
  try {
    const configPath = join(app.getPath('userData'), CONFIG_NAME)

    // 确保目录存在
    await ensureDirectoryExists(directories.cacheDir)
    await ensureDirectoryExists(directories.downloadDir)

    // 保存配置
    fs.writeFileSync(configPath, JSON.stringify(directories, null, 2))

    return { success: true, message: '目录配置已保存' }
  } catch (error) {
    console.error('保存目录配置失败:', error)
    return { success: false, message: '保存配置失败' }
  }
})

// 重置为默认目录
ipcMain.handle('directory-settings:reset-directories', async () => {
  try {
    const defaults = getDefaultDirectories()
    const configPath = join(app.getPath('userData'), CONFIG_NAME)

    // 删除配置文件
    try {
      fs.unlinkSync(configPath)
    } catch {
      // 文件不存在，忽略错误
    }

    // 确保默认目录存在
    await ensureDirectoryExists(defaults.cacheDir)
    await ensureDirectoryExists(defaults.downloadDir)

    return { success: true, directories: defaults }
  } catch (error) {
    console.error('重置目录配置失败:', error)
    return { success: false, message: '重置配置失败' }
  }
})

// 打开目录
ipcMain.handle('directory-settings:open-directory', async (_, dirPath) => {
  try {
    const { shell } = require('electron')
    await shell.openPath(dirPath)
    return { success: true }
  } catch (error) {
    console.error('打开目录失败:', error)
    return { success: false, message: '打开目录失败' }
  }
})

// 获取目录大小
ipcMain.handle('directory-settings:get-directory-size', async (_, dirPath) => {
  try {
    const getDirectorySize = (dirPath: string): number => {
      let totalSize = 0

      try {
        const items = fs.readdirSync(dirPath)

        for (const item of items) {
          const itemPath = join(dirPath, item)
          const stats = fs.statSync(itemPath)

          if (stats.isDirectory()) {
            totalSize += getDirectorySize(itemPath)
          } else {
            totalSize += stats.size
          }
        }
      } catch {
        // 忽略无法访问的文件/目录
      }

      return totalSize
    }

    const size = getDirectorySize(dirPath)

    // 格式化大小
    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return {
      size,
      formatted: formatSize(size)
    }
  } catch (error) {
    console.error('获取目录大小失败:', error)
    return { size: 0, formatted: '0 B' }
  }
})
