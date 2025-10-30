import { ipcMain } from 'electron'
import pluginService from '../services/plugin'
function PluginEvent() {
  ipcMain.handle('service-plugin-selectAndAddPlugin', async (_, type): Promise<any> => {
    try {
      return await pluginService.selectAndAddPlugin(type)
    } catch (error: any) {
      console.error('Error selecting and adding plugin:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-downloadAndAddPlugin', async (_, url, type): Promise<any> => {
    try {
      return await pluginService.downloadAndAddPlugin(url, type)
    } catch (error: any) {
      console.error('Error downloading and adding plugin:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-addPlugin', async (_, pluginCode, pluginName): Promise<any> => {
    try {
      return await pluginService.addPlugin(pluginCode, pluginName)
    } catch (error: any) {
      console.error('Error adding plugin:', error)
      return { error: error.message }
    }
  })

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
}

export default function InitPluginService() {
  setTimeout(async () => {
    // 初始化插件系统
    try {
      await pluginService.initializePlugins()
      PluginEvent()
      console.log('插件系统初始化完成')
    } catch (error) {
      console.error('插件系统初始化失败:', error)
    }
  }, 1000)
}
