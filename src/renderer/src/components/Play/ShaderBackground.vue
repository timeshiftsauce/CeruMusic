<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { extractColors, Color } from '@renderer/utils/colorExtractor'
import DefaultCover from '@renderer/assets/images/Default.jpg'
import CoverImage from '@renderer/assets/images/cover.png'

const props = defineProps<{
  coverImage: string
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let animationFrameId: number | null = null
let startTime = Date.now()
let dominantColor = ref({ r: 0.3, g: 0.3, b: 0.5 })
let colorPalette = ref<Color[]>([
  { r: 76, g: 116, b: 206 }, // 蓝色
  { r: 120, g: 80, b: 180 }, // 紫色
  { r: 60, g: 160, b: 160 } // 青色
])

// 处理图片路径
const actualCoverImage = computed(() => {
  if (
    props.coverImage.includes('@assets/images/Default.jpg') ||
    props.coverImage.includes('@renderer/assets/images/Default.jpg')
  ) {
    return DefaultCover
  } else if (
    props.coverImage.includes('@assets/images/cover.png') ||
    props.coverImage.includes('@renderer/assets/images/cover.png')
  ) {
    return CoverImage
  }
  return props.coverImage
})

// 顶点着色器
const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`

// 片元着色器 - 实现分数布朗运动(FBM)流体效果
const fragmentShaderSource = `
  precision highp float;
  varying vec2 v_texCoord;
  uniform float u_time;
  uniform vec3 u_color;
  
  // 改进的随机函数 - 更平滑
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  
  // 改进的噪声函数 - 使用三次Hermite插值，更平滑
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    
    // 四个角的随机值
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    // 使用三次Hermite插值，更加平滑
    vec2 u = f * f * (3.0 - 2.0 * f);
    
    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }
  
  // 改进的分数布朗运动 - 降低频率，减少网格感
  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.6; // 降低初始频率
    
    // 减少迭代次数，使用更平滑的混合
    for (int i = 0; i < 4; i++) { // 减少迭代次数
      value += amplitude * noise(st * frequency);
      frequency *= 1.8; // 降低频率增长率
      amplitude *= 0.6; // 提高振幅衰减率
    }
    
    // 额外的平滑处理
    return smoothstep(0.2, 0.8, value);
  }
  
  // HSV转RGB颜色
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  
  void main() {
    // 使用时间和位置创建动态效果
    vec2 st = v_texCoord;
    float time = u_time * 0.20; // 降低时间速率，使动画更平滑
    
    // 创建更平滑的移动噪声场
    vec2 q = vec2(
      fbm(st + vec2(0.0, time * 0.3)),
      fbm(st + vec2(time * 0.2, 0.0))
    );
    
    // 使用q创建第二层噪声，降低强度
    vec2 r = vec2(
      fbm(st + 2.0 * q + vec2(1.7, 9.2) + time * 0.1),
      fbm(st + 2.0 * q + vec2(8.3, 2.8) + time * 0.08)
    );
    
    // 最终的噪声值 - 额外平滑处理
    float f = fbm(st + r * 0.7);
    
    // 从主色调提取HSV
    vec3 baseColor = u_color;
    float maxComp = max(max(baseColor.r, baseColor.g), baseColor.b);
    float minComp = min(min(baseColor.r, baseColor.g), baseColor.b);
    float delta = maxComp - minComp;
    
    // 估算色相
    float hue = 0.0;
    if (delta > 0.0) {
      if (maxComp == baseColor.r) {
        hue = (baseColor.g - baseColor.b) / delta + (baseColor.g < baseColor.b ? 6.0 : 0.0);
      } else if (maxComp == baseColor.g) {
        hue = (baseColor.b - baseColor.r) / delta + 2.0;
      } else {
        hue = (baseColor.r - baseColor.g) / delta + 4.0;
      }
      hue /= 6.0;
    }
    
    // 估算饱和度和明度
    float saturation = maxComp == 0.0 ? 0.0 : delta / maxComp;
    float value = maxComp;
    
    // 提高基础亮度和饱和度，使颜色更加明亮清新
    saturation = min(saturation * 1.0, 1.0);  // 增加饱和度
    value = min(value * 1.3, 1.0);            // 增加亮度
    
    // 创建多个颜色变体 - 更明亮的变体
    vec3 color1 = hsv2rgb(vec3(hue, saturation * 0.9, min(value * 1.1, 1.0)));
    vec3 color2 = hsv2rgb(vec3(mod(hue + 0.05, 1.0), min(saturation * 1.3, 1.0), min(value * 1.2, 1.0)));
    vec3 color3 = hsv2rgb(vec3(mod(hue + 0.1, 1.0), min(saturation * 1.1, 1.0), min(value * 1.15, 1.0)));
    vec3 color4 = hsv2rgb(vec3(mod(hue - 0.05, 1.0), min(saturation * 1.2, 1.0), min(value * 1.25, 1.0)));
    
    // 使用噪声值混合多个颜色 - 更平滑的混合，使用更多主色调
    float t1 = smoothstep(0.0, 1.0, f);
    float t2 = sin(f * 3.14) * 0.5 + 0.5;
    float t3 = cos(f * 2.0 + time * 0.5) * 0.5 + 0.5;
    float t4 = sin(f * 4.0 + time * 0.3) * 0.5 + 0.5; // 额外的混合因子
    
    // 创建两个额外的颜色变体，增加色彩丰富度
    vec3 color5 = hsv2rgb(vec3(mod(hue + 0.15, 1.0), min(saturation * 1.4, 1.0), min(value * 1.3, 1.0)));
    vec3 color6 = hsv2rgb(vec3(mod(hue - 0.15, 1.0), min(saturation * 1.3, 1.0), min(value * 1.2, 1.0)));
    
    // 混合所有颜色
    vec3 colorMix1 = mix(color1, color2, t1);
    vec3 colorMix2 = mix(color3, color4, t2);
    vec3 colorMix3 = mix(color5, color6, t4);
    
    vec3 color = mix(
      mix(colorMix1, colorMix2, t3),
      colorMix3,
      sin(f * 2.5 + time * 0.4) * 0.5 + 0.5
    );
    
    // 添加更多的动态亮点和波纹
    color += 0.15 * sin(f * 8.0 + time) * vec3(1.0);
    
    // 增加波纹效果
    float ripple1 = sin(st.x * 12.0 + time * 0.8) * sin(st.y * 12.0 + time * 0.7) * 0.06;
    float ripple2 = sin(st.x * 8.0 - time * 0.6) * sin(st.y * 8.0 - time * 0.5) * 0.05;
    float ripple3 = sin(st.x * 15.0 + time * 0.4) * sin(st.y * 15.0 + time * 0.3) * 0.04;
    
    // 混合多层波纹
    color += vec3(ripple1 + ripple2 + ripple3);
    
    // 添加更大范围、更柔和的光晕效果
    float glow = smoothstep(0.3, 0.7, f);
    color = mix(color, vec3(1.0), glow * 0.12);
    
    // 添加柔和的渐变效果，进一步减少网格感
    float vignette = smoothstep(0.0, 0.7, 0.5 - length(st - 0.5));
    color = mix(color, color * 1.2, vignette * 0.3);
    
    // 应用高斯模糊效果，减少锐利的网格边缘
    vec2 pixel = vec2(1.0) / vec2(800.0, 600.0); // 假设的分辨率
    float blur = 0.0;
    
    // 简化的高斯模糊 - 只采样几个点以保持性能
    blur += f * 0.5;
    blur += fbm(st + pixel * vec2(1.0, 0.0)) * 0.125;
    blur += fbm(st + pixel * vec2(-1.0, 0.0)) * 0.125;
    blur += fbm(st + pixel * vec2(0.0, 1.0)) * 0.125;
    blur += fbm(st + pixel * vec2(0.0, -1.0)) * 0.125;
    
    // 使用模糊值平滑颜色过渡
    color = mix(color, mix(color1, color4, 0.5), (blur - f) * 0.2);
    
    // 确保颜色在有效范围内
    color = clamp(color, 0.0, 1.0);
    
    gl_FragColor = vec4(color, 1.0);
  }
