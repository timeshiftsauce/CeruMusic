<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const containerRef = ref<HTMLElement | null>(null)
const isHovering = ref(false)
const isReady = ref(false)

let teardown: (() => void) | null = null
let setHover: ((on: boolean) => void) | null = null

function onEnter() {
  isHovering.value = true
  setHover?.(true)
  void initEffect()
}

function onLeave() {
  isHovering.value = false
  setHover?.(false)
}

async function initEffect() {
  if (teardown || !containerRef.value) return

  const THREE = await import('three')
  if (!containerRef.value) return

  const container = containerRef.value
  const PARTICLE_COUNT = 60000
  const POINT_SIZE = 200

  const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uMorph;
    uniform float uPointSize;
    uniform float uHover;
    attribute vec3 targetPosition;
    attribute vec3 targetColor;
    attribute vec3 color;
    attribute vec3 randomOffset;
    varying vec3 vColor;
    varying float vDistance;
    void main() {
      vColor = mix(color, targetColor, uMorph);
      vec3 pos = mix(position, targetPosition, uMorph);
      float n = sin(uTime * 1.5 + position.x * 0.3) * cos(uTime * 1.5 + position.y * 0.3);
      pos += normalize(pos + 0.0001) * n * (0.2 * (1.0 - uMorph));
      pos.x += sin(uTime * 0.3 + position.z) * 0.1;
      pos.y += cos(uTime * 0.3 + position.x) * 0.1;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float dist = length(pos);
      vDistance = dist;
      gl_PointSize = (uPointSize / -mvPosition.z) * (1.2 + sin(uTime * 3.0 + dist * 0.15) * 0.5);
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    varying vec3 vColor;
    varying float vDistance;
    void main() {
      float dist = distance(gl_PointCoord, vec2(0.5));
      if (dist > 0.5) discard;
      float strength = pow(1.0 - dist * 2.0, 1.6);
      vec3 finalColor = vColor * 2.0;
      float alpha = strength * (0.8 + sin(vDistance * 0.3 + uTime) * 0.2);
      gl_FragColor = vec4(finalColor, alpha);
    }
  `

  const width = container.clientWidth || 320
  const height = container.clientHeight || 320

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000)
  camera.position.z = 45

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.appendChild(renderer.domElement)

  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const targetPositions = new Float32Array(PARTICLE_COUNT * 3)
  const colors = new Float32Array(PARTICLE_COUNT * 3)
  const targetColors = new Float32Array(PARTICLE_COUNT * 3)
  const randomOffsets = new Float32Array(PARTICLE_COUNT * 3)

  const greenColor = new THREE.Color(0x00ff66)
  const brightWhite = new THREE.Color(0xffffff)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3
    const t = (Math.random() - 0.5) * 4.0
    const angle = Math.random() * Math.PI * 2
    const radiusBase = 0.4 + Math.pow(Math.abs(t), 2.4)
    const radius = radiusBase * (0.75 + Math.random() * 0.55)
    const x = radius * Math.cos(angle) * 2.0
    const z = radius * Math.sin(angle) * 2.0
    const y = t * 5.0
    positions[i3] = x
    positions[i3 + 1] = y
    positions[i3 + 2] = z
    targetPositions[i3] = x
    targetPositions[i3 + 1] = y
    targetPositions[i3 + 2] = z
    randomOffsets[i3] = (Math.random() - 0.5) * 2
    randomOffsets[i3 + 1] = (Math.random() - 0.5) * 2
    randomOffsets[i3 + 2] = (Math.random() - 0.5) * 2
    const color = Math.random() > 0.7 ? greenColor : brightWhite
    colors[i3] = color.r
    colors[i3 + 1] = color.g
    colors[i3 + 2] = color.b
    targetColors[i3] = color.r
    targetColors[i3 + 1] = color.g
    targetColors[i3 + 2] = color.b
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('targetPosition', new THREE.BufferAttribute(targetPositions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('targetColor', new THREE.BufferAttribute(targetColors, 3))
  geometry.setAttribute('randomOffset', new THREE.BufferAttribute(randomOffsets, 3))

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPointSize: { value: POINT_SIZE },
      uHover: { value: 0 }
    },
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  const points = new THREE.Points(geometry, material)
  scene.add(points)

  let hoverTarget = 0

  // Sample logo.svg pixels to set particle target shape (logo morph)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const resolution = 200
    const canvas = document.createElement('canvas')
    canvas.width = resolution
    canvas.height = resolution
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, resolution, resolution)
    const aspect = img.width / img.height
    const drawW = aspect > 1 ? resolution : resolution * aspect
    const drawH = aspect > 1 ? resolution / aspect : resolution
    ctx.drawImage(img, (resolution - drawW) / 2, (resolution - drawH) / 2, drawW, drawH)
    const data = ctx.getImageData(0, 0, resolution, resolution).data
    const pts: { pos: [number, number, number]; col: [number, number, number] }[] = []
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const idx = (y * resolution + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        if ((r + g + b) / 3 > 25) {
          pts.push({
            pos: [
              (x / resolution - 0.5) * 38,
              (0.5 - y / resolution) * 38,
              ((r + g + b) / 765 - 0.5) * 12
            ],
            col: [r / 255, g / 255, b / 255]
          })
        }
      }
    }
    if (pts.length === 0) return
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const p = pts[i % pts.length]
      targetPositions[i3] = p.pos[0] + (Math.random() - 0.5) * 0.4
      targetPositions[i3 + 1] = p.pos[1] + (Math.random() - 0.5) * 0.4
      targetPositions[i3 + 2] = p.pos[2] + (Math.random() - 0.5) * 1.5
      targetColors[i3] = p.col[0]
      targetColors[i3 + 1] = p.col[1]
      targetColors[i3 + 2] = p.col[2]
    }
    geometry.attributes.targetPosition.needsUpdate = true
    geometry.attributes.targetColor.needsUpdate = true
    isReady.value = true
  }
  img.src = '/logo.svg'

  let time = 0
  let morphFactor = 0
  let hoverFactor = 0
  let rafId = 0

  const tick = () => {
    rafId = requestAnimationFrame(tick)
    time += 0.008
    points.rotation.y += 0.0025
    points.rotation.z += 0.001
    points.rotation.x = Math.sin(time * 0.15) * 0.12
    material.uniforms.uTime.value = time
    morphFactor += (hoverTarget - morphFactor) * 0.06
    material.uniforms.uMorph.value = morphFactor
    hoverFactor += (hoverTarget - hoverFactor) * 0.08
    material.uniforms.uHover.value = hoverFactor
    renderer.render(scene, camera)
  }
  tick()

  const handleResize = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const ro = new ResizeObserver(handleResize)
  ro.observe(container)

  setHover = (on: boolean) => {
    hoverTarget = on ? 1 : 0
  }

  teardown = () => {
    cancelAnimationFrame(rafId)
    ro.disconnect()
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement)
    }
    setHover = null
    teardown = null
  }
}

onMounted(() => {
  // Initialize eagerly so the first hover is instant; the canvas stays
  // hidden under the static logo until the user hovers.
  void initEffect()
})

onBeforeUnmount(() => {
  teardown?.()
})
</script>

<template>
  <div
    class="hero-logo"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focusin="onEnter"
    @focusout="onLeave"
  >
    <img
      class="hero-logo__img"
      :class="{ 'hero-logo__img--hidden': isHovering && isReady }"
      src="/logo.svg"
      alt="Ceru Music"
      draggable="false"
    />
    <div
      ref="containerRef"
      class="hero-logo__canvas"
      :class="{ 'hero-logo__canvas--visible': isHovering && isReady }"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.hero-logo {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 192px;
  height: 192px;
  transform: translate(-50%, -50%);
  cursor: pointer;
}

@media (min-width: 640px) {
  .hero-logo {
    width: 256px;
    height: 256px;
  }
}

@media (min-width: 960px) {
  .hero-logo {
    width: 320px;
    height: 320px;
  }
}

.hero-logo__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition:
    opacity 0.45s ease,
    transform 0.45s ease,
    filter 0.45s ease;
  will-change: opacity, transform;
}

.hero-logo__img--hidden {
  opacity: 0;
  transform: scale(0.92);
  filter: blur(6px);
}

.hero-logo__canvas {
  position: absolute;
  inset: -25%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.45s ease;
}

.hero-logo__canvas--visible {
  opacity: 1;
}
</style>
