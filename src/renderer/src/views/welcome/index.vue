<template>
  <div class="welcome-container" :class="{ 'is-newyear': showNewYear }">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="bg-circle circle-1"></div>
      <div class="bg-circle circle-2"></div>
    </div>

    <div class="content-wrapper">
      <!-- 左侧：Logo区域 -->
      <div class="left-section animate-in-left">
        <div class="logo-wrapper">
          <div class="logo-glow"></div>
          <img v-if="!showNewYear" class="logo-image" src="/logo.svg" alt="Ceru Music Logo" />
          <img v-else class="logo-image" src="/logo_2026.svg" alt="Ceru Music Logo" />
        </div>
      </div>

      <!-- 右侧：内容区域 -->
      <div class="right-section">
        <div class="text-content animate-in-right">
          <div v-if="showNewYear" class="newyear-banner">
            <span class="newyear-text">新年快乐</span>
            <span class="newyear-year">2026</span>
          </div>
          <h1 class="brand-title">Ceru Music</h1>
          <p class="brand-subtitle">
            {{
              showNewYear
                ? '每一次播放都是出发，愿你的2026如旋律般自由奔腾，心有所向，皆是坦途。'
                : '纯净 · 极致 · 自由'
            }}
          </p>
        </div>

        <div class="info-group animate-in-right-delay">
          <div class="feature-tags">
            <span v-for="(feature, index) in features" :key="index" class="tag">
              {{ feature }}
            </span>
          </div>

          <!-- 加载状态 -->
          <div class="loading-bar-container">
            <div class="loading-info">
              <span class="loading-text">{{ loadingText }}</span>
              <span v-if="loadingPercent" class="loading-percent">{{ loadingPercent }}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-bar" :style="{ width: progressWidth }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部版本信息 -->
    <div class="version-info animate-fade">v{{ version }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { initPlayback } from '@renderer/utils/audio/globaPlayList'
import { useAutoUpdate } from '@renderer/composables/useAutoUpdate'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const { checkForUpdates } = useAutoUpdate()
const router = useRouter()
const version = ref('1.0.0')
const loadingText = ref('正在初始化核心服务...')
const loadingPercent = ref(0)

// 保存定时器ID以便清理
let timer: number | null = null

const progressWidth = computed(() => `${loadingPercent.value}%`)

const showNewYear = computed(
  () => settingsStore.shouldUseSpringFestivalTheme() && !settings.value.springFestivalDisabled
)
const features = showNewYear.value
  ? ['岁岁长安', '功不唐捐', '马年吉祥', '马越新程']
  : ['Hi-Res Audio', 'Minimalist', 'Plugins', 'Offline']

onMounted(async () => {
  // 获取版本号
  try {
    const appVersion = await window.electron.ipcRenderer.invoke('get-app-version')
    if (appVersion) version.value = appVersion
  } catch (error) {
    console.warn('Failed to get app version:', error)
  }

  const startTime = Date.now()

  // 模拟进度条动画
  let progress = 0
  timer = window.setInterval(() => {
    if (progress < 70) {
      progress += Math.random() * 5
      if (progress > 70) progress = 70
      loadingPercent.value = Math.floor(progress)
    }
  }, 100)

  // 模拟加载步骤提示
  setTimeout(() => (loadingText.value = '加载插件系统...'), 500)

  try {
    await window.electron.ipcRenderer.invoke('service-plugin-initialize-system')
  } catch (e) {
    console.error('Plugin init failed', e)
    loadingText.value = '初始化遇到问题'
  }

  const endTime = Date.now()
  const duration = endTime - startTime

  // 动态计算等待时间
  let waitTime = 0
  if (duration < 2000) {
    waitTime = 2000 - duration
  } else {
    waitTime = 1000
  }
  loadingPercent.value = 80
  loadingText.value = '加载歌曲资源...'

  initPlayback()
    .catch((e) => console.error('initPlayback failed', e))
    .finally(() => {
      setTimeout(() => {
        if (timer) {
          clearInterval(timer)
          timer = null
        }
        loadingPercent.value = 100
        loadingText.value = '准备就绪...'
        setTimeout(() => {
          router.replace('/home').then(() => {
            if (settings.value.autoUpdate) {
              setTimeout(() => {
                checkForUpdates()
              }, 2000)
            }
          })
        }, 200)
      }, waitTime)
    })
})

// 清理定时器，防止路由快速切换时内存泄漏
onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})
</script>

<style scoped>
.welcome-container {
  width: 100vw;
  height: 100vh;
  background: var(--welcome-bg, #ffffff);
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--td-text-color-primary, #333);
}

.welcome-container.is-newyear .circle-1 {
  background: radial-gradient(circle at 30% 30%, rgba(255, 215, 0, 0.95), rgba(255, 0, 0, 0) 60%);
  opacity: 0.35;
}

.welcome-container.is-newyear .circle-2 {
  background: radial-gradient(circle at 60% 40%, rgba(255, 0, 0, 0.95), rgba(255, 215, 0, 0) 65%);
  opacity: 0.28;
}

.newyear-banner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.65rem;
  margin-bottom: 1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 215, 0, 0.22);
  background: linear-gradient(90deg, rgba(255, 0, 0, 0.1), rgba(255, 215, 0, 0.1));
  backdrop-filter: blur(10px);
  box-shadow: 0 10px 28px rgba(255, 0, 0, 0.08);
  position: relative;
  overflow: hidden;
}

