<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { storeToRefs } from 'pinia'
import audioManager from '@renderer/utils/audioManager'

interface Props {
  show?: boolean
  height?: number
  barCount?: number
  color?: string
  backgroundColor?: string
}

// 定义事件
const emit = defineEmits<{
  lowFreqUpdate: [volume: number]
}>()

const props = withDefaults(defineProps<Props>(), {
  show: true,
  height: 80,
  barCount: 64,
  color: 'rgba(255, 255, 255, 0.8)',
  backgroundColor: 'transparent'
})

const canvasRef = ref<HTMLCanvasElement>()
const animationId = ref<number>()
const analyser = ref<AnalyserNode>()
const dataArray = ref<Uint8Array>()
const resizeObserver = ref<ResizeObserver>()
const componentId = ref<string>(`visualizer-${Date.now()}-${Math.random()}`)

const controlAudio = ControlAudioStore()
const { Audio } = storeToRefs(controlAudio)

// 初始化音频分析器
const initAudioAnalyser = () => {
  if (!Audio.value.audio) return

  try {
    // 计算所需的 fftSize - 必须是 2 的幂次方
    const minSize = props.barCount * 2
    let fftSize = 32
    while (fftSize < minSize) {
      fftSize *= 2
    }
    fftSize = Math.min(fftSize, 2048) // 限制最大值

    // 使用音频管理器创建分析器
    const createdAnalyser = audioManager.createAnalyser(
      Audio.value.audio,
      componentId.value,
      fftSize
    )
    analyser.value = createdAnalyser || undefined

    if (analyser.value) {
      // 创建数据数组，明确指定 ArrayBuffer 类型
      const bufferLength = analyser.value.frequencyBinCount
      dataArray.value = new Uint8Array(new ArrayBuffer(bufferLength))
      console.log('音频分析器初始化成功')
    } else {
      console.warn('无法创建音频分析器，使用模拟数据')
      // 创建一个默认大小的数据数组用于模拟数据
      const bufferLength = fftSize / 2
      dataArray.value = new Uint8Array(new ArrayBuffer(bufferLength))
    }
  } catch (error) {
    console.error('音频分析器初始化失败:', error)
    // 创建一个默认大小的数据数组用于模拟数据
    dataArray.value = new Uint8Array(new ArrayBuffer(256))
  }
}

