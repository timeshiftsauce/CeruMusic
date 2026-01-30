import { deepLinkRouter } from './index'

export function setupDeepLinks() {
  deepLinkRouter.get('oauth/callback', (window, url) => {
    console.log('Oauth2 授权回调：', url)
    window.webContents.send('logto-callback', url)
  })

  deepLinkRouter.get('oauth/logout-callback', (_, url) => {
    console.log('Oauth2 登出回调：', url)
  })
}
