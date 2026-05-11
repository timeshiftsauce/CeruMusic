import type { LogtoConfig } from '@logto/browser'

import LogtoClient from '@logto/browser'
import { CERU_API_RESOURCE } from '@common/api/resources'

export default {
  appId: '2a22nn23flw9nyrwi6jw9',
  endpoint: 'https://auth.shiqianjiang.cn/',
  redirectUri: 'cerumusic://oauth/callback',
  postLogoutRedirectUri: 'cerumusic://oauth/logout-callback',
  instance: null as LogtoClient | null,
  /* qz 是另一个独立服务的 resource,暂时保留硬编码 —— 后续也可挪到 config.json */
  resources: [CERU_API_RESOURCE, 'https://api.qz.shiqianjiang.cn/api']
} as LogtoConfig & {
  instance: LogtoClient | null
  redirectUri: string
  postLogoutRedirectUri: string
}
