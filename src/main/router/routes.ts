import { deepLinkRouter } from './index'

import { enqueueDeepLink } from './pendingLinks'
import type { QueuedDeepLink } from '../../common/types/deepLink'

function queueLink(window: Electron.BrowserWindow, kind: QueuedDeepLink['kind'], value: string) {
  enqueueDeepLink(kind, value)
  if (!window.isDestroyed()) window.webContents.send('deeplink:changed')
}
function handleShareDeepLink(
  window: Electron.BrowserWindow,
  url: string,
  kind: QueuedDeepLink['kind']
) {
  const id = new URL(url).pathname.split('/').filter(Boolean).at(-1)
  if (id) queueLink(window, kind, id)
}

export function setupDeepLinks() {
  deepLinkRouter.get('oauth/callback', (window, url) => {
    console.log('Oauth2 授权回调：', url)
    window.webContents.send('logto-callback', url)
  })

  deepLinkRouter.get('oauth/logout-callback', (_, url) => {
    console.log('Oauth2 登出回调：', url)
  })

  deepLinkRouter.get('plugin/add/link', (window, url) => {
    const address = new URL(url).searchParams.get('url')
    if (address && ['http:', 'https:'].includes(new URL(address).protocol))
      queueLink(window, 'plugin-link', url)
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

  // cerumusic://playlist/share/<id>
  deepLinkRouter.get('playlist/share', (window, url) => {
    handleShareDeepLink(window, url, 'playlist-share')
  })

  // cerumusic://share/<id>
  deepLinkRouter.get('share', (window, url) => {
    handleShareDeepLink(window, url, 'song-share')
  })

  /* cerumusic://lt/<code> —— 一起听落地。
   * 网页端"在 澜音 中打开"按钮已经把 #CODE# 写进了系统剪贴板,
   * 这里同时把 code 直接通过 IPC 推给渲染层 —— 避免渲染层因 Electron
   * 焦点时序问题读不到剪贴板。渲染层若已经在房间 / 已弹过此 code 则会自行忽略。 */
  deepLinkRouter.get('lt', (window, url) => {
    const parsed = new URL(url)
    const segs = parsed.pathname.split('/').filter(Boolean)
    const code = (segs[segs.length - 1] || '').toUpperCase()
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      console.log('无效的一起听 DeepLink:', url)
      return
    }
    console.log('收到一起听 DeepLink,code:', code)
    queueLink(window, 'listen-together', code)
  })
}

/** macOS may deliver a URL before a BrowserWindow exists. Keep user-facing entries in order. */
export function bufferEarlyDeepLink(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'cerumusic:') return false
    const route = (parsed.host + parsed.pathname).replace(/\/$/, '')
    const value = parsed.pathname.split('/').filter(Boolean).at(-1)
    if (route.startsWith('playlist/share/') && value) enqueueDeepLink('playlist-share', value)
    else if (route.startsWith('share/') && value) enqueueDeepLink('song-share', value)
    else if (route.startsWith('lt/') && value && /^[A-Z0-9]{6}$/i.test(value))
      enqueueDeepLink('listen-together', value.toUpperCase())
    else if (route === 'plugin/add/link') enqueueDeepLink('plugin-link', url)
    else return false
    return true
  } catch {
    return false
  }
}
