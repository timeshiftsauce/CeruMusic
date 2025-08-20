import fs, { Dirent } from 'fs'
import path from 'path'
import fsPromise from 'fs/promises'
import { randomUUID } from 'crypto'
import { getAppDirPath } from '../../utils/path'

import CeruMusicPluginHost from './manager/CeruMusicPluginHost'
import Logger from './logger'

// 导出类型以解决TypeScript错误

const loadedPlugins = {}

const pluginService = {
  async addPlugin(pluginCode: string, pluginName: string) {
    const pluginId = randomUUID().replace(/-/g, '')
    const ceruPluginManager = new CeruMusicPluginHost(pluginCode, new Logger(pluginId))

    const filePath = path.join(getAppDirPath(), 'plugins', `${pluginId}-${pluginName}`)
    if (fs.existsSync(filePath)) {
      throw new Error('插件已存在')
    }

    await fsPromise.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromise.writeFile(
      path.join(getAppDirPath(), 'plugins', `${pluginId}-${pluginName}`),
      ceruPluginManager.getPluginCode() as string
    )
    const pluginInfo = ceruPluginManager.getPluginInfo()

    return {
      pluginId,
      pluginName,
      pluginInfo,
      supportedSources: ceruPluginManager.getSupportedSources(),
      plugin: ceruPluginManager
    }
  },

  getPluginById(pluginId: string) {
    if (!Object.hasOwn(loadedPlugins, pluginId)) {
      return null
    }

    return loadedPlugins[pluginId]
  },

  async loadAllPlugins() {
    const pluginDirPath = path.join(getAppDirPath(), 'plugins')
    if (!fs.existsSync(pluginDirPath)) {
      return
    }

    let files: Dirent<string>[] = []
    try {
      files = await fsPromise.readdir(pluginDirPath, { recursive: true, withFileTypes: true })
    } catch (err: any) {
      console.error(err)
      throw new Error(`无法读取插件目录${err.message ? ': ' + err.message : ''}`)
    }

    return Promise.all(
      files.map(async (file) => {
        const pluginId = file.name.split('-')[0]
        const pluginName = file.name.split('-').slice(1).join('-')
        const fullPath = path.join(pluginDirPath, file.name)

        const ceruPluginManager = new CeruMusicPluginHost()
        await ceruPluginManager.loadPlugin(fullPath)
        loadedPlugins[pluginId] = ceruPluginManager
        const pluginInfo = ceruPluginManager.getPluginInfo()
        return {
          pluginId,
          pluginName,
          pluginInfo,
          supportedSources: ceruPluginManager.getSupportedSources()
        }
      })
    )
  }
}

export default pluginService
