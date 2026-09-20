import { PlayMode } from './audio'
import { Sources } from './Sources'

export type AIProvider = 'deepseek' | 'openai' | 'siliconflow' | 'custom'

export interface AIConfig {
  provider?: AIProvider
  apiKey?: string
  baseURL?: string
  model?: string
}

export interface UserInfo {
  lastPlaySongId?: number | string | null
  currentTime?: number
  volume?: number
  topBarStyle?: boolean
  mainColor?: string
  playMode?: PlayMode
  /** @deprecated 请使用 aiConfig 替代 */
  deepseekAPIkey?: string
  aiConfig?: AIConfig
  pluginId?: string
  pluginName?: string
  supportedSources?: Sources['supportedSources']
  selectSources?: string
  selectQuality?: string
  sourceQualityMap?: Record<string, string>
  /** Selected plugin implementation for each provider ID. */
  sourcePluginMap?: Record<string, string>
  /** 精确到 Provider 能力的方法实现选择。 */
  capabilityPluginMap?: Record<string, string>
  /** 首页区块的实现选择。 */
  uiPluginMap?: Record<string, string>
  hasGuide?: boolean
}
