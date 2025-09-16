interface MediaSessionCallbacks {
  play: () => void
  pause: () => void
  playPrevious: () => void
  playNext: () => void
}

interface TrackMetadata {
  title: string
  artist: string
  album: string
  artworkUrl: string
}

/**
 * Media Session API 控制器
 * 用于管理浏览器的媒体会话，支持系统级媒体控制
 */
class MediaSessionController {
  private audioElement: HTMLAudioElement | null = null
  private callbacks: MediaSessionCallbacks | null = null
  private eventListeners: Array<{
    element: HTMLAudioElement
    event: string
    handler: EventListener
  }> = []

  /**
   * 检查浏览器是否支持 Media Session API
   */
  private get isSupported(): boolean {
    return 'mediaSession' in navigator
  }

  /**
   * 更新媒体会话元数据
   */
  updateMetadata(metadata: TrackMetadata): void {
    if (!this.isSupported) return

    try {
      // 确保元数据完整性，避免空值导致SMTC显示异常
      const safeMetadata = {
        title: metadata.title || '未知歌曲',
        artist: metadata.artist || '未知艺术家',
        album: metadata.album || '未知专辑',
        artwork: metadata.artworkUrl ? this.generateArtworkSizes(metadata.artworkUrl) : []
      }

      navigator.mediaSession.metadata = new MediaMetadata(safeMetadata)

      // 强制更新播放状态，确保SMTC正确识别
      if (this.audioElement) {
        const currentState = this.audioElement.paused ? 'paused' : 'playing'
        navigator.mediaSession.playbackState = currentState
      }
    } catch (error) {
      console.warn('Failed to update media session metadata:', error)
    }
  }

  /**
   * 生成不同尺寸的封面图片配置
   */
  private generateArtworkSizes(artworkUrl: string): MediaImage[] {
    const sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']
    return sizes.map((size) => ({
      src: artworkUrl,
      sizes: size,
      type: 'image/png'
    }))
  }

  /**
   * 初始化媒体会话控制器
   */
  init(audioElement: HTMLAudioElement, callbacks: MediaSessionCallbacks): void {
    if (!this.isSupported) {
      console.warn('Media Session API is not supported in this browser')
      return
    }

    // 清理之前的监听器
    this.cleanup()

    this.audioElement = audioElement
    this.callbacks = callbacks

    // 设置媒体会话动作处理器
    this.setupMediaSessionActionHandlers()

    // 初始化时设置默认的播放状态
    navigator.mediaSession.playbackState = 'none'

    // 设置默认元数据，确保SMTC能够识别应用
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '澜音',
      artist: 'CeruMusic',
      album: '音乐播放器',
      artwork: []
    })
  }

  /**
   * 设置媒体会话动作处理器
   */
  private setupMediaSessionActionHandlers(): void {
    if (!this.callbacks) return

    const actionHandlers: Array<[MediaSessionAction, () => void]> = [
      ['play', this.callbacks.play],
      ['pause', this.callbacks.pause],
      ['previoustrack', this.callbacks.playPrevious],
      ['nexttrack', this.callbacks.playNext]
    ]

    actionHandlers.forEach(([action, handler]) => {
      navigator.mediaSession.setActionHandler(action, handler)
    })

    // 设置 seekto 处理器
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (!this.audioElement || !details.seekTime) return

      try {
        if (details.fastSeek && 'fastSeek' in this.audioElement) {
          this.audioElement.fastSeek(details.seekTime)
        } else {
          this.audioElement.currentTime = details.seekTime
        }
      } catch (error) {
        console.warn('Failed to seek audio:', error)
      }
    })
  }

  /**
   * 更新播放状态
   */
  updatePlaybackState(state: MediaSessionPlaybackState): void {
    if (!this.isSupported) return

    try {
      navigator.mediaSession.playbackState = state
    } catch (error) {
      console.warn('Failed to update playback state:', error)
    }
  }

  /**
   * 清理事件监听器和媒体会话
   */
  cleanup(): void {
    // 移除音频事件监听器
    this.eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler)
    })
    this.eventListeners = []

    // 清理媒体会话动作处理器
    if (this.isSupported) {
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekto'
      ]
      actions.forEach((action) => {
        navigator.mediaSession.setActionHandler(action, null)
      })
    }

    this.audioElement = null
    this.callbacks = null
  }
}

// 导出单例实例
export default new MediaSessionController()
