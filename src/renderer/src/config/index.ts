import type { LogtoConfig } from '@logto/browser'

import LogtoClient from '@logto/browser'

export default {
  appId: '2a22nn23flw9nyrwi6jw9',
  endpoint: 'https://auth.shiqianjiang.cn/',
  redirectUri: 'cerumusic://oauth/callback',
  postLogoutRedirectUri: 'cerumusic://oauth/logout-callback',
  instance: null as LogtoClient | null,
  resources: ['https://api.ceru.shiqianjiang.cn/api', 'https://api.qz.shiqianjiang.cn/api']
} as LogtoConfig & {
  instance: LogtoClient | null
  redirectUri: string
  postLogoutRedirectUri: string
}
