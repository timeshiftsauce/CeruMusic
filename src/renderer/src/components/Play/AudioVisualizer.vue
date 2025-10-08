<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { storeToRefs } from 'pinia'
import audioManager from '@renderer/utils/audio/audioManager'

interface Props {
  show?: boolean
  height?: number
  barCount?: number
  color?: string
  backgroundColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: true,
  height: 80,
  barCount: 64,
  color: 'rgba(255, 255, 255, 0.8)',
  backgroundColor: 'transparent'
})

// 定义事件
const emit = defineEmits<{
  lowFreqUpdate: [volume: number]
}>()

const canvasRef = ref<HTMLCanvasElement>()
const animationId = ref<number>()
const analyser = ref<AnalyserNode>()
// 节流渲染，目标 ~30fps
const lastFrameTime = ref(0)
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
const draw = (ts?: number) => {
  if (!canvasRef.value || !analyser.value || !dataArray.value) return

  // 帧率节流 ~30fps
  const now = ts ?? performance.now()
  if (now - lastFrameTime.value < 33) {
    animationId.value = requestAnimationFrame(draw)
    return
  }
  lastFrameTime.value = now

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    animationId.value = requestAnimationFrame(draw)
    return
  }

  // 获取频域数据或生成模拟数据
  if (analyser.value && dataArray.value) {
    analyser.value.getByteFrequencyData(dataArray.value as Uint8Array<ArrayBuffer>)
  } else {
    const time = now * 0.001
    for (let i = 0; i < dataArray.value.length; i++) {
      const frequency = i / dataArray.value.length
      const amplitude = Math.sin(time * 2 + frequency * 10) * 0.5 + 0.5
      const bass = Math.sin(time * 4) * 0.3 + 0.7
      dataArray.value[i] = Math.floor(amplitude * bass * 255 * (1 - frequency * 0.7))
    }
  }

  // 计算低频音量（前 3 个 bin）
  let lowFreqSum = 0
  const lowBins = Math.min(3, dataArray.value.length)
  for (let i = 0; i < lowBins; i++) lowFreqSum += dataArray.value[i]
  emit('lowFreqUpdate', lowFreqSum / lowBins / 255)

  // 清屏
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 背景
  if (props.backgroundColor !== 'transparent') {
    ctx.fillStyle = props.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // 计算尺寸
  const container = canvas.parentElement
  if (!container) {
    animationId.value = requestAnimationFrame(draw)
    return
  }
  const containerRect = container.getBoundingClientRect()
  const canvasWidth = containerRect.width
  const canvasHeight = props.height

  // 柱状参数
  const halfBarCount = Math.floor(props.barCount / 2)
  const barWidth = canvasWidth / 2 / halfBarCount
  const maxBarHeight = canvasHeight * 0.9
  const centerX = canvasWidth / 2

  // 每帧仅创建一次渐变（自底向上），减少对象分配
  const gradient = ctx.createLinearGradient(0, canvasHeight, 0, 0)
  gradient.addColorStop(0, props.color)
  gradient.addColorStop(1, props.color.replace(/[\d\.]+\)$/g, '0.3)'))
  ctx.fillStyle = gradient

  // 绘制对称频谱
  for (let i = 0; i < halfBarCount; i++) {
    let barHeight = (dataArray.value[i] / 255) * maxBarHeight
    barHeight = Math.pow(barHeight / maxBarHeight, 0.6) * maxBarHeight
    const y = canvasHeight - barHeight

    const leftX = centerX - (i + 1) * barWidth
    ctx.fillRect(leftX, y, barWidth, barHeight)

    const rightX = centerX + i * barWidth
    ctx.fillRect(rightX, y, barWidth, barHeight)
  }

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
    // 通知管理器移除对该分析器的引用，防止 Map 持有导致 GC 不回收
    try {
      audioManager.removeAnalyser(componentId.value)
    } catch {}
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
