// 音频事件相关类型定义

// 事件回调函数类型定义
export type AudioEventCallback = () => void

// 音频事件类型
export type AudioEventType = 'ended' | 'seeked' | 'timeupdate' | 'play' | 'pause' | 'error'

// 订阅者接口
export interface AudioSubscriber {
  id: string
  callback: AudioEventCallback
}

// 取消订阅函数类型
export type UnsubscribeFunction = () => void

// 音频订阅方法类型
export type AudioSubscribeMethod = (
  eventType: AudioEventType,
  callback: AudioEventCallback
) => UnsubscribeFunction

export type ControlAudioState = {
  audio: HTMLAudioElement | null | undefined
  isPlay: boolean
  currentTime: number
  duration: number
  volume: number
  url: string
}