// 绘制可视化
const draw = () => {
  if (!canvasRef.value || !analyser.value || !dataArray.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 获取频域数据或生成模拟数据
  if (analyser.value && dataArray.value) {
    // 有真实音频分析器，获取真实数据
    analyser.value.getByteFrequencyData(dataArray.value as Uint8Array<ArrayBuffer>)
  } else {
    // 没有音频分析器，生成模拟数据
    const time = Date.now() * 0.001
    for (let i = 0; i < dataArray.value.length; i++) {
      // 生成基于时间的模拟频谱数据
      const frequency = i / dataArray.value.length
      const amplitude = Math.sin(time * 2 + frequency * 10) * 0.5 + 0.5
      const bass = Math.sin(time * 4) * 0.3 + 0.7 // 低频变化
      dataArray.value[i] = Math.floor(amplitude * bass * 255 * (1 - frequency * 0.7))
    }
  }

  // 计算低频音量 (80hz-120hz 范围)
  // 假设采样率为 44100Hz，fftSize 为 256，则每个频率 bin 约为 172Hz
  // 80-120Hz 大约对应前 1-2 个 bin
  const lowFreqStart = 0
  const lowFreqEnd = Math.min(3, dataArray.value.length) // 取前几个低频 bin
  let lowFreqSum = 0
  for (let i = lowFreqStart; i < lowFreqEnd; i++) {
    lowFreqSum += dataArray.value[i]
  }
  const lowFreqVolume = lowFreqSum / (lowFreqEnd - lowFreqStart) / 255

  // 发送低频音量给父组件
  emit('lowFreqUpdate', lowFreqVolume)

  // 完全清空画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 如果有背景色，再填充背景
  if (props.backgroundColor !== 'transparent') {
    ctx.fillStyle = props.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // 使用容器的实际尺寸进行计算，因为 ctx 已经缩放过了
  const container = canvas.parentElement
  if (!container) return

  const containerRect = container.getBoundingClientRect()
  const canvasWidth = containerRect.width
  const canvasHeight = props.height

  // 计算对称柱状图参数
  const halfBarCount = Math.floor(props.barCount / 2)
  const barWidth = canvasWidth / 2 / halfBarCount
  const maxBarHeight = canvasHeight * 0.9
  const centerX = canvasWidth / 2

  // 绘制左右对称的频谱柱状图
  for (let i = 0; i < halfBarCount; i++) {
    // 增强低频响应，让可视化更敏感
    let barHeight = (dataArray.value[i] / 255) * maxBarHeight

    // 对数据进行增强处理，让变化更明显
    barHeight = Math.pow(barHeight / maxBarHeight, 0.6) * maxBarHeight

    const y = canvasHeight - barHeight

    // 创建渐变色
    const gradient = ctx.createLinearGradient(0, canvasHeight, 0, y)
    gradient.addColorStop(0, props.color)
    gradient.addColorStop(1, props.color.replace(/[\d\.]+\)$/g, '0.3)'))

    ctx.fillStyle = gradient

    // 绘制左侧柱状图（从中心向左）
    const leftX = centerX - (i + 1) * barWidth
    ctx.fillRect(leftX, y, barWidth, barHeight)

    // 绘制右侧柱状图（从中心向右）
    const rightX = centerX + i * barWidth
    ctx.fillRect(rightX, y, barWidth, barHeight)
  }

  // 继续动画
  if (props.show && Audio.value.isPlay) {
    animationId.value = requestAnimationFrame(draw)
  }
}

// 开始可视化
const startVisualization = () => {
  if (!props.show || !Audio.value.isPlay) return

  if (!analyser.value) {
    initAudioAnalyser()
  }

  draw()
}

// 停止可视化
const stopVisualization = () => {
  try {
    if (animationId.value) {
      cancelAnimationFrame(animationId.value)
      animationId.value = undefined
    }
  } catch (error) {
    console.warn('停止动画帧时出错:', error)
  }
}

// 监听播放状态变化
watch(
  () => Audio.value.isPlay,
  (isPlaying) => {
    if (isPlaying && props.show) {
      startVisualization()
    } else {
      stopVisualization()
    }
  }
)

// 监听显示状态变化
watch(
  () => props.show,
  (show) => {
    if (show && Audio.value.isPlay) {
      startVisualization()
    } else {
      stopVisualization()
    }
  }
)

// 设置画布尺寸的函数
const resizeCanvas = () => {
  if (!canvasRef.value) return

  const canvas = canvasRef.value
  const container = canvas.parentElement
  if (!container) return

  // 获取容器的实际尺寸
  const containerRect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  // 设置 canvas 的实际尺寸
  canvas.width = containerRect.width * dpr
  canvas.height = props.height * dpr

  // 设置 CSS 尺寸
  canvas.style.width = containerRect.width + 'px'
  canvas.style.height = props.height + 'px'

  const ctx = canvas.getContext('2d')
  if (ctx) {
    // 重置变换矩阵并重新缩放
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
  }

  console.log('Canvas resized:', containerRect.width, 'x', props.height)
}

// 组件挂载
onMounted(() => {
  if (canvasRef.value) {
    resizeCanvas()

    // 使用 ResizeObserver 监听容器尺寸变化
    resizeObserver.value = new ResizeObserver((entries) => {
      for (const _entry of entries) {
        // 使用 nextTick 确保 DOM 更新完成
        nextTick(() => {
          resizeCanvas()
        })
      }
    })

    // 观察 canvas 元素的父容器
    const container = canvasRef.value.parentElement
    if (container) {
      resizeObserver.value.observe(container)
    }
  }

  if (Audio.value.audio && props.show && Audio.value.isPlay) {
    initAudioAnalyser()
    startVisualization()
  }
})

// 组件卸载
onBeforeUnmount(() => {
  console.log('AudioVisualizer 组件开始卸载')

  // 停止可视化动画
  stopVisualization()

  // 清理音频上下文和相关资源
  try {
    // 只断开分析器连接，不断开共享的音频源
    if (analyser.value) {
      analyser.value.disconnect()
      analyser.value = undefined
    }
  } catch (error) {
    console.warn('清理音频资源时出错:', error)
  }

  // 断开 ResizeObserver
  try {
    if (resizeObserver.value) {
      resizeObserver.value.disconnect()
      resizeObserver.value = undefined
    }
  } catch (error) {
    console.warn('断开 ResizeObserver 时出错:', error)
  }

  // 清理数据数组
  dataArray.value = undefined

  console.log('AudioVisualizer 组件卸载完成')
})
</script>

<template>
  <div class="audio-visualizer" :style="{ height: `${height}px` }">
    <canvas ref="canvasRef" class="visualizer-canvas" :style="{ height: `${height}px` }" />
  </div>
</template>

<style lang="scss" scoped>
.audio-visualizer {
  width: 100%;
  position: relative;
  overflow: hidden;

  .visualizer-canvas {
    width: 100%;
    display: block;
    border-radius: 4px;
  }
}
</style>