`

// 创建着色器
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('无法创建着色器')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error('着色器编译错误: ' + info)
  }

  return shader
}

// 创建程序
function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram()
  if (!program) {
    throw new Error('无法创建程序')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error('程序链接错误: ' + info)
  }

  return program
}

// 初始化WebGL
function initWebGL() {
  if (!canvasRef.value) return

  // 获取WebGL上下文
  gl = canvasRef.value.getContext('webgl')
  if (!gl) {
    console.error('无法初始化WebGL')
    return
  }

  // 创建着色器
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)

  // 创建程序
  program = createProgram(gl, vertexShader, fragmentShader)

  // 创建顶点缓冲区
  const positionBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)

  // 创建一个覆盖整个画布的矩形
  const positions = [-1, -1, 1, -1, -1, 1, 1, 1]
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)

  // 获取属性位置
  const positionAttributeLocation = gl.getAttribLocation(program, 'a_position')

  // 启用属性
  gl.enableVertexAttribArray(positionAttributeLocation)
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0)

  // 使用程序
  gl.useProgram(program)

  // 设置画布大小
  resizeCanvas()

  // 开始渲染循环
  startRenderLoop()
}

// 调整画布大小
function resizeCanvas() {
  if (!canvasRef.value || !gl) return

  const canvas = canvasRef.value
  const displayWidth = canvas.clientWidth
  const displayHeight = canvas.clientHeight

  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth
    canvas.height = displayHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
}

// 渲染循环
function render() {
  if (!gl || !program) return

  // 计算时间
  const currentTime = (Date.now() - startTime) / 1000

  // 设置时间uniform
  const timeLocation = gl.getUniformLocation(program, 'u_time')
  gl.uniform1f(timeLocation, currentTime)

  // 设置颜色uniform
  const colorLocation = gl.getUniformLocation(program, 'u_color')
  gl.uniform3f(colorLocation, dominantColor.value.r, dominantColor.value.g, dominantColor.value.b)

  // 清除画布
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  // 绘制
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  // 请求下一帧
  animationFrameId = requestAnimationFrame(render)
}

// 开始渲染循环
function startRenderLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  animationFrameId = requestAnimationFrame(render)
}

// 停止渲染循环
function stopRenderLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

// 提取图片颜色
async function updateColors() {
  try {
    // 提取多个颜色
    const colors = await extractColors(actualCoverImage.value, 4)
    colorPalette.value = colors

    // 设置主色调
    dominantColor.value = {
      r: colors[0].r / 255,
      g: colors[0].g / 255,
      b: colors[0].b / 255
    }

    console.log('提取的颜色:', colors)
  } catch (error) {
    console.error('提取颜色失败:', error)
    // 使用默认颜色
    dominantColor.value = { r: 0.3, g: 0.3, b: 0.5 }
  }
}

// 监听封面图片变化
watch(
  () => actualCoverImage.value,
  async () => {
    await updateColors()
  },
  { immediate: true }
)

// 组件挂载时初始化
onMounted(async () => {
  await updateColors()
  window.addEventListener('resize', resizeCanvas)
  initWebGL()
})

// 组件卸载时清理
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
  stopRenderLoop()
})
</script>

<template>
  <canvas ref="canvasRef" class="shader-background"></canvas>
</template>

<style scoped>
.shader-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
}
</style>
