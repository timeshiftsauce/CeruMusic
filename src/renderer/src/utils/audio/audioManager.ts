// 全局音频管理器，用于管理音频源和分析器

class AudioManager {
  private static instance: AudioManager
  private audioSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()
  private audioContexts = new WeakMap<HTMLAudioElement, AudioContext>()
  private analysers = new Map<string, { node: AnalyserNode; element: HTMLAudioElement }>()
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

  // 尝试恢复上下文
  async resumeContext(audioElement: HTMLAudioElement): Promise<void> {
    const context = this.audioContexts.get(audioElement)
    if (context) {
      // 1. 尝试标准的 resume
      if (context.state === 'suspended') {
        try {
          await context.resume()
          console.log('AudioManager: 手动恢复 Context 成功')
        } catch (error) {
          console.warn('AudioManager: 手动恢复 Context 失败:', error)
        }
      }

      // 2. 强力唤醒：播放一个瞬间的静音 buffer
      // 这可以解决部分声卡驱动在 resume 后仍然不输出信号的问题
      try {
        const buffer = context.createBuffer(1, 1, 22050)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(context.destination)
        source.start(0)
        console.log('AudioManager: 发送静音帧唤醒音频驱动')
      } catch (e) {
        console.warn('AudioManager: 静音唤醒失败', e)
      }
    }
  }

  // 获取或创建音频源
  getOrCreateAudioSource(
    audioElement: HTMLAudioElement
  ): { source: MediaElementAudioSourceNode; context: AudioContext } | null {
    try {
      // 检查是否已经有音频源
      let source = this.audioSources.get(audioElement)
      let context = this.audioContexts.get(audioElement)

      // 确保 Context 处于运行状态
      if (context && context.state === 'suspended') {
        context.resume().catch((err) => console.warn('AudioManager: 恢复挂起的 Context 失败:', err))
      }

      if (!source || !context || context.state === 'closed') {
        // 创建新的音频上下文和源
        // 使用 latencyHint: 'playback' 优化播放流畅度，减少断音风险
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        context = new AudioContextClass({ latencyHint: 'playback' })

        // 尝试恢复上下文状态（解决部分 Win11 系统或其他环境下自动挂起导致无声的问题）
        if (context.state === 'suspended') {
          context.resume().catch((err) => console.warn('AudioManager: 自动恢复 Context 失败:', err))
        }

        // 检查 crossOrigin 设置，防止跨域导致静音
        if (
          !audioElement.crossOrigin &&
          audioElement.src &&
          !audioElement.src.startsWith(window.location.origin) &&
          !audioElement.src.startsWith('data:') &&
          !audioElement.src.startsWith('blob:')
        ) {
          console.warn(
            'AudioManager: 检测到跨域音频且未设置 crossOrigin，可能导致分析器无声。建议设置 audio.crossOrigin = "anonymous"'
          )
          try {
            audioElement.crossOrigin = 'anonymous'
          } catch (e) {
            console.warn('AudioManager: 尝试设置 crossOrigin 失败', e)
          }
        }

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

  // 设置音频输出设备
  async setAudioOutputDevice(audioElement: HTMLAudioElement, deviceId: string): Promise<void> {
    try {
      // 1. 尝试设置 AudioContext 的输出设备 (针对 Web Audio API 链路)
      const context = this.audioContexts.get(audioElement)
      if (context && (context as any).setSinkId) {
        try {
          await (context as any).setSinkId(deviceId)
          console.log(`AudioManager: AudioContext output device set to ${deviceId}`)
        } catch (ctxError) {
          console.warn('AudioManager: Failed to set AudioContext sinkId:', ctxError)
        }
      }

      // 2. 同时设置 Audio Element 的输出设备 (兼容性/直通)
      if ((audioElement as any).setSinkId) {
        await (audioElement as any).setSinkId(deviceId)
        console.log(`AudioManager: Audio element output device set to ${deviceId}`)
      } else {
        console.warn('AudioManager: setSinkId not supported')
      }
    } catch (error) {
      console.error('AudioManager: Failed to set audio output device:', error)
      throw error
    }
  }

  // 获取当前音频上下文的统计信息
  getAudioContextStats(
    audioElement: HTMLAudioElement
  ): { sampleRate: number; channels: number; latency: number } | null {
    const context = this.audioContexts.get(audioElement)
    if (context) {
      return {
        sampleRate: context.sampleRate,
        channels: context.destination.maxChannelCount || 2,
        latency: (context.baseLatency || 0) + (context.outputLatency || 0)
      }
    }
    return null
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
      // getOrCreateAudioSource 应该已经创建并连接了 splitter
      let splitter = this.splitters.get(audioElement)

      // 容错处理：如果 splitter 意外丢失，则重建（但这是非预期路径，可能会绕过 EQ）
      if (!splitter) {
        console.warn(
          'AudioManager: Splitter not found in createAnalyser, attempting to recreate (EQ may be bypassed)'
        )
        splitter = context.createGain()
        splitter.gain.value = 1.0
        source.connect(splitter)
        splitter.connect(context.destination)
        this.splitters.set(audioElement, splitter)
      }

      // 检查是否存在同名分析器，如果存在则先移除，防止重复连接导致内存泄漏
      if (this.analysers.has(id)) {
        console.warn(`AudioManager: 分析器 ${id} 已存在，正在移除旧实例以防止泄漏`)
        this.removeAnalyser(id)
      }

      // 将分析器挂到分流器上，不影响主链路
      splitter.connect(analyser)

      // 存储分析器引用
      this.analysers.set(id, { node: analyser, element: audioElement })

      console.log('AudioManager: 创建分析器成功')
      return analyser
    } catch (error) {
      console.error('AudioManager: 创建分析器失败:', error)
      return null
    }
  }

  // 移除分析器
  removeAnalyser(id: string): void {
    const entry = this.analysers.get(id)
    if (entry) {
      const { node: analyser, element: audioElement } = entry
      try {
        analyser.disconnect()

        // 关键：断开 splitter 到 analyser 的连接 (Input)
        const splitter = this.splitters.get(audioElement)
        if (splitter) {
          try {
            splitter.disconnect(analyser)
          } catch (e) {
            console.warn('AudioManager: 断开 splitter -> analyser 连接失败', e)
          }
        }

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
        } catch { }
        this.splitters.delete(audioElement)
      }

      // 清理 EQ 滤波器
      const filters = this.equalizers.get(audioElement)
      if (filters) {
        filters.forEach((f) => {
          try {
            f.disconnect()
          } catch { }
        })
        this.equalizers.delete(audioElement)
      }

      // 清理其他音效节点
      const bassBoost = this.bassBoostFilters.get(audioElement)
      if (bassBoost) {
        try {
          bassBoost.disconnect()
        } catch { }
        this.bassBoostFilters.delete(audioElement)
      }

      const convolver = this.convolverNodes.get(audioElement)
      if (convolver) {
        try {
          convolver.disconnect()
        } catch { }
        this.convolverNodes.delete(audioElement)
      }

      const surroundGain = this.surroundGainNodes.get(audioElement)
      if (surroundGain) {
        try {
          surroundGain.disconnect()
        } catch { }
        this.surroundGainNodes.delete(audioElement)
      }

      const balance = this.balanceNodes.get(audioElement)
      if (balance) {
        try {
          balance.disconnect()
        } catch { }
        this.balanceNodes.delete(audioElement)
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
    return this.analysers.get(id)?.node
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