.newyear-banner::after {
  content: '';
  position: absolute;
  inset: -40% -60%;
  background: radial-gradient(circle, rgba(255, 215, 0, 0.35) 0 1px, transparent 2px);
  opacity: 0.35;
  animation: nySparkle 2.2s linear infinite;
}

.newyear-text,
.newyear-year {
  position: relative;
  z-index: 1;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 1px;
}

.newyear-text {
  color: rgba(255, 0, 0, 0.95);
}

.newyear-year {
  font-weight: 900;
  font-size: 0.95rem;
  letter-spacing: 0.5px;
  background: linear-gradient(180deg, #fff0b3, #ffd65a, #ffb84a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  -webkit-text-stroke: 0.6px rgba(140, 20, 0, 0.35);
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.2);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

@keyframes nySparkle {
  0% {
    transform: translateX(-10%) rotate(0deg);
  }
  100% {
    transform: translateX(10%) rotate(180deg);
  }
}

/* 背景装饰 */
.bg-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.circle-1 {
  width: 60vh;
  height: 60vh;
  top: -10%;
  left: -10%;
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  animation: float 10s infinite ease-in-out;
}

.circle-2 {
  width: 50vh;
  height: 50vh;
  bottom: -10%;
  right: -5%;
  background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%);
  animation: float 12s infinite ease-in-out reverse;
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(20px, 30px);
  }
}

/* 内容布局 */
.content-wrapper {
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 1200px;
  padding: 0 4rem;
  gap: 6rem;
}

/* 左侧 Logo */
.left-section {
  flex: 0 0 auto;
}

.logo-wrapper {
  position: relative;
  width: 320px;
  height: 320px;
}

.logo-image {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.15));
}

.logo-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 150%;
  height: 150%;
  background: radial-gradient(circle, rgba(66, 211, 146, 0.4) 0%, rgba(0, 0, 0, 0) 70%);
  z-index: 1;
  filter: blur(30px);
}

/* 右侧内容 */
.right-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 500px;
}

.text-content {
  margin-bottom: 3rem;
  text-align: left;
}

.brand-title {
  font-size: 4rem;
  font-weight: 800;
  margin: 0 0 0.5rem 0;
  background: linear-gradient(120deg, #42d392, #647eff);
  font-family: Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -1.5px;
  line-height: 1.1;
}

.welcome-container.is-newyear .brand-title {
  background: linear-gradient(120deg, #ff1f1f, #ffd65a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-subtitle {
  font-size: 1.25rem;
  color: var(--td-text-color-secondary, #666);
  font-weight: 400;
  letter-spacing: 4px;
  text-transform: uppercase;
  opacity: 0.8;
  margin: 0;
}

.info-group {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.feature-tags {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.tag {
  padding: 0.4rem 1rem;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 100px;
  font-size: 0.8rem;
  color: var(--td-text-color-secondary, #555);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

/* 进度条样式 */
.loading-bar-container {
  width: 100%;
}

.loading-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
  color: var(--td-text-color-secondary, #666);
}

.loading-text {
  font-weight: 500;
}

.loading-percent {
  font-family: monospace;
  opacity: 0.8;
}

.progress-track {
  width: 100%;
  height: 4px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #42d392, #647eff);
  border-radius: 2px;
  transition: width 0.3s ease-out;
}

.welcome-container.is-newyear .progress-bar {
  background: linear-gradient(90deg, #ff1f1f, #ffd65a, #ff1f1f);
}

/* 版本信息 */
.version-info {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  font-size: 0.75rem;
  color: var(--td-text-color-disabled, #ccc);
  font-family: monospace;
}

/* 动画 */
.animate-in-left {
  animation: slideInLeft 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  opacity: 0;
}

.animate-in-right {
  animation: slideInRight 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards;
  opacity: 0;
}

.animate-in-right-delay {
  animation: slideInRight 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.4s forwards;
  opacity: 0;
}

.animate-fade {
  animation: fadeIn 1s ease 1s forwards;
  opacity: 0;
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(50px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .welcome-container {
    background: #121212;
    color: #fff;
  }

  .bg-circle {
    opacity: 0.15;
  }

  .tag {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
    color: #aaa;
  }

  .progress-track {
    background: rgba(255, 255, 255, 0.1);
  }
}

/* 响应式适配 */
@media (max-width: 900px) {
  .content-wrapper {
    flex-direction: column;
    gap: 3rem;
    text-align: center;
    padding: 0 2rem;
  }

  .right-section {
    align-items: center;
  }

  .text-content {
    text-align: center;
  }

  .logo-wrapper {
    width: 160px;
    height: 160px;
  }

  .brand-title {
    font-size: 3rem;
  }

  .animate-in-left,
  .animate-in-right,
  .animate-in-right-delay {
    animation-name: slideInUp;
  }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
