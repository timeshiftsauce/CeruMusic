// 全局音频管理器，用于管理音频源和分析器

/** 每个 audioElement 的关键节点引用，供动态旁路重建链路使用 */
interface AudioChainPoints {
  source: MediaElementAudioSourceNode
  context: AudioContext
  eqFilters: BiquadFilterNode[]
  bassBoost: BiquadFilterNode
  balance: StereoPannerNode
  convolver: ConvolverNode
  surroundGain: GainNode
  loudnessComp: DynamicsCompressorNode
  loudnessMakeup: GainNode
  splitter: GainNode
}

/** 三组 bypass 状态：true = 该效果被关闭，节点不在音频链中 */
interface BypassFlags {
  eqDisabled: boolean
  bassDisabled: boolean
  loudnessDisabled: boolean
}

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

  // 响度均衡 (Loudness Normalization) 节点
  // 仅在软件内部音频链路生效（splitter 之前），不会影响系统/游戏音量。
  // 结构：... -> loudnessCompressor -> loudnessMakeup -> splitter -> ...
  private loudnessCompressors = new WeakMap<HTMLAudioElement, DynamicsCompressorNode>()
  private loudnessMakeupGains = new WeakMap<HTMLAudioElement, GainNode>()

  // Crossfade Nodes (插在 splitter 和 destination 之间，供无感过渡使用)
  private crossfadeGains = new WeakMap<HTMLAudioElement, GainNode>()
  private crossfadeLowpasses = new WeakMap<HTMLAudioElement, BiquadFilterNode>()
  // 过渡时机检测专用的 analyser，按需惰性创建，tap 在 splitter 上，与可视化分析器独立
  private envelopeAnalysers = new WeakMap<HTMLAudioElement, AnalyserNode>()

  // 动态旁路：节点引用快照，供 rebuildChain 断开/重连
  private connectionPoints = new WeakMap<HTMLAudioElement, AudioChainPoints>()
  // 动态旁路：三组 bypass 状态
  private bypassFlags = new WeakMap<HTMLAudioElement, BypassFlags>()

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
        // 通过 splitter（经 crossfadeGain）发送唤醒帧，避免直接连 destination 产生瞬态
        const splitter = this.splitters.get(audioElement)
        source.connect(splitter || context.destination)
        source.start(0)
        console.log('AudioManager: 发送静音帧唤醒音频驱动')
      } catch (e) {
        console.warn('AudioManager: 静音唤醒失败', e)
      }
    }
  }

  // 挂起音频上下文（窗口最小化时暂停 Web Audio 处理，CPU 趋近 0）
  async suspendContext(audioElement: HTMLAudioElement): Promise<void> {
    const context = this.audioContexts.get(audioElement)
    if (context && context.state === 'running') {
      try {
        await context.suspend()
      } catch (error) {
        console.warn('AudioManager: 挂起 Context 失败:', error)
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
        this.equalizers.set(audioElement, filters)

        // ---- 创建效果器节点（保存引用，由 rebuildChain 按 bypass 状态动态连接） ----

        const bassBoost = ctx.createBiquadFilter()
        bassBoost.type = 'lowshelf'
        bassBoost.frequency.value = 200
        bassBoost.gain.value = 0
        this.bassBoostFilters.set(audioElement, bassBoost)

        const convolver = ctx.createConvolver()
        const surroundGain = ctx.createGain()
        surroundGain.gain.value = 0
        this.convolverNodes.set(audioElement, convolver)
        this.surroundGainNodes.set(audioElement, surroundGain)

        const balanceNode = ctx.createStereoPanner()
        this.balanceNodes.set(audioElement, balanceNode)

        const loudnessCompressor = ctx.createDynamicsCompressor()
        loudnessCompressor.threshold.value = 0
        loudnessCompressor.knee.value = 30
        loudnessCompressor.ratio.value = 1
        loudnessCompressor.attack.value = 0.003
        loudnessCompressor.release.value = 0.25
        this.loudnessCompressors.set(audioElement, loudnessCompressor)

        const loudnessMakeup = ctx.createGain()
        loudnessMakeup.gain.value = 1.0
        this.loudnessMakeupGains.set(audioElement, loudnessMakeup)

        // 保存节点快照，供 rebuildChain 断开/重连
        this.connectionPoints.set(audioElement, {
          source,
          context,
          eqFilters: filters,
          bassBoost,
          balance: balanceNode,
          convolver,
          surroundGain,
          loudnessComp: loudnessCompressor,
          loudnessMakeup,
          splitter: null as unknown as GainNode
        })

        // 确保分流器 + crossfade 链路已创建（固定结构，不受 bypass 影响）
        let splitter = this.splitters.get(audioElement)
        if (!splitter) {
          splitter = context.createGain()
          splitter.gain.value = 1.0

          const crossfadeLowpass = context.createBiquadFilter()
          crossfadeLowpass.type = 'lowpass'
          crossfadeLowpass.frequency.value = 22050
          crossfadeLowpass.Q.value = 0.707

          const crossfadeGain = context.createGain()
          // 启动时从 0 渐变到 1，避免 AudioContext 初次激活时的爆破音
          crossfadeGain.gain.setValueAtTime(0, context.currentTime)
          crossfadeGain.gain.linearRampToValueAtTime(1, context.currentTime + 0.05)

          splitter.connect(crossfadeLowpass)
          crossfadeLowpass.connect(crossfadeGain)
          crossfadeGain.connect(context.destination)

          this.crossfadeLowpasses.set(audioElement, crossfadeLowpass)
          this.crossfadeGains.set(audioElement, crossfadeGain)
          this.splitters.set(audioElement, splitter)
        }

        // 回填 splitter 引用
        const pts = this.connectionPoints.get(audioElement)
        if (pts) pts.splitter = splitter

        // 初始化 bypass 状态（默认全通），再由 rebuildChain 建立连接
        if (!this.bypassFlags.has(audioElement)) {
          this.bypassFlags.set(audioElement, {
            eqDisabled: false,
            bassDisabled: false,
            loudnessDisabled: false
          })
        }
        this.rebuildChain(audioElement)

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

        // 重建 crossfade 链：splitter -> lowpass -> gain -> destination
        const crossfadeLowpass = context.createBiquadFilter()
        crossfadeLowpass.type = 'lowpass'
        crossfadeLowpass.frequency.value = 22050
        crossfadeLowpass.Q.value = 0.707
        const crossfadeGain = context.createGain()
        crossfadeGain.gain.value = 1.0
        splitter.connect(crossfadeLowpass)
        crossfadeLowpass.connect(crossfadeGain)
        crossfadeGain.connect(context.destination)
        this.crossfadeLowpasses.set(audioElement, crossfadeLowpass)
        this.crossfadeGains.set(audioElement, crossfadeGain)

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

      // 清理其他音效节点
      const bassBoost = this.bassBoostFilters.get(audioElement)
      if (bassBoost) {
        try {
          bassBoost.disconnect()
        } catch {}
        this.bassBoostFilters.delete(audioElement)
      }

      const convolver = this.convolverNodes.get(audioElement)
      if (convolver) {
        try {
          convolver.disconnect()
        } catch {}
        this.convolverNodes.delete(audioElement)
      }

      const surroundGain = this.surroundGainNodes.get(audioElement)
      if (surroundGain) {
        try {
          surroundGain.disconnect()
        } catch {}
        this.surroundGainNodes.delete(audioElement)
      }

      const balance = this.balanceNodes.get(audioElement)
      if (balance) {
        try {
          balance.disconnect()
        } catch {}
        this.balanceNodes.delete(audioElement)
      }

      // 清理 crossfade 节点
      const cfLowpass = this.crossfadeLowpasses.get(audioElement)
      if (cfLowpass) {
        try {
          cfLowpass.disconnect()
        } catch {}
        this.crossfadeLowpasses.delete(audioElement)
      }
      const cfGain = this.crossfadeGains.get(audioElement)
      if (cfGain) {
        try {
          cfGain.disconnect()
        } catch {}
        this.crossfadeGains.delete(audioElement)
      }
      const envAnalyser = this.envelopeAnalysers.get(audioElement)
      if (envAnalyser) {
        try {
          envAnalyser.disconnect()
        } catch {}
        this.envelopeAnalysers.delete(audioElement)
      }

      // 清理动态旁路状态
      this.connectionPoints.delete(audioElement)
      this.bypassFlags.delete(audioElement)

      this.audioSources.delete(audioElement)
      this.audioContexts.delete(audioElement)

      console.log('AudioManager: 清理音频元素资源')
    } catch (error) {
      console.warn('AudioManager: 清理资源时出错:', error)
    }
  }

  // 重新连接音频处理管线（窗口最小化恢复时使用）
  // cleanupAudioElement 已关闭旧 AudioContext + 断开所有节点，
  // 此方法重试创建新链，处理 GC 时序问题（旧 MediaElementAudioSourceNode 未立即释放）
  async reconnectAudioElement(audioElement: HTMLAudioElement): Promise<boolean> {
    const maxRetries = 5
    for (let i = 0; i < maxRetries; i++) {
      try {
        this.getOrCreateAudioSource(audioElement)
        return true
      } catch (e) {
        if (i < maxRetries - 1) {
          // 等待 GC 释放旧 MediaElementAudioSourceNode
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
    }
    console.error('AudioManager: 重连音频管线最终失败')
    return false
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

  /**
   * 设置响度均衡 (Loudness Normalization)。
   *
   * 通过 DynamicsCompressor + makeup gain 把动态范围过大、平均音量过低的曲目
   * 拉到接近一致的感知响度。仅在软件内部音频链路生效，对系统/其他应用
   * (例如游戏) 的音量没有任何影响 —— 这正是"软件内开关"的意义所在。
   *
   * @param audioElement 目标音频元素
   * @param opts.enabled 是否开启
   * @param opts.target 目标强度：'gentle' 轻度 | 'standard' 标准 | 'strong' 强力
   */
  setLoudnessNormalization(
    audioElement: HTMLAudioElement,
    opts: { enabled: boolean; target?: 'gentle' | 'standard' | 'strong' }
  ): void {
    const compressor = this.loudnessCompressors.get(audioElement)
    const makeup = this.loudnessMakeupGains.get(audioElement)
    const ctx = this.audioContexts.get(audioElement)
    if (!compressor || !makeup || !ctx) return

    const now = ctx.currentTime
    if (!opts.enabled) {
      // bypass：把压缩器还原为透明 (ratio=1, threshold=0)，makeup=1.0
      try {
        compressor.threshold.setTargetAtTime(0, now, 0.05)
        compressor.ratio.setTargetAtTime(1, now, 0.05)
        compressor.knee.setTargetAtTime(30, now, 0.05)
        makeup.gain.setTargetAtTime(1.0, now, 0.05)
      } catch {
        compressor.threshold.value = 0
        compressor.ratio.value = 1
        compressor.knee.value = 30
        makeup.gain.value = 1.0
      }
      return
    }

    // 三档预设，参考广播 / 流媒体平台常用响度归一参数。
    // makeup gain 是补偿被压下去的能量，让最终响度更接近目标。
    const presets = {
      gentle: { threshold: -18, ratio: 2, knee: 24, makeup: 1.15 },
      standard: { threshold: -22, ratio: 3, knee: 20, makeup: 1.35 },
      strong: { threshold: -26, ratio: 4, knee: 16, makeup: 1.55 }
    } as const
    const p = presets[opts.target ?? 'standard']

    try {
      compressor.threshold.setTargetAtTime(p.threshold, now, 0.05)
      compressor.ratio.setTargetAtTime(p.ratio, now, 0.05)
      compressor.knee.setTargetAtTime(p.knee, now, 0.05)
      compressor.attack.setTargetAtTime(0.003, now, 0.05)
      compressor.release.setTargetAtTime(0.25, now, 0.05)
      makeup.gain.setTargetAtTime(p.makeup, now, 0.05)
    } catch {
      compressor.threshold.value = p.threshold
      compressor.ratio.value = p.ratio
      compressor.knee.value = p.knee
      makeup.gain.value = p.makeup
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

  // --- Crossfade Support ---

  /**
   * 获取元素的 crossfade gain 节点（用于无感过渡的音量控制）
   */
  getCrossfadeGain(audioElement: HTMLAudioElement): GainNode | null {
    return this.crossfadeGains.get(audioElement) || null
  }

  /**
   * 获取元素的 crossfade lowpass 节点（用于无感过渡的低通扫频）
   */
  getCrossfadeLowpass(audioElement: HTMLAudioElement): BiquadFilterNode | null {
    return this.crossfadeLowpasses.get(audioElement) || null
  }

  /**
   * 获取元素的 AudioContext（用于 CrossfadeManager 读取 currentTime 等）
   */
  getContext(audioElement: HTMLAudioElement): AudioContext | null {
    return this.audioContexts.get(audioElement) || null
  }

  /**
   * 获取或创建过渡时机检测专用的 envelope analyser。
   * tap 在 splitter 上，fftSize=512，与可视化分析器独立，不干扰频谱图。
   * 按需惰性创建。
   */
  getEnvelopeAnalyser(audioElement: HTMLAudioElement): AnalyserNode | null {
    let analyser = this.envelopeAnalysers.get(audioElement)
    if (analyser) return analyser

    const audioData = this.getOrCreateAudioSource(audioElement)
    if (!audioData) return null
    const { context } = audioData

    const splitter = this.splitters.get(audioElement)
    if (!splitter) return null

    try {
      analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.3
      splitter.connect(analyser)
      this.envelopeAnalysers.set(audioElement, analyser)
      return analyser
    } catch (error) {
      console.error('AudioManager: 创建 envelope analyser 失败:', error)
      return null
    }
  }

  /**
   * 复位 crossfade 节点到 bypass 状态（gain=1, lowpass freq=22050）。
   * 过渡完成或取消后调用。
   */
  resetCrossfadeNodes(audioElement: HTMLAudioElement): void {
    const ctx = this.audioContexts.get(audioElement)
    const gain = this.crossfadeGains.get(audioElement)
    const lowpass = this.crossfadeLowpasses.get(audioElement)
    if (!ctx) return
    const now = ctx.currentTime
    if (gain) {
      try {
        gain.gain.cancelScheduledValues(0)
        gain.gain.setValueAtTime(1, now)
      } catch {}
    }
    if (lowpass) {
      try {
        lowpass.frequency.cancelScheduledValues(0)
        lowpass.frequency.setValueAtTime(22050, now)
      } catch {}
    }
  }

  // ==================== 动态旁路：根据用户开关断开/重连节点 ====================

  /**
   * 根据当前 bypassFlags 重建从 source 到 splitter 的音频处理链路。
   * 关闭的效果器节点被物理断开，不参与 AudioContext 渲染，零 CPU 消耗。
   */
  private rebuildChain(audioElement: HTMLAudioElement): void {
    const pts = this.connectionPoints.get(audioElement)
    const flags = this.bypassFlags.get(audioElement)
    if (!pts || !flags) return

    const {
      source, eqFilters, bassBoost, convolver, surroundGain,
      balance, loudnessComp, loudnessMakeup, splitter
    } = pts

    // 断开所有可变连接（从 source 到 loudnessMakeup）
    source.disconnect()
    for (const f of eqFilters) f.disconnect()
    bassBoost.disconnect()
    balance.disconnect()
    loudnessComp.disconnect()
    loudnessMakeup.disconnect()
    surroundGain.disconnect()
    convolver.disconnect()

    // ---- Stage 1: EQ ----
    const stage1Out: AudioNode = flags.eqDisabled
      ? source
      : (source.connect(eqFilters[0]), eqFilters[eqFilters.length - 1])

    // ---- Stage 2: Bass Boost ----
    if (flags.bassDisabled) {
      stage1Out.connect(balance)
    } else {
      stage1Out.connect(bassBoost)
    }
    const stage2Out: AudioNode = flags.bassDisabled ? stage1Out : bassBoost

    // ---- Stage 3: Balance + Surround (并发路，始终从 stage2Out 分接) ----
    stage2Out.connect(balance)
    stage2Out.connect(convolver)
    convolver.connect(surroundGain)
    surroundGain.connect(balance)

    // ---- Stage 4: Loudness ----
    if (flags.loudnessDisabled) {
      balance.connect(splitter)
    } else {
      balance.connect(loudnessComp)
      loudnessComp.connect(loudnessMakeup)
      loudnessMakeup.connect(splitter)
    }
  }

  /**
   * 开关 EQ 旁路。关闭时 10 个 Biquad 滤波器被物理移除出音频链。
   * 已处于目标状态时 no-op。
   */
  setEQEnabled(audioElement: HTMLAudioElement, enabled: boolean): void {
    const flags = this.bypassFlags.get(audioElement)
    const currentDisabled = flags?.eqDisabled ?? false
    if (currentDisabled === !enabled) return
    if (!flags) {
      this.bypassFlags.set(audioElement, { eqDisabled: !enabled, bassDisabled: false, loudnessDisabled: false })
    } else {
      flags.eqDisabled = !enabled
    }
    this.rebuildChain(audioElement)
  }

  /**
   * 开关 Bass Boost 旁路。关闭时 lowshelf 滤波器被移除出音频链。
   * 已处于目标状态时 no-op。
   */
  setBassBoostEnabled(audioElement: HTMLAudioElement, enabled: boolean): void {
    const flags = this.bypassFlags.get(audioElement)
    const currentDisabled = flags?.bassDisabled ?? false
    if (currentDisabled === !enabled) return
    if (!flags) {
      this.bypassFlags.set(audioElement, { eqDisabled: false, bassDisabled: !enabled, loudnessDisabled: false })
    } else {
      flags.bassDisabled = !enabled
    }
    this.rebuildChain(audioElement)
  }

  /**
   * 开关 Loudness 旁路。关闭时 DynamicsCompressor + MakeupGain 被移除出音频链。
   * 已处于目标状态时 no-op。
   */
  setLoudnessEnabled(audioElement: HTMLAudioElement, enabled: boolean): void {
    const flags = this.bypassFlags.get(audioElement)
    const currentDisabled = flags?.loudnessDisabled ?? false
    if (currentDisabled === !enabled) return
    if (!flags) {
      this.bypassFlags.set(audioElement, { eqDisabled: false, bassDisabled: false, loudnessDisabled: !enabled })
    } else {
      flags.loudnessDisabled = !enabled
    }
    this.rebuildChain(audioElement)
  }
}

export default AudioManager.getInstance()
