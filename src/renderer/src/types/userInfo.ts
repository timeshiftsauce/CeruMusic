import { PlayMode } from './audio'
import { Sources } from './Sources'

export interface UserInfo {
  lastPlaySongId?: number | string | null
  currentTime?: number
  volume?: number
  topBarStyle?: boolean
  mainColor?: string
  playMode?: PlayMode
  deepseekAPIkey?: string
  pluginId?: string
  supportedSources?: Sources['supportedSources']
  selectSources?: string
  selectQuality?: string
}
