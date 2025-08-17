import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { transitionVolume } from '@renderer/utils/volume'
import type {
  AudioEventCallback,
  AudioEventType,
  AudioSubscriber,
  UnsubscribeFunction,
  ControlAudioState
} from '@renderer/types/audio'

/**
 * 音频控制状态接口。
 * @property {HTMLAudioElement | null | undefined} audio - 音频元素实例。
 * @property {boolean} isPlay - 是否正在播放。
 * @property {number} currentTime - 当前播放时间（秒）。
 * @property {number} duration - 音频总时长（秒）。
 * @property {number} volume - 音量（0-100）。
 * @property {string} url - 音频URL。
 */

export const ControlAudioStore = defineStore('controlAudio', () => {
  const Audio = reactive<ControlAudioState>({
    audio: null,
    isPlay: false,
    currentTime: 0,
    duration: 0,
    volume: 80,
    url: ''
  })

  // -------------------------------------------发布订阅逻辑------------------------------------------
  // 事件订阅者映射表
  /**
   * 音频事件订阅与发布逻辑。
   * @property {Record<AudioEventType, AudioSubscriber[]>} subscribers - 事件订阅者映射表。
   */
  const subscribers = reactive<Record<AudioEventType, AudioSubscriber[]>>({
    ended: [],
    seeked: [],
    timeupdate: [],
    play: [],
    pause: [],
    error: []
  })
  // 生成唯一ID
  const generateId = (): string => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 订阅事件
  /**
   * 订阅音频事件。
   * @param {AudioEventType} eventType - 事件类型。
   * @param {AudioEventCallback} callback - 事件回调函数。
   * @returns {UnsubscribeFunction} 取消订阅的函数。
   */
  const subscribe = (
    eventType: AudioEventType,
    callback: AudioEventCallback
  ): UnsubscribeFunction => {
    const id = generateId()
    const subscriber: AudioSubscriber = { id, callback }

    subscribers[eventType].push(subscriber)

    // 返回取消订阅函数
    return () => {
      const index = subscribers[eventType].findIndex((sub) => sub.id === id)
      if (index > -1) {
        subscribers[eventType].splice(index, 1)
      }
    }
  }

  // 发布事件
  const publish = (eventType: AudioEventType): void => {
    subscribers[eventType].forEach((subscriber) => {
      try {
        subscriber.callback()
      } catch (error) {
        console.error(`音频事件回调执行错误 [${eventType}]:`, error)
      }
    })
  }

  // 清空所有订阅者
  const clearAllSubscribers = (): void => {
    Object.keys(subscribers).forEach((eventType) => {
      subscribers[eventType as AudioEventType] = []
    })
  }

  // 清空特定事件的所有订阅者
  const clearEventSubscribers = (eventType: AudioEventType): void => {
    subscribers[eventType] = []
  }
  // End-------------------------------------------事件订阅者映射表逻辑------------------------------------------

  // 初始化
  const init = (el: ControlAudioState['audio']) => {
    console.log(el, '全局音频挂载初始化success')
    Audio.audio = el
  }

  /**
   * 设置当前播放时间。
   * @param {number} time - 播放时间（秒）。
   * @throws {Error} 如果时间不是数字类型。
   */
  const setCurrentTime = (time: number) => {
    if (typeof time === 'number') {
      Audio.currentTime = time
      return
    }
    throw new Error('时间必须是数字类型')
  }
  const setDuration = (duration: number) => {
    if (typeof duration === 'number') {
      Audio.duration = duration
      return
    }
    throw new Error('时间必须是数字类型')
  }
  /**
   * 设置音量。
   * @param {number} volume - 音量（0-100）。
   * @param {boolean} transition - 是否使用渐变。
   * @throws {Error} 如果音量不在0-100之间。
   */
  const setVolume = (volume: number, transition: boolean = false) => {
    if (typeof volume === 'number' && volume >= 0 && volume <= 100) {
      if (Audio.audio) {
        if (Audio.isPlay && transition) {
          transitionVolume(Audio.audio, volume / 100, Audio.volume <= volume)
        } else {
          Audio.audio.volume = Number((volume / 100).toFixed(2))
          console.log('vo', Audio.audio.volume)
        }
        Audio.volume = volume
      }
    } else {
      throw new Error('音量必须是0-100之间的数字')
    }
  }

  /**
   * 设置音频URL。
   * @param {string} url - 音频URL。
   * @throws {Error} 如果URL为空或无效。
   */
  const setUrl = (url: string) => {
    if (typeof url !== 'string' || url.trim() === '') {
      throw new Error('音频URL不能为空')
    }

    // 停止当前播放
    if (Audio.isPlay) {
      stop()
    }

    Audio.url = url.trim()
    console.log('音频URL已设置:', Audio.url)
  }
  const start = async () => {
    const volume = Audio.volume
    console.log('开始播放音频111', volume)
    if (Audio.audio) {
      Audio.audio.volume = 0
      try {
        await Audio.audio.play()
        Audio.isPlay = true
        return transitionVolume(Audio.audio, volume / 100, true, true)
      } catch (error) {
        Audio.audio.volume = volume / 100
        console.error('音频播放失败:', error)
        Audio.isPlay = false
        throw new Error('音频播放失败，请检查音频URL是否有效')
      }
    }
    return false
  }
  const stop = () => {
    if (Audio.audio) {
      return transitionVolume(Audio.audio, Audio.volume / 100, false, true).then(() => {
        Audio.isPlay = false
        Audio.audio?.pause()
      })
    }
    return false
  }

  return {
    Audio,
    init,
    setCurrentTime,
    setVolume,
    setUrl,
    start,
    stop,
    subscribe,
    publish,
    clearAllSubscribers,
    clearEventSubscribers,
    setDuration
  }
})
