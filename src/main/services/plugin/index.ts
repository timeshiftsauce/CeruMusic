import fs, { Dirent } from 'fs'
import path from 'path'
import fsPromise from 'fs/promises'
import { randomUUID } from 'crypto'
import { dialog } from 'electron'
import { getAppDirPath } from '../../utils/path'

import CeruMusicPluginHost from './manager/CeruMusicPluginHost'
import convertEventDrivenPlugin from './manager/converter-event-driven'
import Logger, { getLog } from './logger'

// 导出类型以解决TypeScript错误

// 存储已加载的插件实例
const loadedPlugins = {}

const pluginService = {
  async selectAndAddPlugin(type: 'lx' | 'cr') {
    try {
      // 打开文件选择对话框
      const result = await dialog.showOpenDialog({
        title: `请选择你的 ${type == 'lx' ? '洛雪' : '澜音'} js插件`,
        filters: [
          { name: 'JavaScript 文件', extensions: ['js'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { canceled: true }
      }

      const filePath = result.filePaths[0]
      const fileName = path.basename(filePath)

      // 读取文件内容
      let pluginCode = await fsPromise.readFile(filePath, 'utf-8')
      if (type == 'lx') {
        pluginCode = convertEventDrivenPlugin(pluginCode)
      }
      // 调用现有的添加插件方法
      return await this.addPlugin(pluginCode, fileName)
    } catch (error: any) {
      console.error('选择并添加插件失败:', error)
      return { error: error.message || '选择插件文件失败' }
    }
  },

  async addPlugin(pluginCode: string, pluginName: string) {
    try {
      // 首先解析插件信息
      const tempPluginManager = new CeruMusicPluginHost(pluginCode, new Logger('temp'))

      // 验证插件信息
      const pluginInfo = tempPluginManager.getPluginInfo()
      if (!pluginInfo || !pluginInfo.name || !pluginInfo.version || !pluginInfo.author) {
        throw new Error('插件信息不完整，必须包含名称、版本和作者信息')
      }

      // 确保插件目录存在
      const pluginsDir = path.join(getAppDirPath(), 'plugins')
      await fsPromise.mkdir(pluginsDir, { recursive: true })

      // 检查是否已存在相同名称和版本的插件
      const existingPlugins = (await this.getPluginsList()) || []
      const duplicatePlugin = existingPlugins.find(
        (plugin) =>
          plugin.pluginInfo.name === pluginInfo.name &&
          plugin.pluginInfo.version === pluginInfo.version
      )

      if (duplicatePlugin) {
        throw new Error(`插件 "${pluginInfo.name} v${pluginInfo.version}" 已存在，不能重复添加`)
      }

      // 生成插件ID和安全的文件名
      const pluginId = randomUUID().replace(/-/g, '')
      const safePluginName = (pluginName || pluginInfo.name).replace(/[^\w\d-]/g, '_')
      const filePath = path.join(pluginsDir, `${pluginId}-${safePluginName}`)

      // 写入插件文件
      await fsPromise.writeFile(filePath, tempPluginManager.getPluginCode() as string)

      // 重新加载插件以确保正确初始化
      const ceruPluginManager = new CeruMusicPluginHost()
      await ceruPluginManager.loadPlugin(filePath, new Logger(pluginId))

      // 将插件添加到已加载插件列表
      loadedPlugins[pluginId] = ceruPluginManager

      return {
        pluginId,
        pluginName: safePluginName,
        pluginInfo,
        supportedSources: ceruPluginManager.getSupportedSources()
      }
    } catch (error: any) {
      console.error('添加插件失败:', error)
      throw new Error(`添加插件失败: ${error.message}`)
    }
  },

  getPluginById(pluginId: string): CeruMusicPluginHost | null{
    if (!Object.hasOwn(loadedPlugins, pluginId)) {
      return null
    }

    return loadedPlugins[pluginId]
  },

  async uninstallPlugin(pluginId: string) {
    try {
      const pluginsDir = path.join(getAppDirPath(), 'plugins')
      const files = await fsPromise.readdir(pluginsDir)

      // 查找匹配的插件文件
      const pluginFile = files.find((file) => file.startsWith(`${pluginId}-`))

      if (!pluginFile) {
        throw new Error(`未找到插件ID为 ${pluginId} 的插件文件`)
      }

      // 删除插件文件
      const pluginPath = path.join(pluginsDir, pluginFile)
      await fsPromise.unlink(pluginPath)

      // 从已加载插件中移除
      if (loadedPlugins[pluginId]) {
        delete loadedPlugins[pluginId]
      }

      return { success: true, message: '插件卸载成功' }
    } catch (error: any) {
      console.error('卸载插件失败:', error)
      throw new Error(`卸载插件失败: ${error.message}`)
    }
  },

  async initializePlugins() {
    const pluginDirPath = path.join(getAppDirPath(), 'plugins')

    // 确保插件目录存在
    if (!fs.existsSync(pluginDirPath)) {
      await fsPromise.mkdir(pluginDirPath, { recursive: true })
      return []
    }

    let files: Dirent<string>[] = []
    try {
      files = await fsPromise.readdir(pluginDirPath, { recursive: false, withFileTypes: true })

      // 只处理文件，忽略目录
      files = files.filter((file) => file.isFile())

      if (files.length === 0) {
        return []
      }

      // 清空已加载的插件
      Object.keys(loadedPlugins).forEach((key) => delete loadedPlugins[key])

      const results = await Promise.all(
        files.map(async (file) => {
          try {
            // 解析插件ID和名称
            const parts = file.name.split('-')
            if (parts.length < 2) {
              console.warn(`跳过无效的插件文件名: ${file.name}`)
              return null
            }

            const pluginId = parts[0]
            const pluginName = parts.slice(1).join('-')
            const fullPath = path.join(pluginDirPath, file.name)

            // 加载插件
            const ceruPluginManager = new CeruMusicPluginHost()
            await ceruPluginManager.loadPlugin(fullPath, new Logger(pluginId))

            // 获取插件信息
            const pluginInfo = ceruPluginManager.getPluginInfo()

            // 存储到已加载插件列表
            loadedPlugins[pluginId] = ceruPluginManager

            return {
              pluginId,
              pluginName,
              pluginInfo,
              supportedSources: ceruPluginManager.getSupportedSources()
            }
          } catch (error: any) {
            console.error(`加载插件 ${file.name} 失败:`, error)
            return null
          }
        })
      )

      // 过滤掉加载失败的插件
      return results.filter((result) => result !== null)
    } catch (err: any) {
      console.error('读取插件目录失败:', err)
      throw new Error(`无法读取插件目录${err.message ? ': ' + err.message : ''}`)
    }
  },

  async getPluginsList() {
    // 如果没有已加载的插件，先尝试初始化
    if (Object.keys(loadedPlugins).length === 0) {
      await this.initializePlugins()
    }

    // 返回已加载插件的信息
    return Object.entries(loadedPlugins).map(([pluginId, manager]) => {
      const ceruPluginManager = manager as CeruMusicPluginHost
      return {
        pluginId,
        pluginName: pluginId.split('-')[1] || pluginId,
        pluginInfo: ceruPluginManager.getPluginInfo(),
        supportedSources: ceruPluginManager.getSupportedSources()
      }
    })
  },

  async getPluginLog(pluginId: string) {
    return await getLog(pluginId)
  }
}

export default pluginService
