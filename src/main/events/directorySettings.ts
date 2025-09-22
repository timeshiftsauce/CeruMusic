import { ipcMain, dialog } from 'electron'
import { configManager } from '../services/ConfigManager'

// 获取当前目录配置
ipcMain.handle('directory-settings:get-directories', async () => {
  try {
    const directories = configManager.getDirectories()

    // 确保目录存在
    await configManager.ensureDirectoryExists(directories.cacheDir)
    await configManager.ensureDirectoryExists(directories.downloadDir)

    return directories
  } catch (error) {
    console.error('获取目录配置失败:', error)
    return configManager.getDirectories() // 返回默认配置
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
      await configManager.ensureDirectoryExists(selectedPath)
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
      await configManager.ensureDirectoryExists(selectedPath)
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
    const success = await configManager.saveDirectories(directories)
    return { success, message: success ? '目录配置已保存' : '保存配置失败' }
  } catch (error) {
    console.error('保存目录配置失败:', error)
    return { success: false, message: '保存配置失败' }
  }
})

// 重置为默认目录
ipcMain.handle('directory-settings:reset-directories', async () => {
  try {
    // 重置目录配置
    configManager.delete('cacheDir')
    configManager.delete('downloadDir')
    configManager.saveConfig()

    // 获取默认目录
    const directories = configManager.getDirectories()

    // 确保默认目录存在
    await configManager.ensureDirectoryExists(directories.cacheDir)
    await configManager.ensureDirectoryExists(directories.downloadDir)

    return { success: true, directories }
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
    const fs = require('fs')
    const { join } = require('path')

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
