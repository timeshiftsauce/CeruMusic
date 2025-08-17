<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import { ref } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
const Store = LocalUserDetailStore()
const { userInfo } = storeToRefs(Store)
// 当前选择的控制风格
const currentStyle = ref<'windows' | 'traffic-light'>(
  userInfo.value.topBarStyle ? 'traffic-light' : 'windows'
)

// 切换风格
const switchStyle = (style: 'windows' | 'traffic-light'): void => {
  currentStyle.value = style
  console.log(`设置成 ${style} 风格 ${style === 'windows'}`)
  userInfo.value.topBarStyle = style === 'traffic-light' ? true : false
}
</script>

<template>
  <div class="main-container">
    <div class="header">
      <TitleBarControls title="设置" :show-back="true" />
    </div>
    <div class="settings-container">
      <div class="settings-content">
        <div class="settings-header">
          <h2>标题栏控制组件演示</h2>
          <p>这里展示了两种不同风格的标题栏控制按钮</p>
        </div>

        <div class="demo-section">
          <h3>风格选择</h3>
          <div class="style-buttons">
            <t-button
              :theme="currentStyle === 'windows' ? 'primary' : 'default'"
              @click="switchStyle('windows')"
            >
              Windows 风格
            </t-button>
            <t-button
              :theme="currentStyle === 'traffic-light' ? 'primary' : 'default'"
              @click="switchStyle('traffic-light')"
            >
              红绿灯风格
            </t-button>
          </div>
        </div>

        <div class="demo-section">
          <h3>当前风格预览</h3>
          <div class="preview-container">
            <div class="mock-titlebar">
              <div class="mock-title">Ceru Music - 设置</div>
              <TitleBarControls :control-style="currentStyle" />
            </div>
          </div>
        </div>

        <div class="demo-section">
          <h3>两种风格对比</h3>
          <div class="comparison-container">
            <div class="style-demo">
              <h4>Windows 风格</h4>
              <div class="mock-titlebar">
                <div class="mock-title">Windows 风格标题栏</div>
                <TitleBarControls control-style="windows" />
              </div>
            </div>

            <div class="style-demo">
              <h4>红绿灯风格 (macOS)</h4>
              <div class="mock-titlebar">
                <div class="mock-title">红绿灯风格标题栏</div>
                <TitleBarControls control-style="traffic-light" />
              </div>
            </div>
          </div>
        </div>

        <div class="demo-section">
          <h3>功能说明</h3>
          <div class="feature-list">
            <div class="feature-item">
              <i class="iconfont icon-shezhi"></i>
              <div>
                <strong>设置按钮</strong>
                <p>位于控制按钮最左侧，用于打开应用设置</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-dibu"></i>
              <div>
                <strong>Mini 模式</strong>
                <p>切换到迷你播放模式，节省桌面空间</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-zuixiaohua"></i>
              <div>
                <strong>最小化</strong>
                <p>将窗口最小化到任务栏</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-zengjia"></i>
              <div>
                <strong>最大化</strong>
                <p>切换窗口最大化/还原状态</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-a-quxiaoguanbi"></i>
              <div>
                <strong>关闭</strong>
                <p>关闭应用程序</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  height: 100vh;
  overflow: hidden;
}
.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background-color: #fff;
  padding: 1.5rem;
  position: sticky;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
}

.settings-container {
  width: 100%;
  padding: 2rem;
  overflow-y: scroll;
  max-height: 100vh;
}

.settings-content {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  padding: 2rem;
}

.settings-header {
  margin-bottom: 2rem;

  h2 {
    color: #111827;
    margin-bottom: 0.5rem;
  }

  p {
    color: #6b7280;
  }
}

.demo-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;

  h3 {
    color: #111827;
    margin-bottom: 1rem;
  }

  h4 {
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
}

.style-buttons {
  display: flex;
  gap: 1rem;
}

.preview-container,
.comparison-container {
  background: #f9fafb;
  padding: 1rem;
  border-radius: 0.375rem;
}

.comparison-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.style-demo {
  background: #fff;
  padding: 1rem;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.mock-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #f6f6f6;
  border-radius: 0.375rem;
  border: 1px solid #d1d5db;
}

.mock-title {
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;

  .iconfont {
    font-size: 1.25rem;
    color: #f97316;
    margin-top: 0.125rem;
  }

  div {
    flex: 1;

    strong {
      display: block;
      color: #111827;
      margin-bottom: 0.25rem;
    }

    p {
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0;
    }
  }
}
</style>
