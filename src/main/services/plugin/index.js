/* eslint-disable */
import fs from 'fs'
import path from 'path'
import fsPromise from 'fs/promises'
import { randomUUID } from 'crypto'
import { getAppDirPath } from '../../utils/path'

const CeruMusicPluginHost = require('./manager/CeruMusicPluginHost')
import Logger from './logger'

const loadedPlugins = {}

const pluginService = {
  async addPlugin(pluginCode, pluginName) {
    const pluginId = randomUUID().replace(/-/g, '')
    const ceruPluginManager = new CeruMusicPluginHost()
    await ceruPluginManager.loadPlugin(pluginCode, new Logger(pluginId))

    const filePath = path.join(getAppDirPath(), 'plugins', `${pluginId}-${pluginName}`)
    if (fs.existsSync(filePath)) {
      throw new Error('插件已存在')
    }

    await fsPromise.mkdir(path.dirname(filePath), { recursive: true })
    await fsPromise.writeFile(
      path.join(getAppDirPath(), 'plugins', `${pluginId}-${pluginName}`),
      pluginCode
    )

    return {
      pluginId,
      pluginName,
      pluginInfo: ceruPluginManager.getPluginInfo(),
      supportedSources: ceruPluginManager.getSupportedSources(),
      plugin: ceruPluginManager
    }
  },

  getPluginById(pluginId) {
    if (!Object.hasOwn(loadedPlugins, pluginId)) {
      return null
    }

    return loadedPlugins[pluginId]
  },

  async loadAllPlugins() {
    let pluginDirPath = path.join(getAppDirPath(), 'plugins')
    if (!fs.existsSync(pluginDirPath)) {
      return
    }

    let files = []
    try {
      files = await fsPromise.readdir(pluginDirPath, { recursive: true, withFileTypes: true })
    } catch (err) {
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

        return {
          pluginId,
          pluginName,
          pluginInfo: ceruPluginManager.getPluginInfo(),
          supportedSources: ceruPluginManager.getSupportedSources()
        }
      })
    )
  }
}

export default pluginService
