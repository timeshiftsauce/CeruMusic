import { ipcMain } from 'electron'
import pluginService from '../services/plugin'
import ManageSongList from '../services/songList/ManageSongList'
import { pluginLog } from '../logger'
import { assertMainWindowRequest, assertPluginUIRequest } from '../services/plugin/uiBridge'
import { assertAccountSummary } from '@shiqianjiang/ceru-plugin-sdk'
import {
  prepareExternalPlugin,
  commitExternalPlugin,
  discardExternalPlugin
} from '../services/plugin/externalInstall'

let isPluginsInitialized = false

const DEFAULT_HOST_EVENT_MAX_BYTES = 1024 * 1024
const LARGE_HOST_EVENT_MAX_BYTES = 8 * 1024 * 1024
const LARGE_HOST_EVENTS = new Set(['queue.changed', 'lyrics.changed'])

function assertHostEventPayloadSize(name: string, value: unknown): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value ?? null)
  } catch {
    throw new Error(`插件宿主事件 ${name} 数据无法序列化`)
  }

  const bytes = Buffer.byteLength(serialized, 'utf8')
  const limit = LARGE_HOST_EVENTS.has(name)
    ? LARGE_HOST_EVENT_MAX_BYTES
    : DEFAULT_HOST_EVENT_MAX_BYTES
  if (bytes <= limit) return

  const actualMiB = (bytes / 1024 / 1024).toFixed(2)
  const limitMiB = limit / 1024 / 1024
  throw new Error(`插件宿主事件 ${name} 数据过大（${actualMiB} MiB，限制 ${limitMiB} MiB）`)
}

