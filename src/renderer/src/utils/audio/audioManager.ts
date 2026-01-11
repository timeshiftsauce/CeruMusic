// 全局音频管理器，用于管理音频源和分析器

class AudioManager {
  private static instance: AudioManager
  private audioSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
  private audioContexts = new WeakMap<HTMLAudioElement, AudioContext>()
  private analysers = new Map<string, AnalyserNode>()
  // 为每个 audioElement 复用一个分流器，避免重复断开重连主链路
  private splitters = new WeakMap<HTMLAudioElement, GainNode>()
  private equalizers = new WeakMap<HTMLAudioElement, BiquadFilterNode[]>()

  // Audio Effects Nodes
  private bassBoostFilters = new WeakMap<HTMLAudioElement, BiquadFilterNode>()
  private convolverNodes = new WeakMap<HTMLAudioElement, ConvolverNode>()
  private surroundGainNodes = new WeakMap<HTMLAudioElement, GainNode>()
  private balanceNodes = new WeakMap<HTMLAudioElement, StereoPannerNode>()

  // 10 bands frequencies
  public readonly EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

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

        const ctx = context
        // 创建 EQ 滤波器链
        const filters = this.EQ_FREQUENCIES.map((freq) => {
          const filter = ctx.createBiquadFilter()
          filter.type = 'peaking'
          filter.frequency.value = freq
          filter.Q.value = 1.0
          filter.gain.value = 0
          return filter
        })

        // 连接滤波器链: source -> filter1 -> ... -> filterN
        let lastNode: AudioNode = source
        filters.forEach((filter) => {
          lastNode.connect(filter)
          lastNode = filter
        })

        this.equalizers.set(audioElement, filters)

        // 1. Bass Boost
        const bassBoost = ctx.createBiquadFilter()
        bassBoost.type = 'lowshelf'
        bassBoost.frequency.value = 200
        bassBoost.gain.value = 0
        this.bassBoostFilters.set(audioElement, bassBoost)

        lastNode.connect(bassBoost)
        lastNode = bassBoost

        // 2. Surround (Reverb/Convolver)
        // We need a parallel path for Wet signal
        const convolver = ctx.createConvolver()
        const surroundGain = ctx.createGain()
        surroundGain.gain.value = 0 // Dry by default

        this.convolverNodes.set(audioElement, convolver)
        this.surroundGainNodes.set(audioElement, surroundGain)

        // Path A: Dry (Main Signal) -> Balance
        // Path B: Convolver -> Gain -> Balance
        // But we need to mix them before Balance.

        // Let's use a mixer gain node if needed, but we can just connect both to Balance?
        // Wait, StereoPannerNode (Balance) takes inputs and pans them.

        const balanceNode = ctx.createStereoPanner()
        this.balanceNodes.set(audioElement, balanceNode)

        // Connect Dry Path
        lastNode.connect(balanceNode)

        // Connect Wet Path
        lastNode.connect(convolver)
        convolver.connect(surroundGain)
        surroundGain.connect(balanceNode)

        // Update lastNode to balanceNode
        lastNode = balanceNode

        // 确保仅通过分流器连接，避免重复直连导致音量叠加
        let splitter = this.splitters.get(audioElement)
        if (!splitter) {
          splitter = context.createGain()
          splitter.gain.value = 1.0
          // 连接最后一个滤波器到分流器
          lastNode.connect(splitter)
          splitter.connect(context.destination)
          this.splitters.set(audioElement, splitter)
        }

        // 存储引用
        this.audioSources.set(audioElement, source)
        this.audioContexts.set(audioElement, context)

        console.log('AudioManager: 创建新的音频源和上下文 (含EQ)')
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

      // 复用每个 audioElement 的分流器：source -> splitter -> destination
      let splitter = this.splitters.get(audioElement)
      if (!splitter) {
        splitter = context.createGain()
        splitter.gain.value = 1.0
        // 仅第一次建立主链路，不要断开已有连接，避免累积
        source.connect(splitter)
        splitter.connect(context.destination)
        this.splitters.set(audioElement, splitter)
      }

      // 将分析器挂到分流器上，不影响主链路
      splitter.connect(analyser)

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

      // 断开并移除分流器
      const splitter = this.splitters.get(audioElement)
      if (splitter) {
        try {
          splitter.disconnect()
        } catch {}
        this.splitters.delete(audioElement)
      }

      // 清理 EQ 滤波器
      const filters = this.equalizers.get(audioElement)
      if (filters) {
        filters.forEach((f) => {
          try {
            f.disconnect()
          } catch {}
        })
        this.equalizers.delete(audioElement)
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

  // 设置均衡器频段增益
  setEqualizerBand(audioElement: HTMLAudioElement, index: number, gain: number): void {
    const filters = this.equalizers.get(audioElement)
    if (filters && filters[index]) {
      filters[index].gain.value = gain
    }
  }

  // 获取当前均衡器状态
  getEqualizerBands(audioElement: HTMLAudioElement): number[] {
    const filters = this.equalizers.get(audioElement)
    if (!filters) return new Array(this.EQ_FREQUENCIES.length).fill(0)
    return filters.map((f) => f.gain.value)
  }

  // --- Effects Control ---

  setBassBoost(audioElement: HTMLAudioElement, gain: number) {
    const node = this.bassBoostFilters.get(audioElement)
    if (node) {
      node.gain.value = gain
    }
  }

  setBalance(audioElement: HTMLAudioElement, value: number) {
    const node = this.balanceNodes.get(audioElement)
    if (node) {
      node.pan.value = value
    }
  }

  setSurroundMode(audioElement: HTMLAudioElement, mode: 'off' | 'small' | 'medium' | 'large') {
    const convolver = this.convolverNodes.get(audioElement)
    const gainNode = this.surroundGainNodes.get(audioElement)
    const ctx = this.audioContexts.get(audioElement)

    if (!convolver || !gainNode || !ctx) return

    if (mode === 'off') {
      gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1)
      return
    }

    // Generate IR
    const durationMap = {
      small: 0.5,
      medium: 1.5,
      large: 3.0
    }
    const decayMap = {
      small: 3.0,
      medium: 2.0,
      large: 1.5
    }

    const duration = durationMap[mode]
    const decay = decayMap[mode]

    // Simple IR Generation
    const rate = ctx.sampleRate
    const length = rate * duration
    const impulse = ctx.createBuffer(2, length, rate)
    const left = impulse.getChannelData(0)
    const right = impulse.getChannelData(1)

    for (let i = 0; i < length; i++) {
      // Exponential decay noise
      const n = i / length
      // Apply decay
      const vol = Math.pow(1 - n, decay)

      left[i] = (Math.random() * 2 - 1) * vol
      right[i] = (Math.random() * 2 - 1) * vol
    }

    convolver.buffer = impulse
    // Set Wet gain based on mode intensity
    const wetMap = {
      small: 0.3,
      medium: 0.5,
      large: 0.8
    }
    gainNode.gain.setTargetAtTime(wetMap[mode], ctx.currentTime, 0.2)
  }
}

export default AudioManager.getInstance()
