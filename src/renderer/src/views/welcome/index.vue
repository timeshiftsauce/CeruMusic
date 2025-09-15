<template>
  <div class="welcome-container">
    <!-- 左侧Logo区域 -->
    <div class="logo-section">
      <div class="image-container">
        <div class="image-bg"></div>
        <img class="logo-image" src="/logo.svg" alt="Ceru Music Logo" />
      </div>
    </div>

    <!-- 右侧内容区域 -->
    <div class="content-section">
      <div class="brand-content">
        <h1 class="brand-title">Cerulean Music</h1>
        <p class="brand-subtitle">澜音-纯净音乐，极致音乐体验</p>

        <!-- 加载状态 -->
        <!-- <div class="loading-area">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <p class="loading-text">{{ loadingText }}</p>
        </div> -->

        <!-- 特性标签 -->
        <div class="feature-tags">
          <span v-for="(feature, index) in features" :key="index" class="tag">
            {{ feature }}
          </span>
        </div>
      </div>
    </div>

    <!-- 版本信息 -->
    <div class="version-info">v{{ version }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const version = ref('1.0.0') // 默认版本号

// 特性列表
const features = ['高品质音乐', '简约风', '离线播放', '丰富的插件支持']

onMounted(async () => {
  // 通过IPC获取版本号
  try {
    const appVersion = await window.electron.ipcRenderer.invoke('get-app-version')
    if (appVersion) {
      version.value = appVersion
    }
  } catch (error) {
    console.warn('Failed to get app version via IPC:', error)
  }

  setTimeout(() => {
    router.push('/home')
  }, 2000)
})
</script>

<style scoped>
.welcome-container {
  width: 100vw;
  height: 100vh;
  background: #ffffff;
  display: flex;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
  position: relative;
}

/* 左侧Logo区域 */
.logo-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.image-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  border-radius: 50%;
  width: min(30vw, 70vh);
  height: min(30vw, 70vh);
  background-image: linear-gradient(-45deg, #b8f1cf 50%, #47caff 50%);
  filter: blur(56px);
  transform: translate(-50%, -50%);
  z-index: 0;
}

.logo-image {
  width: min(30vw, 70vh);
  height: min(30vw, 70vh);
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 4px 20px rgba(0, 0, 0, 0.1));
}

/* 右侧内容区域 */
.content-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2rem 4rem 2rem 2rem;
}

.brand-content {
  /* max-width: 400px; */
  animation: slideInRight 1s ease-out;
}

.brand-title {
  font-size: 3.5rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
  background: -webkit-linear-gradient(120deg, #5dd6cc 30%, #b8f1cc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -2px;
  line-height: 1.1;
}

.brand-subtitle {
  font-size: 1.5rem;
  color: #666666;
  margin: 1rem 0 5rem 0;
  font-weight: 400;
}

/* 加载区域 */
.loading-area {
  margin-bottom: 2rem;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: #f0f0f0;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(-45deg, #b8f1cf 0%, #47caff 100%);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.loading-text {
  font-size: 0.9rem;
  color: #888888;
  margin: 0;
  font-weight: 400;
}

/* 特性标签 */
.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  padding: 0.4rem 0.8rem;
  background: #b8f1ce;
  border: 1px solid #e9ecef;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #333333;
  transition: all 0.3s ease;
  opacity: 0.5;
}

.tag.active {
  background: linear-gradient(-45deg, #25ff7c 0%, #47caff 100%);
  border-color: transparent;
  color: white;
  opacity: 1;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(71, 202, 255, 0.3);
}

/* 版本信息 */
.version-info {
  position: absolute;
  bottom: 2rem;
  right: 2rem;
  font-size: 0.8rem;
  color: #9e9e9e;
  font-weight: 300;
}

/* 动画定义 */
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 响应式设计
@media (max-width: 1024px) {
  .welcome-container {
    flex-direction: column;
    text-align: center;
  }
  
  .logo-section {
    flex: none;
    padding: 2rem 2rem 1rem 2rem;
  }
  
  .content-section {
    flex: none;
    justify-content: center;
    padding: 1rem 2rem 2rem 2rem;
  }
  
  .brand-title {
    font-size: 2.8rem;
  }
  
  .image-bg {
    width: 150px;
    height: 150px;
    filter: blur(40px);
  }
  
  .logo-image {
    width: 100px;
    height: 100px;
  }
}

@media (max-width: 768px) {
  .brand-title {
    font-size: 2.2rem;
  }
  
  .brand-subtitle {
    font-size: 1rem;
  }
  
  .content-section {
    padding: 1rem;
  }
  
  .image-bg {
    width: 120px;
    height: 120px;
    filter: blur(30px);
  }
  
  .logo-image {
    width: 80px;
    height: 80px;
  }
} */

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  .welcome-container {
    background: #1a1a1a;
  }

  .brand-subtitle {
    color: #999999;
  }

  .loading-text {
    color: #aaaaaa;
  }

  .progress-bar {
    background: #333333;
  }

  .tag {
    background: #2d2d2d;
    border-color: #404040;
    color: #cccccc;
  }

  .version-info {
    color: #666666;
  }
}
</style>
