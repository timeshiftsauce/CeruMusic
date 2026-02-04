<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import {
  PaletteIcon,
  ApiIcon,
  PlayCircleIcon,
  KeyboardIcon,
  TreeRoundDotIcon,
  MusicIcon,
  SaveIcon,
  InfoCircleIcon
} from 'tdesign-icons-vue-next'

// Import Section Components
import AppearanceSection from './sections/AppearanceSection.vue'
import AISection from './sections/AISection.vue'
import PlaybackSection from './sections/PlaybackSection.vue'
import HotkeySection from './sections/HotkeySection.vue'
import PluginSection from './sections/PluginSection.vue'
import MusicSourceSection from './sections/MusicSourceSection.vue'
import StorageSection from './sections/StorageSection.vue'
import AboutSection from './sections/AboutSection.vue'
import SettingsSearch from '@renderer/components/SettingsSearch.vue'
import type { SearchItem } from './searchIndex'

// 当前选择的设置分类
const activeCategory = ref<string>('appearance')
const contentPanelRef = ref<HTMLElement>()
const scrollPositions = ref<Record<string, number>>({})

// 设置分类配置
const settingsCategories = [
  {
    key: 'appearance',
    label: '外观设置',
    icon: PaletteIcon,
    description: '主题、标题栏风格等外观配置'
  },
  {
    key: 'ai',
    label: 'AI 功能',
    icon: ApiIcon,
    description: 'DeepSeek API 配置和 AI 相关功能'
  },
  {
    key: 'playlist',
    label: '播放设置',
    icon: PlayCircleIcon,
    description: '播放列表，歌词管理和相关设置'
  },
  {
    key: 'hotkeys',
    label: '快捷键',
    icon: KeyboardIcon,
    description: '全局快捷键配置'
  },
  {
    key: 'plugins',
    label: '插件管理',
    icon: TreeRoundDotIcon,
    description: '插件安装、配置和管理'
  },
  {
    key: 'music',
    label: '音乐源',
    icon: MusicIcon,
    description: '音乐源选择和音质配置'
  },
  {
    key: 'storage',
    label: '存储管理',
    icon: SaveIcon,
    description: '缓存管理和存储设置'
  },
  {
    key: 'about',
    label: '关于',
    icon: InfoCircleIcon,
    description: '版本信息和功能说明'
  }
]

const sectionComponents: Record<string, any> = {
  appearance: AppearanceSection,
  ai: AISection,
  playlist: PlaybackSection,
  hotkeys: HotkeySection,
  plugins: PluginSection,
  music: MusicSourceSection,
  storage: StorageSection,
  about: AboutSection
}

const currentComponent = computed(() => sectionComponents[activeCategory.value])

// 切换设置分类
const switchCategory = async (categoryKey: string) => {
  if (activeCategory.value === categoryKey) return

  // 保存当前滚动位置
  if (contentPanelRef.value) {
    scrollPositions.value[activeCategory.value] = contentPanelRef.value.scrollTop
  }

  activeCategory.value = categoryKey

  // 恢复滚动位置
  await nextTick()
  if (contentPanelRef.value) {
    contentPanelRef.value.scrollTop = scrollPositions.value[categoryKey] || 0
  }
}

const handleSearchSelect = async (item: SearchItem) => {
  console.log('Settings: Handling search select', item)
  if (activeCategory.value !== item.category) {
    console.log('Settings: Switching category to', item.category)
    await switchCategory(item.category)
    // Wait for Vue to update DOM
    await nextTick()
    // Small delay to ensure component is activated/mounted
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // Retry mechanism to find the element
  let attempts = 0
  const maxAttempts = 10

  const tryScroll = () => {
    const element = document.getElementById(item.id)
    console.log(`Settings: Trying to find element ${item.id}, attempt ${attempts + 1}`)

    if (element) {
      console.log('Settings: Scrolling to element')
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })

      // Remove existing highlight if any
      element.classList.remove('highlight-flash')
      // Force reflow
      void element.offsetWidth
      // Add highlight
      element.classList.add('highlight-flash')

      setTimeout(() => {
        element.classList.remove('highlight-flash')
      }, 2000)
    } else if (attempts < maxAttempts) {
      attempts++
      setTimeout(tryScroll, 100)
    } else {
      console.warn('Settings: Element not found after retries', item.id)
    }
  }

  tryScroll()
}
</script>