export default function InitPluginService() {
  ipcMain.handle('plugin:external:prepare', (_event, sequence: number) =>
    prepareExternalPlugin(sequence)
  )
  ipcMain.handle('plugin:external:commit', (_event, sequence: number, format?: string) =>
    commitExternalPlugin(sequence, format)
  )
  ipcMain.handle('plugin:external:discard', (_event, sequence: number) =>
    discardExternalPlugin(sequence)
  )
  ipcMain.handle(
    'plugin:playlist-import-menu',
    async (_event, pluginId: string, menuId: string) => {
      const host = pluginService.getPluginById(pluginId)
      if (!host || host.isDisabled()) throw new Error('请先使用提供此导入方式的插件')
      const manifest = host.getManifest()
      const menu = manifest.contributes?.menus?.find(
        (item: any) => item.id === menuId && item.slot === 'playlist.import'
      )
      const command = manifest.contributes?.commands?.find(
        (item: any) => item.id === menu?.commandId
      )
      if (!command || !host.supportsAction(command.action)) throw new Error('插件未注册此导入操作')
      return host.invokeV2Action(command.action, {})
    }
  )
  ipcMain.handle('plugin:restore-enabled', () => pluginService.restoreEnabledPlugins())
  ipcMain.handle(
    'plugin:publish-host-event',
    async (event, name: string, value: unknown, pluginId?: string) => {
      assertMainWindowRequest(event, '只有主界面可以发布插件宿主事件')
      assertHostEventPayloadSize(name, value)
      await pluginService.publishHostEvent(name, value, pluginId)
      return null
    }
  )
  ipcMain.handle('plugin:account-summary', async (event, pluginId: string, itemId: string) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    const item = host.getManifest().contributes?.accountItems?.find((item) => item.id === itemId)
    if (!item || !host.supportsAction(item.action)) throw new Error('插件未声明此账号展示')
    const summary = await host.invokeV2Action(item.action, {})
    assertAccountSummary(summary)
    return {
      signedIn: summary.signedIn,
      displayName: summary.displayName,
      ...(summary.avatarUrl ? { avatarUrl: summary.avatarUrl } : {}),
      ...(summary.badge ? { badge: summary.badge } : {})
    }
  })
  ipcMain.handle('plugin:account-logout', async (event, pluginId: string, itemId: string) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    const item = host.getManifest().contributes?.accountItems?.find((item) => item.id === itemId)
    if (!item?.logoutAction || !host.supportsAction(item.logoutAction))
      throw new Error('插件未声明退出账号操作')
    await host.invokeV2Action(item.logoutAction, {})
    return null
  })
  const guestHost = (pluginId: string) => {
    const host = pluginService.getPluginById(pluginId)
    if (!host) throw new Error('兼容环境未安装或已卸载')
    return host
  }
  ipcMain.handle('plugin:guest-import', (_event, pluginId, adapterId, url) =>
    guestHost(pluginId).importGuest(adapterId, url)
  )
  ipcMain.handle('plugin:guest-list', (_event, pluginId) => pluginService.listGuests(pluginId))
  ipcMain.handle('plugin:guest-select', (_event, pluginId, guestId) =>
    pluginService.selectGuest(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-remove', (_event, pluginId, guestId) =>
    pluginService.removeGuest(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-permissions', (_event, pluginId, guestId) =>
    pluginService.getGuestPermissions(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-set-permissions', (_event, pluginId, guestId, keys) =>
    pluginService.setGuestPermissions(pluginId, guestId, keys)
  )
  ipcMain.handle('plugin:contributions', async () =>
    (await pluginService.getPluginsList()).map((p) => ({
      pluginId: p.pluginId,
      manifest: p.manifest,
      enabled: p.enabled,
      requestedEnabled: p.requestedEnabled,
      order: p.order,
      providerMethods: p.providerMethods,
      providerIconUrls: p.providerIconUrls,
      actionIds: p.actionIds,
      loadError: p.loadError
    }))
  )
  ipcMain.handle('plugin:guest-update', (_event, pluginId, guestId, url) =>
    guestHost(pluginId).updateGuest(guestId, url)
  )
  ipcMain.handle('plugin:set-active', async (_event, pluginId: string | null) => {
    try {
      await pluginService.setActivePlugin(pluginId)
      let viewError: string | undefined
      if (pluginId) {
        try {
          await pluginService.getPluginById(pluginId)?.openInitialView()
        } catch (error: any) {
          viewError = error.message
        }
      }
      return { success: true, viewError }
    } catch (error: any) {
      return { error: error?.message || '设置默认插件失败' }
    }
  })
  ipcMain.handle('plugin:set-provider-owner', (_event, source: string, pluginId: string | null) => {
    pluginService.setProviderOwner(source, pluginId)
    return true
  })
  ipcMain.handle(
    'plugin:set-capability-owner',
    (_event, source: string, capability: string, pluginId: string | null) => {
      pluginService.setCapabilityOwner(source, capability, pluginId)
      return true
    }
  )
  ipcMain.handle('plugin:set-enabled', async (_event, pluginId: string, enabled: boolean) => {
    try {
      const result = await pluginService.setPluginEnabled(pluginId, enabled)
      if (enabled) {
        try {
          await pluginService.getPluginById(pluginId)?.openInitialView()
        } catch (error: any) {
          return { ...result, viewError: error.message }
        }
      }
      return result
    } catch (error: any) {
      return { error: error?.message || '切换插件状态失败' }
    }
  })
  ipcMain.handle('plugin:open-surface', async (event, pluginId, surfaceId) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host) throw new Error('插件未安装')
    await host.openSurface(surfaceId)
  })
  ipcMain.handle('plugin:drawer-action', (event, pluginId, surfaceId, sessionId, index, values) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件已停止')
    return host.invokeDrawer(surfaceId, sessionId, index, values)
  })
  ipcMain.handle('plugin:mount-surface', (event, pluginId, surfaceId) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    return host.mountSurface(surfaceId)
  })
  ipcMain.handle('plugin:surface-ready', (event, pluginId, surfaceId, sessionId) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    return host.readySurface(surfaceId, sessionId)
  })
  ipcMain.handle(
    'plugin:surface-action',
    async (event, pluginId, surfaceId, sessionId, action, input) => {
      assertPluginUIRequest(event)
      const host = pluginService.getPluginById(pluginId)
      if (!host || host.isDisabled()) throw new Error('插件未运行')
      try {
        return { value: await host.invokeSurfaceAction(surfaceId, sessionId, action, input) }
      } catch (error) {
        // Expected cancellation is transported as data so Electron does not log an IPC failure.
        if (error instanceof DOMException && error.name === 'AbortError') return { cancelled: true }
        throw error
      }
    }
  )
  ipcMain.handle('plugin:drawer-close', (event, pluginId, surfaceId, sessionId) => {
    assertPluginUIRequest(event)
    return pluginService.getPluginById(pluginId)?.closeDrawer(surfaceId, sessionId)
  })
  ipcMain.handle('plugin:importer-tracks', (_event, pluginId, importerId, input) =>
    pluginService.invokeV2Importer(pluginId, importerId, input)
  )
  ipcMain.handle('service-plugin-selectAndAddPlugin', async (_, type): Promise<any> => {
    try {
      return await pluginService.selectAndAddPlugin(type)
    } catch (error: any) {
      console.error('Error selecting and adding plugin:', error)
      return { error: error.message }
    }
  })
  ipcMain.handle('plugin:update-local', async (_event, pluginId: string) => {
    try {
      return await pluginService.selectAndUpdatePlugin(pluginId)
    } catch (error: any) {
      return { error: error.message }
    }
  })
  ipcMain.handle('plugin:update-url', async (_event, pluginId: string, url: string) => {
    return pluginService.downloadAndAddPlugin(url, 'cr', pluginId)
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
      const host = pluginService.getPluginById(id)
      return host
        ? {
            pluginId: id,
            pluginInfo: host.getPluginInfo(),
            supportedSources: host.getSupportedSources(),
            manifest: host.getManifest()
          }
        : null
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

  ipcMain.handle('service-plugin-getPermissions', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getPermissions(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getManifest', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getManifest(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'service-plugin-savePermissions',
    async (_, pluginId, permissions): Promise<any> => {
      try {
        return { data: pluginService.savePermissions(pluginId, permissions) }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

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
