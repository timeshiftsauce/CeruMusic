<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ height?: number; barCount?: number; color?: string; backgroundColor?: string; continuous?: boolean }>(), {
  height: 80, barCount: 64, color: 'rgba(255, 255, 255, 0.8)', backgroundColor: 'transparent'
})
const canvas = ref<HTMLCanvasElement>()
const bandY = new Float64Array(65)
let observer: ResizeObserver | undefined
let latest: ArrayLike<number> = []
let width = 0
let lastFrame = -Infinity
let gradient: CanvasGradient | undefined

function draw(samples: ArrayLike<number>, timestamp = performance.now(), force = false) {
  latest = samples
  if (!canvas.value || !width || (!force && timestamp - lastFrame < 33)) return
  const context = canvas.value.getContext('2d')
  if (!context) return
  lastFrame = timestamp
  const height = props.height
  context.clearRect(0, 0, width, height)
  if (props.backgroundColor !== 'transparent') {
    context.fillStyle = props.backgroundColor
    context.fillRect(0, 0, width, height)
  }
  if (!gradient) {
    const color = getComputedStyle(canvas.value).color
    gradient = context.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, color.replace(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,[^)]+)?\)$/, 'rgba($1,$2,$3,0.3)'))
  }
  context.fillStyle = gradient
  const pairs = Math.max(1, Math.min(64, Math.floor(props.barCount / 2)))
  const barWidth = width / (2 * pairs)
  const bandHeight = (index: number) => {
    const value = Math.max(0, Math.min(1, samples[index] || 0))
    return Math.pow(value, 0.6) * height * 0.9
  }

  if (props.continuous) {
    for (let index = 0; index < pairs; index++) {
      bandY[index] = height - bandHeight(index)
    }
    bandY[pairs] = height

    context.beginPath()
    context.moveTo(0, height)
    let previousY = height
    let previousSlope = 0
    for (let step = 1; step <= 2 * pairs; step++) {
      const y = bandY[Math.abs(step - pairs)]
      const nextY = bandY[Math.min(pairs, Math.abs(step + 1 - pairs))]
      const incoming = y - previousY
      const outgoing = nextY - y
      // Keep a flat tangent at peaks and valleys so interpolation cannot overshoot.
      const slope = incoming * outgoing > 0 ? (2 * incoming * outgoing) / (incoming + outgoing) : 0
      const x = step * barWidth
      context.bezierCurveTo(
        x - (2 * barWidth) / 3,
        previousY + previousSlope / 3,
        x - barWidth / 3,
        y - slope / 3,
        x,
        y
      )
      previousY = y
      previousSlope = slope
    }
    context.closePath()
    context.fill()
    return
  }

  for (let index = 0; index < pairs; index++) {
    const barHeight = bandHeight(index)
    context.fillRect(width / 2 - (index + 1) * barWidth, height - barHeight, barWidth, barHeight)
    context.fillRect(width / 2 + index * barWidth, height - barHeight, barWidth, barHeight)
  }
}

function resize() {
  if (!canvas.value) return
  const ratio = window.devicePixelRatio || 1
  width = canvas.value.getBoundingClientRect().width
  canvas.value.width = Math.round(width * ratio)
  canvas.value.height = Math.round(props.height * ratio)
  canvas.value.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0)
  gradient = undefined
  draw(latest, performance.now(), true)
}

watch(() => props.height, resize, { flush: 'post' })
watch(() => [props.color, props.barCount, props.backgroundColor, props.continuous], () => {
  gradient = undefined
  draw(latest, performance.now(), true)
}, { flush: 'post' })
onMounted(() => {
  resize()
  observer = new ResizeObserver(resize)
  if (canvas.value) observer.observe(canvas.value)
})
onBeforeUnmount(() => observer?.disconnect())
defineExpose({ draw })
</script>

<template>
  <div class="audio-visualizer" role="img" aria-label="频谱" :style="{ height: `${height}px` }">
    <canvas
      ref="canvas"
      class="visualizer-canvas"
      :class="{ 'soft-edges': continuous }"
      :style="{ height: `${height}px`, color }"
    />
  </div>
</template>

<style scoped>
.audio-visualizer { width: 100%; position: relative; overflow: hidden; }
.visualizer-canvas { width: 100%; display: block; border-radius: 4px; }
.visualizer-canvas.soft-edges {
  --edge-fade: min(2.5%, 96px);
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 var(--edge-fade),
    #000 calc(100% - var(--edge-fade)),
    transparent
  );
}
</style>