<template>
  <div class="main-container">
    <!-- 标题栏 -->
    <div class="header">
      <TitleBarControls title="设置" :show-back="true" :show-account="false">
        <template #extra>
          <div style="flex-shrink: 0">
            <SettingsSearch @select="handleSearchSelect" />
          </div>
        </template>
      </TitleBarControls>
    </div>

    <!-- 主要内容区域 -->
    <div class="settings-layout">
      <!-- 左侧导航栏 -->
      <div class="sidebar">
        <nav class="sidebar-nav">
          <div
            v-for="category in settingsCategories"
            :key="category.key"
            class="nav-item"
            :class="{ active: activeCategory === category.key }"
            @click="switchCategory(category.key)"
          >
            <div class="nav-icon">
              <component :is="category.icon" />
            </div>
            <div class="nav-content">
              <div class="nav-label">{{ category.label }}</div>
              <div class="nav-description">{{ category.description }}</div>
            </div>
          </div>
        </nav>
      </div>

      <!-- 右侧内容面板 -->
      <div class="content-panel">
        <div ref="contentPanelRef" class="panel-content">
          <!-- 设置内容区域 -->
          <KeepAlive>
            <component
              :is="currentComponent"
              :key="activeCategory"
              @switch-category="switchCategory"
            />
          </KeepAlive>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--settings-main-bg);
}

.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background: var(--settings-header-bg);
  padding: 1.5rem;
  z-index: 1000;
}

.settings-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

// 左侧导航栏
.sidebar {
  width: 280px;
  background: var(--settings-sidebar-bg);
  padding-right: 5px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-left: 5px;

  .sidebar-nav {
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    margin-top: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-left: 3px solid transparent;
    border-radius: 5px;

    &:hover {
      background: var(--settings-nav-hover-bg);
    }

    &.active {
      background: var(--settings-nav-active-bg);
      border-left-color: var(--settings-nav-active-border);

      .nav-icon {
        color: var(--settings-nav-icon-active);
      }

      .nav-label {
        color: var(--settings-nav-label-active);
        font-weight: 600;
      }
    }

    .nav-icon {
      width: 20px;
      height: 20px;
      color: var(--settings-nav-icon-color);
      display: flex;
      justify-content: center;
      align-items: center;

      svg {
        width: 100%;
        height: 100%;
      }

      transition: color 0.2s ease;
    }

    .nav-content {
      flex: 1;
      min-width: 0;

      .nav-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--settings-nav-label-color);
        margin-bottom: 0.125rem;
        transition: color 0.2s ease;
      }

      .nav-description {
        font-size: 0.75rem;
        color: var(--settings-nav-desc-color);
        line-height: 1.3;
      }
    }
  }
}

// 右侧内容面板
.content-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px;

  .panel-content {
    flex: 1;
    overflow-y: auto;
    background: var(--settings-main-bg);
    scroll-behavior: smooth; // Smooth scrolling might interfere with instant restore?
    // Usually better to remove for instant restore, but let's test.
    // Actually, for restoring exact position, smooth behavior might be annoying or slow.
    // But for user clicking, smooth is nice.
    // I will keep it for now.
  }
}

// 响应式设计
@media (max-width: 1024px) {
  .settings-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;

    .sidebar-nav {
      display: flex;
      overflow-x: auto;
      padding: 0.5rem;

      .nav-item {
        flex-shrink: 0;
        min-width: 200px;
        border-left: none;
        border-bottom: 3px solid transparent;

        &.active {
          border-left: none;
          border-bottom-color: #3b82f6;
        }
      }
    }
  }
}

// 过渡动画效果
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.fade-slide-enter-to,
.fade-slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

// Scrollbar styling
.sidebar,
.panel-content {
  // Webkit
  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: transparent;
  }
  // Firefox
  scrollbar-width: none;
  // IE/Edge
  -ms-overflow-style: none;
}

:deep(.highlight-flash) {
  position: relative;
}

:deep(.highlight-flash::after) {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  animation: flashHighlight 2s ease-out;
  z-index: 10;
}

@keyframes flashHighlight {
  0% {
    background-color: rgba(var(--td-brand-color-rgb), 0.2);
    box-shadow: 0 0 0 2px var(--td-brand-color);
  }
  50% {
    background-color: rgba(var(--td-brand-color-rgb), 0.1);
  }
  100% {
    background-color: transparent;
    box-shadow: none;
  }
}
</style>
