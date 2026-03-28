import { deepLinkRouter } from './index'
import pluginService from '../services/plugin'
import { sendPluginNotice } from '../events/pluginNotice'

export function setupDeepLinks() {
  deepLinkRouter.get('oauth/callback', (window, url) => {
    console.log('Oauth2 授权回调：', url)
    window.webContents.send('logto-callback', url)
  })

  deepLinkRouter.get('oauth/logout-callback', (_, url) => {
    console.log('Oauth2 登出回调：', url)
  })

  deepLinkRouter.get('plugin/add/link', (_, url) => {
    const parsed = new URL(url)
    const pluginType: 'lx' | 'cr' = parsed.searchParams.get('type') as 'lx' | 'cr' // lx or cr
    const pluginUrl = parsed.searchParams.get('url')
    const pluginId = parsed.searchParams.get('pluginId') // 插件ID 有则为更新插件，否则为安装插件
    if (pluginUrl?.startsWith('http')) {
      console.log('添加插件的链接：', pluginUrl)
      if (pluginId) {
        pluginService
          .downloadAndAddPlugin(pluginUrl, pluginType || 'cr', pluginId)
          .catch((e: any) => console.error('DeepLink 更新插件失败', e))
      } else {
        sendPluginNotice(
          {
            type: 'info',
            data: {
              title: '外部插件安装请求',
              message: '检测到外部 Deeplink 安装请求。请确认来源可靠，谨慎安装来路不明插件。',
              url: pluginUrl,
              pluginInfo: { type: pluginType || 'cr' }
            }
          },
          '插件安装'
        )
      }
    } else {
      console.log('无效的插件链接：', pluginUrl)
    }
  })

  deepLinkRouter.get('play/next', (window, _) => {
    window.webContents.send('playNext')
  })

  deepLinkRouter.get('play/prev', (window, _) => {
    window.webContents.send('playPrev')
  })

  deepLinkRouter.get('play/toggle', (window, _) => {
    window.webContents.send('toggle')
  })
}
