// 全局音频管理器，用于管理音频源和分析器
class AudioManager {
  private static instance: AudioManager
  private audioSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
  private audioContexts = new WeakMap<HTMLAudioElement, AudioContext>()
  private analysers = new Map<string, AnalyserNode>()

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager()
    }
    return AudioManager.instance
  }

  // 获取或创建音频源
  getOrCreateAudioSource(
    audioElement: HTMLAudioElement
  ): { source: MediaElementAudioSourceNode; context: AudioContext } | null {
    try {
      // 检查是否已经有音频源
      let source = this.audioSources.get(audioElement)
      let context = this.audioContexts.get(audioElement)

      if (!source || !context || context.state === 'closed') {
        // 创建新的音频上下文和源
        context = new (window.AudioContext || (window as any).webkitAudioContext)()
        source = context.createMediaElementSource(audioElement)

        // 连接到输出，确保音频能正常播放
        source.connect(context.destination)

        // 存储引用
        this.audioSources.set(audioElement, source)
        this.audioContexts.set(audioElement, context)

        console.log('AudioManager: 创建新的音频源和上下文')
      }

      return { source, context }
    } catch (error) {
      console.error('AudioManager: 创建音频源失败:', error)
      return null
    }
  }

  // 创建分析器
  createAnalyser(
    audioElement: HTMLAudioElement,
    id: string,
    fftSize: number = 256
  ): AnalyserNode | null {
    const audioData = this.getOrCreateAudioSource(audioElement)
    if (!audioData) return null

    const { source, context } = audioData

    try {
      // 创建分析器
      const analyser = context.createAnalyser()
      analyser.fftSize = fftSize
      analyser.smoothingTimeConstant = 0.6

      // 创建增益节点作为中介，避免直接断开主音频链
      const gainNode = context.createGain()
      gainNode.gain.value = 1.0

      // 连接：source -> gainNode -> analyser
      //                     -> destination (保持音频播放)
      source.disconnect() // 先断开所有连接
      source.connect(gainNode)
      gainNode.connect(context.destination) // 确保音频继续播放
      gainNode.connect(analyser) // 连接到分析器

      // 存储分析器引用
      this.analysers.set(id, analyser)

      console.log('AudioManager: 创建分析器成功')
      return analyser
    } catch (error) {
      console.error('AudioManager: 创建分析器失败:', error)
      return null
    }
  }

  // 移除分析器
  removeAnalyser(id: string): void {
    const analyser = this.analysers.get(id)
    if (analyser) {
      try {
        analyser.disconnect()
        this.analysers.delete(id)
        console.log('AudioManager: 移除分析器成功')
      } catch (error) {
        console.warn('AudioManager: 移除分析器时出错:', error)
      }
    }
  }

  // 清理音频元素的所有资源
  cleanupAudioElement(audioElement: HTMLAudioElement): void {
    try {
      const context = this.audioContexts.get(audioElement)
      if (context && context.state !== 'closed') {
        context.close()
      }

      this.audioSources.delete(audioElement)
      this.audioContexts.delete(audioElement)

      console.log('AudioManager: 清理音频元素资源')
    } catch (error) {
      console.warn('AudioManager: 清理资源时出错:', error)
    }
  }

  // 获取分析器
  getAnalyser(id: string): AnalyserNode | undefined {
    return this.analysers.get(id)
  }
}

export default AudioManager.getInstance()
