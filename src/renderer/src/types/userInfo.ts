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
  /** 心动模式下心动的歌曲ID集合 */
  heartedSongs?: string[]
  /** 心动模式是否启用（AI配置项，独立于播放模式） */
  heartbeatEnabled?: boolean
  /** 预取间隔：每N首触发后台AI预取（默认2） */
  heartbeatPrefetchInterval?: number
  /** 插入间隔：每M首插入推荐歌曲（默认3） */
  heartbeatInsertInterval?: number
  pluginId?: string
  pluginName?: string
  supportedSources?: Sources['supportedSources']
  selectSources?: string
  selectQuality?: string
  sourceQualityMap?: Record<string, string>
  hasGuide?: boolean
  /** 上次播放的实际音频 URL，用于零等待启动 */
  cachedAudioUrl?: string
  /** 上次关闭时是否在播放 */
  wasPlaying?: boolean
}
