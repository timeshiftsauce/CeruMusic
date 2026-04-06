import { ipcMain } from 'electron'
import pluginService from '../services/plugin'
import ManageSongList from '../services/songList/ManageSongList'
import { pluginLog } from '../logger'

let isPluginsInitialized = false

export default function InitPluginService() {
  ipcMain.handle('service-plugin-selectAndAddPlugin', async (_, type): Promise<any> => {
    try {
      return await pluginService.selectAndAddPlugin(type)
    } catch (error: any) {
      console.error('Error selecting and adding plugin:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'service-plugin-downloadAndAddPlugin',
    async (_, url, type, targetPluginId): Promise<any> => {
      try {
        return await pluginService.downloadAndAddPlugin(url, type, targetPluginId)
      } catch (error: any) {
        console.error('Error downloading and adding plugin:', error)
        return { error: error.message }
      }
    }
  )

  ipcMain.handle(
    'service-plugin-addPlugin',
    async (_, pluginCode, pluginName, targetPluginId): Promise<any> => {
      try {
        return await pluginService.addPlugin(pluginCode, pluginName, targetPluginId)
      } catch (error: any) {
        console.error('Error adding plugin:', error)
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('service-plugin-getPluginById', async (_, id): Promise<any> => {
    try {
      return pluginService.getPluginById(id)
    } catch (error: any) {
      console.error('Error getting plugin by id:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-loadAllPlugins', async (): Promise<any> => {
    try {
      // 使用新的 getPluginsList 方法，但保持 API 兼容性
      return await pluginService.getPluginsList()
    } catch (error: any) {
      console.error('Error loading all plugins:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getPluginLog', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.getPluginLog(pluginId)
    } catch (error: any) {
      console.error('Error getting plugin log:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-uninstallPlugin', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.uninstallPlugin(pluginId)
    } catch (error: any) {
      console.error('Error uninstalling plugin:', error)
      return { error: error.message }
    }
  })

  // ==================== 服务插件 IPC ====================

  ipcMain.handle('service-plugin-getPluginType', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getPluginType(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getConfigSchema', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getConfigSchema(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getConfig', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getConfig(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-saveConfig', async (_, pluginId, config): Promise<any> => {
    try {
      pluginService.saveConfig(pluginId, config)
      return { success: true }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-testConnection', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.testConnection(pluginId)
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('service-plugin-getPlaylists', async (_, pluginId): Promise<any> => {
    try {
      return { data: await pluginService.getPlaylists(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'service-plugin-getPlaylistSongs',
    async (_, pluginId, playlistId): Promise<any> => {
      try {
        return { data: await pluginService.getPlaylistSongs(pluginId, playlistId) }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

  ipcMain.handle(
    'service-plugin-importToLocal',
    async (_, pluginId, playlistId, playlistName): Promise<any> => {
      try {
        // 1. 获取远程歌单歌曲
        const result = await pluginService.getPlaylistSongs(pluginId, playlistId)
        if (!result || !result.songs || result.songs.length === 0) {
          return { error: '歌单为空或获取失败' }
        }

        // 2. 创建本地歌单
        const pluginType = pluginService.getPluginType(pluginId)
        const source = pluginType === 'service' ? 'local' : 'local'
        const createResult = ManageSongList.createPlaylist(
          playlistName || `导入的歌单`,
          `从服务插件导入`,
          source as any,
          { importedFrom: pluginId, remotePlaylistId: playlistId }
        )

        // 3. 注入 _servicePluginId 以便播放时异步获取歌词
        const songs = result.songs.map((song: any) => ({
          ...song,
          _servicePluginId: pluginId
        }))

        // 4. 添加歌曲到歌单
        const instance = new ManageSongList(createResult.id)
        const added = instance.addSongs(songs as any)

        return {
          success: true,
          data: {
            songListId: createResult.id,
            added,
            total: result.songs.length
          }
        }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('service-plugin-getServiceLyric', async (_, pluginId, songInfo): Promise<any> => {
    try {
      return { data: await pluginService.getServiceLyric(pluginId, songInfo) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  // 保持初始化兼容性
  ipcMain.handle('service-plugin-initialize-system', async () => {
    if (isPluginsInitialized) return true
    try {
      await pluginService.initializePlugins()
      pluginLog.info('插件系统初始化完成')
      isPluginsInitialized = true
      return true
    } catch (error) {
      pluginLog.error('插件系统初始化失败:', error)
      throw error
    }
  })
}
