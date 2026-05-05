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
  hasGuide?: boolean
}
