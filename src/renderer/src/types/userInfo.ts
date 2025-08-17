import { PlayMode } from './audio'

export interface UserInfo {
  lastPlaySongId?: number | null
  currentTime?: number
  volume?: number
  topBarStyle?: boolean
  mainColor?: string
  playMode?: PlayMode
  deepseekAPIkey?: string
}
