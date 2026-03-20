<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import SearchSuggest from '@renderer/components/search/searchSuggest.vue'
import { SearchIcon, MicrophoneIcon } from 'tdesign-icons-vue-next'
import { onMounted, onUnmounted, ref, watchEffect, computed, watch } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useRouter, useRoute } from 'vue-router'
import { useSearchStore } from '@renderer/store'
import { GuideStep } from 'tdesign-vue-next'

let stopWatchEffect: (() => void) | null = null
const resizingClassName = 'window-resizing'
let resizeIdleTimer: number | undefined

const setWindowResizingState = (active: boolean) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle(resizingClassName, active)
}

const handleWindowResize = () => {
  setWindowResizingState(true)
  if (resizeIdleTimer !== undefined) {
    window.clearTimeout(resizeIdleTimer)
  }
  resizeIdleTimer = window.setTimeout(() => {
    resizeIdleTimer = undefined
    setWindowResizingState(false)
  }, 140)
}

onMounted(() => {
  const LocalUserDetail = LocalUserDetailStore()
  try {
    isSidebarCollapsed.value = window.localStorage.getItem(sidebarCollapsedStorageKey) === '1'
  } catch {}
  stopWatchEffect = watchEffect(() => {
    source.value = sourceicon[LocalUserDetail.userSource.source || 'wy']
  })
  // Listen for global hotkey to open audio output selector
  // Note: Logic moved to App.vue to support global toggle and prevent duplicate listeners.
  // This listener is removed to avoid conflict.
  // window.electron.ipcRenderer.on('hotkeys:toggle-audio-output-selector', () => {
  //   router.push({
  //     path: '/settings',
  //     query: { category: 'playlist', section: 'audio-output', t: Date.now() }
  //   })
  // })
  window.addEventListener('resize', handleWindowResize, { passive: true })
})

onUnmounted(() => {
  // 清理 watchEffect，防止内存泄漏
  if (stopWatchEffect) {
    stopWatchEffect()
    stopWatchEffect = null
  }
  window.removeEventListener('resize', handleWindowResize)
  if (resizeIdleTimer !== undefined) {
    window.clearTimeout(resizeIdleTimer)
    resizeIdleTimer = undefined
  }
  setWindowResizingState(false)
})

const sourceicon = {
  kg: 'kugouyinle',
  wy: 'wangyiyun',
  mg: 'mg',
  tx: 'tx',
  kw: 'kw'
}
const source = ref('kugouyinle')
interface MenuItem {
  name: string
  icon: string
  path: string
}
const menuList: MenuItem[] = [
  {
    name: '发现',
    icon: 'icon-faxian',
    path: '/home/find'
  },
  {
    name: '歌单',
    icon: 'icon-yanchu',
    path: '/home/songlist'
  },
  {
    name: '本地',
    icon: 'icon-shouye',
    path: '/home/local'
  },
  {
    name: '下载',
    icon: 'icon-xiazai',
    path: '/home/download'
  }
  // {
  //   name: '最近',
  //   icon: 'icon-shijian',
  //   path: '/home/recent'
  // }
]
const menuActive = ref(0)
const router = useRouter()
const route = useRoute()
const source_list_show = ref(false)
const sidebarCollapsedStorageKey = 'ceru_sidebar_collapsed_v1'
const isSidebarCollapsed = ref(false)

// 监听路由变化，更新激活的菜单项
watch(
  () => route.path,
  (newPath) => {
    const index = menuList.findIndex((item) => newPath.startsWith(item.path))
    menuActive.value = index
  },
  { immediate: true }
)

// 检查是否有插件数据
const hasPluginData = computed(() => {
  const LocalUserDetail = LocalUserDetailStore()
  return !!(
    LocalUserDetail.userInfo.pluginId &&
    LocalUserDetail.userInfo.supportedSources &&
    Object.keys(LocalUserDetail.userInfo.supportedSources).length > 0
  )
})

// 音源名称映射
const sourceNames = {
  wy: '网易云音乐',
  kg: '酷狗音乐',
  mg: '咪咕音乐',
  tx: 'QQ音乐',
  kw: '酷我音乐'
}

// 动态音源列表数据，基于supportedSources
const sourceList = computed(() => {
  const LocalUserDetail = LocalUserDetailStore()
  const supportedSources = LocalUserDetail.userInfo.supportedSources

  if (!supportedSources) return []

  return Object.keys(supportedSources).map((key) => ({
    key,
    name: sourceNames[key] || key,
    icon: sourceicon[key] || key
  }))
})

// 切换音源选择器显示状态
const toggleSourceList = () => {
  source_list_show.value = !source_list_show.value
}

// 选择音源
const selectSource = (sourceKey: string) => {
  if (!hasPluginData.value) return

  const LocalUserDetail = LocalUserDetailStore()
  LocalUserDetail.userInfo.selectSources = sourceKey

  const sourceDetail = LocalUserDetail.userInfo.supportedSources?.[sourceKey]
  if (!LocalUserDetail.userInfo.sourceQualityMap) {
    LocalUserDetail.userInfo.sourceQualityMap = {}
  }
  if (sourceDetail && sourceDetail.qualitys && sourceDetail.qualitys.length > 0) {
    const saved = LocalUserDetail.userInfo.sourceQualityMap[sourceKey]
    const useQuality =
      saved && sourceDetail.qualitys.includes(saved)
        ? saved
        : sourceDetail.qualitys[sourceDetail.qualitys.length - 1]
    LocalUserDetail.userInfo.sourceQualityMap[sourceKey] = useQuality
    LocalUserDetail.userInfo.selectQuality = useQuality
  }

  // 更新音源图标
  source.value = sourceicon[sourceKey]
  source_list_show.value = false
}

// 点击遮罩关闭音源选择器
const handleMaskClick = () => {
  source_list_show.value = false
}

const handleClick = (index: number): void => {
  menuActive.value = index
  router.push(menuList[index].path)
}

const toggleSidebar = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  try {
    window.localStorage.setItem(
      sidebarCollapsedStorageKey,
      isSidebarCollapsed.value ? '1' : '0'
    )
  } catch {}
}

// 搜索相关
const SearchStore = useSearchStore()
const inputRef = ref<any>(null)

// 搜索类型：1: 单曲, 10: 专辑, 100: 歌手, 1000: 歌单
// const searchType = ref(1)

// 处理搜索事件
const handleSearch = async () => {
  if (!SearchStore.getValue.trim()) return
  // 重新设置搜索关键字
  try {
    router.push({
      path: '/home/search'
    })
  } catch (error) {
    console.error('搜索失败:', error)
  }
}

// 处理按键事件，按下回车键时触发搜索
const handleKeyDown = () => {
  handleSearch()
  // 回车后取消输入框焦点
  inputRef.value?.blur?.()
}

// 处理搜索建议选择
const handleSuggestionSelect = (suggestion: any, _type: any) => {
  SearchStore.setValue(suggestion)
  handleSearch()
}

// 已迁移到 App.vue 全局引导
const steps = ref<GuideStep[]>([
  {
    element: '.home-container',
    title: '欢迎使用 Ceru Music',
    body: '这是一个基于 Electron 框架的开源音乐播放器应用。你可以自由选择合规插件进行播放歌曲，亦或是使用内置的本地播放器进行播放。下面即将开始新手教程请确认是否开始。',
    mode: 'dialog'
  },
  {
    element: '.sidebar',
    title: '导航栏',
    body: '导航栏是 Ceru Music 的重要组成部分，它提供了快速访问不同功能模块的入口。你可以通过点击导航栏上的图标或文本，切换到对应的功能页面。其中包括首页、搜索、本地音乐、下载等功能模块。',
    placement: 'right'
  },
  {
    element: '.header',
    title: '顶部栏',
    body: '顶部栏包含了应用的一些高频操作按钮，如全局在线搜索、账号和设置等。你可以在顶部栏上点击这些按钮，执行对应的操作。'
  },
  {
    element: '.source-selector',
    title: '音源选择器',
    body: '其中的搜索框左侧音源选择器是用来选择播放音源的工具。你可以在音源选择器中选择插件所支持的音源，在这快速切换到不同的音源查找你的喜欢音乐或歌单。'
  },
  {
    element: '.settings-btn',
    title: '设置按钮',
    body: '顶部栏右侧的设置按钮是用来打开应用设置的。你可以在设置中调整应用的一些参数，如插件选择、音源配置、全局缓存，软件UI样式等。'
  },
  {
    element: '.find-tabs',
    title: '筛选工具',
    body: '发现页顶部的筛选工具是用来筛选歌单的。你可以在筛选工具中选择不同的筛选条件，如歌单-分类、排行榜，来快速找到你喜欢的音乐。'
  },
  {
    element: '.player-container',
    title: '播放器',
    body: '播放器是 Ceru Music 的核心组件，它负责播放音乐。你可以在播放器中控制音乐的播放、暂停、上/下一曲、调整音量、歌词、喜欢等操作。'
  },
  {
    element: '.playlist-container',
    title: '播放列表',
    body: '播放列表是用来临时存储你喜欢的音乐的播放顺序列表。你可以在播放列表中添加、删除、长按调整顺序。',
    placement: 'left'
  },
  {
    element: '.home-container',
    title: '设置页面',
    body: '设置页面是 Ceru Music 的配置中心。你可以在这里设置样式软件配置、快捷键、全局缓存、插件管理等、音源选择、查看关于软件。',
    mode: 'dialog'
  },
  {
    element: '#settings-nav-appearance',
    title: '外观与主题',
    body: '包含 标题栏风格(Windows/红绿灯)、关闭按钮行为(最小化到托盘/直接退出)、应用主题色选择，以及歌词字体与桌面歌词样式的详细配置。'
  },
  {
    element: '#settings-nav-hotkeys',
    title: '快捷键',
    body: '配置系统级全局快捷键，如播放/暂停、上下曲、切换歌词面板等，支持启用/禁用与按键冲突提示，确保在任意页面可用。'
  },
  {
    element: '#settings-nav-storage',
    title: '全局缓存',
    body: '包含 下载/缓存目录管理与容量统计、音乐缓存清理，缓存策略(自动缓存)，下载文件名模板(支持 %t/%s/%a/%u/%q/%d 预览)，以及下载标签写入设置(基础信息/封面/歌词/逐字/独立LRC)。'
  },
  {
    element: '#settings-nav-plugins',
    title: '插件管理',
    body: '用于安装/启用/配置音乐插件，决定支持的音乐源与能力；设置后可在“音乐源”中选择具体源与默认音质。'
  },
  {
    element: '#settings-nav-music',
    title: '音源选择',
    body: '展示当前插件支持的音乐源列表，可切换活跃源；支持按源选择音质(滑条标注质量等级)，以及“全局音质(交集)”统一设定；右侧显示当前源与音质配置状态。'
  },
  {
    element: '#settings-nav-about',
    title: '关于与支持',
    body: '包含 应用版本信息(启动检查更新/手动检查)、技术栈与服务链接、开发团队介绍、法律声明与联系方式(QQ群/官网/问题反馈)。'
  },
  {
    element: '.home-container',
    title: '开始前的准备工作',
    body: '在开始使用 Ceru Music 之前，你需要先安装并配置一个音乐插件。插件是用来获取音乐数据的，你可以在设置中配置符合你需求的插件进行播放。如果没有合适的插件，你也可以使用内置的本地播放器来体验澜音。下面轻点完成开始你的澜音之旅吧！还有很多功能等待你去发现。',
    mode: 'dialog'
  }
] as GuideStep[])
function checkGuide() {
  setTimeout(() => {
    if (!LocalUserDetailStore().userInfo.hasGuide) {
      try {
        if (!(window as any).__guide_initialized) {
          window.dispatchEvent(new CustomEvent('guide:init', { detail: { steps: steps.value } }))
        }
      } catch {}
    }
  }, 1000)
}
// 引导步骤变更逻辑已迁移到 App.vue 的全局引导中
</script>

<template>
  <t-layout class="home-container">
    <div class="scene-backdrop" aria-hidden="true">
      <span class="scene-orb orb-primary"></span>
      <span class="scene-orb orb-secondary"></span>
      <span class="scene-orb orb-tertiary"></span>
      <span class="scene-grid"></span>
    </div>

    <t-aside class="sidebar" :class="{ collapsed: isSidebarCollapsed }">
      <div class="sidebar-shell">
        <div class="sidebar-content">
          <div class="logo-section">
            <div class="logo-brand">
              <div class="logo-icon">
                <i class="iconfont icon-music"></i>
              </div>
              <div class="logo-copy">
                <p class="app-title">
                  <span style="font-weight: 800">Ceru Music</span>
                </p>
              </div>
            </div>
            <t-button
              shape="circle"
              theme="default"
              variant="text"
              class="sidebar-toggle-btn"
              :title="isSidebarCollapsed ? '展开侧栏' : '收起侧栏'"
              @click="toggleSidebar"
            >
              <i
                class="iconfont"
                :class="isSidebarCollapsed ? 'icon-xiangyou' : 'icon-xiangzuo'"
              ></i>
            </t-button>
          </div>

          <nav class="nav-section">
            <t-button
              v-for="(item, index) in menuList"
              :key="index"
              :variant="menuActive == index ? 'base' : 'text'"
              :class="menuActive == index ? 'nav-button active' : 'nav-button'"
              :title="isSidebarCollapsed ? item.name : ''"
              block
              @click="handleClick(index)"
            >
              <i :class="`iconfont ${item.icon} nav-icon`"></i>
              <span class="nav-label">{{ item.name }}</span>
            </t-button>
          </nav>
        </div>
      </div>
    </t-aside>

    <t-layout class="home-main-shell">
      <t-content class="home-content-shell">
        <div class="content">
          <div class="header-shell">
            <div class="header">
              <div class="search-container">
                <div class="search-input">
                  <div class="source-selector" @click="toggleSourceList">
                    <svg class="icon" aria-hidden="true">
                      <use :xlink:href="`#icon-${source}`"></use>
                    </svg>
                  </div>
                  <transition name="mask">
                    <div v-if="source_list_show" class="source-mask" @click="handleMaskClick"></div>
                  </transition>
                  <transition name="source">
                    <div v-if="source_list_show" class="source-list">
                      <div class="items">
                        <div
                          v-for="item in sourceList"
                          :key="item.key"
                          class="source-item"
                          :class="{ active: source === item.icon }"
                          @click="selectSource(item.key)"
                        >
                          <svg class="source-icon" aria-hidden="true">
                            <use :xlink:href="`#icon-${item.icon}`"></use>
                          </svg>
                          <span class="source-name">{{ item.name }}</span>
                        </div>
                      </div>
                    </div>
                  </transition>

                  <t-input
                    ref="inputRef"
                    v-model="SearchStore.value"
                    placeholder="搜索音乐、歌手"
                    style="width: 100%"
                    @enter="handleKeyDown"
                    @focus="SearchStore.setFocus(true)"
                    @blur="SearchStore.setFocus(false)"
                  >
                    <template #suffix>
                      <t-button
                        theme="primary"
                        variant="text"
                        shape="circle"
                        style="display: flex; align-items: center; justify-content: center"
                        @click="handleSearch"
                      >
                        <SearchIcon style="font-size: 16px; color: var(--td-text-color-primary)" />
                      </t-button>
                    </template>
                  </t-input>
                  <SearchSuggest @to-search="handleSuggestionSelect" />
                </div>

                <t-tooltip content="听歌识曲（Beta）" placement="bottom">
                  <t-button
                    shape="circle"
                    theme="default"
                    variant="text"
                    class="nav-btn mic-btn"
                    @click="router.push('/home/recognize')"
                  >
                    <template #icon>
                      <MicrophoneIcon />
                    </template>
                  </t-button>
                </t-tooltip>

                <TitleBarControls class="header-controls-inline" :show-account="true" :inline="true" />
              </div>
            </div>
          </div>

          <div class="main-stage">
            <div class="mainContent">
              <slot name="body"></slot>
            </div>
          </div>
        </div>
      </t-content>
    </t-layout>
    <FirstRunDialog @next="checkGuide" />
  </t-layout>
</template>

<style scoped lang="scss">
.source-enter-active,
.source-leave-active {
  transition:
    opacity var(--motion-duration-fast) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.source-enter-from,
.source-leave-to {
  opacity: 0;
  transform: translateY(-0.75rem) scale(0.96);
}

.mask-enter-active,
.mask-leave-active {
  transition: opacity var(--motion-duration-fast) var(--motion-ease-standard);
}

.mask-enter-from,
.mask-leave-to {
  opacity: 0;
}

.home-container {
  position: relative;
  height: calc(100vh - var(--play-bottom-height));
  overflow: hidden;
  padding: 1.125rem 1.125rem 0;
  gap: 1rem;
  min-width: 0;
}

.scene-backdrop {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.scene-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.9;
}

.orb-primary {
  top: -8rem;
  left: -4rem;
  width: 22rem;
  height: 22rem;
  background: radial-gradient(circle, var(--shell-orb-primary), transparent 70%);
}

.orb-secondary {
  top: 4rem;
  right: -6rem;
  width: 24rem;
  height: 24rem;
  background: radial-gradient(circle, var(--shell-orb-secondary), transparent 68%);
}

.orb-tertiary {
  bottom: -8rem;
  left: 28%;
  width: 18rem;
  height: 18rem;
  background: radial-gradient(circle, var(--shell-orb-tertiary), transparent 72%);
}

.scene-grid {
  position: absolute;
  inset: 12% -12% -10%;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.7), transparent 82%);
  opacity: 0.45;
  transform: perspective(1200px) rotateX(72deg) translateY(12rem);
  transform-origin: center top;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.sidebar {
  position: relative;
  z-index: 1;
  width: 17rem;
  flex-shrink: 0;
  box-sizing: border-box;
  padding-bottom: 1rem;
  background: transparent;
  overflow: hidden;
  contain: layout paint;
  will-change: width;
  transition: width 220ms var(--motion-ease-standard);

  &.collapsed {
    width: 5.6rem;
  }
}

.sidebar-shell {
  height: 100%;
  padding: 1rem 0.95rem;
  border: 1px solid var(--shell-panel-border);
  border-radius: 2rem;
  background: var(--shell-panel-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(var(--shell-blur-strong));
  overflow: hidden;
  contain: layout paint style;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.logo-section {
  -webkit-app-region: drag;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  padding: 0.2rem 0.2rem 0.9rem;
}

.logo-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.logo-icon {
  width: 3rem;
  height: 3rem;
  min-width: 3rem;
  min-height: 3rem;
  flex-shrink: 0;
  border-radius: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(135deg, var(--td-brand-color-4), rgba(14, 165, 233, 0.92)),
    var(--td-brand-color-4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    0 14px 30px rgba(0, 137, 62, 0.24);

  .iconfont {
    font-size: 1.42rem;
    color: #fff;
  }
}

.logo-copy {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  transition:
    opacity var(--motion-duration-fast) var(--motion-ease-standard),
    transform var(--motion-duration-fast) var(--motion-ease-standard);
}

.app-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--td-text-color-primary);
}

.sidebar-toggle-btn {
  -webkit-app-region: no-drag;
  width: 2.2rem;
  height: 2.2rem;
  min-width: 2.2rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.06);

  .iconfont {
    font-size: 0.95rem;
    color: var(--td-text-color-secondary);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
}

.nav-button {
  justify-content: flex-start;
  height: 3.25rem;
  text-align: left;
  padding: 0 1rem;
  border-radius: 1rem;
  border: 1px solid transparent;
  color: var(--hover-nav-text);
  overflow: hidden;
  transition:
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    box-shadow var(--motion-duration-fast) var(--motion-ease-standard),
    border-color var(--motion-duration-fast) var(--motion-ease-standard),
    color var(--motion-duration-fast) var(--motion-ease-standard);

  .nav-icon {
    margin-right: 0.75rem;
    font-size: 1.14rem;
    flex-shrink: 0;
  }

  .nav-label {
    display: block;
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.98rem;
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    transition:
      opacity var(--motion-duration-fast) var(--motion-ease-standard),
      transform var(--motion-duration-fast) var(--motion-ease-standard);
  }

  div {
    display: none !important;
    visibility: hidden;
  }

  &:hover {
    color: var(--hover-nav-text-hover);
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: var(--td-text-color-anti);
    border-color: rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(135deg, var(--td-brand-color-5), rgba(14, 165, 233, 0.84)),
      var(--td-brand-color-5);
    box-shadow: var(--shell-nav-active-shadow);

    &:hover,
    &:active {
      transform: translateX(0);
      background:
        linear-gradient(135deg, var(--td-brand-color-5), rgba(14, 165, 233, 0.84)),
        var(--td-brand-color-5) !important;
    }
  }
}

:deep(.home-main-shell) {
  flex: 1 1 0;
  width: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

:deep(.home-content-shell) {
  flex: 1 1 0;
  min-width: 0;
}

:deep(.t-layout__content) {
  height: 100%;
  display: flex;
  flex: 1 1 0;
  min-width: 0;
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 0 1rem;
  min-width: 0;
  overflow: visible;
}

.header-shell {
  position: relative;
  z-index: 6;
  padding-bottom: 1rem;
  min-width: 0;
  overflow: visible;
}

.header {
  -webkit-app-region: drag;
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 0.95rem 1.1rem;
  border: 1px solid var(--shell-header-border);
  border-radius: 1.75rem;
  background: var(--shell-header-bg);
  box-shadow: var(--shell-panel-shadow-soft);
  backdrop-filter: blur(var(--shell-blur-soft));
  min-width: 0;
  overflow: visible;
}

.nav-btn {
  -webkit-app-region: no-drag;
  width: 2.6rem;
  height: 2.6rem;
  min-width: 2.6rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  transition:
    transform var(--motion-duration-fast) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    border-color var(--motion-duration-fast) var(--motion-ease-standard),
    box-shadow var(--motion-duration-fast) var(--motion-ease-standard);

  .iconfont {
    font-size: 1rem;
    color: var(--home-nav-btn-color);
  }

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.1);
  }

  &:hover .iconfont {
    color: var(--home-nav-btn-hover);
  }
}

.mic-btn {
  margin-left: 0;
}

.search-container {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
  min-width: 0;
}

.search-input {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  flex: 0 0 23rem;
  min-width: 0;
  width: 23rem;
  max-width: min(23rem, 100%);
  z-index: 4;
  padding: 0 0.6rem;
  border: 1px solid var(--shell-search-border);
  border-radius: 999px;
  background: var(--shell-search-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  position: relative;
  overflow: visible;
  transition:
    box-shadow var(--motion-duration-fast) var(--motion-ease-standard),
    border-color var(--motion-duration-fast) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard);

  &:has(input:focus) {
    border-color: rgba(3, 222, 109, 0.28);
    box-shadow:
      0 0 0 4px var(--shell-search-focus),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
  }
}

.header-controls-inline {
  margin-left: auto;
}

.source-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  cursor: pointer;
  border-radius: 999px;
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard);

  &:hover {
    background-color: var(--home-source-selector-hover);
  }
}

.source-mask {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: transparent;
  cursor: pointer;
}

.source-list {
  position: absolute;
  top: calc(100% + 0.65rem);
  left: 0;
  z-index: 1200;
  min-width: 12rem;
  padding: 0.7rem;
  border: 1px solid var(--home-source-list-border);
  border-radius: 1.1rem;
  background: var(--shell-panel-bg-strong);
  box-shadow: var(--shell-panel-shadow-soft);
  backdrop-filter: blur(var(--shell-blur-soft));
}

.source-list .items {
  max-height: 12rem;
  overflow-y: auto;
  scrollbar-width: none;
}

.source-list .items::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.source-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.35rem;
  padding: 0.75rem 0.9rem;
  border-radius: 0.85rem;
  cursor: pointer;
  transition:
    transform var(--motion-duration-fast) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard),
    color var(--motion-duration-fast) var(--motion-ease-standard);

  &:last-child {
    margin-bottom: 0;
  }

  &:hover {
    transform: translateX(4px);
    background-color: var(--home-source-item-hover);
  }

  &.active {
    background-color: var(--td-brand-color-1);
    color: var(--td-brand-color);
  }
}

.source-icon {
  width: 1rem;
  height: 1rem;
}

.source-name {
  font-size: 0.875rem;
  white-space: nowrap;
}

:deep(.t-input) {
  border: none;
  background: transparent;
  box-shadow: none;

  &.t-input--suffix {
    padding-right: 0 !important;
  }
}

:deep(.t-input__wrap) {
  background: transparent;
}

:deep(.t-input__inner) {
  color: var(--td-text-color-primary);
}

.main-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  z-index: 1;
  padding: 1px;
  border-radius: 2rem;
  background: var(--shell-main-overlay);
}

.mainContent {
  position: relative;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--shell-content-border);
  border-radius: calc(2rem - 1px);
  background: var(--shell-content-bg);
  box-shadow: var(--shell-panel-shadow);
  backdrop-filter: blur(var(--shell-blur-soft));

  &::-webkit-scrollbar {
    width: 0.375rem;
  }

  &::-webkit-scrollbar-track {
    background: var(--home-scrollbar-track);
    border-radius: 0.1875rem;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--home-scrollbar-thumb);
    border-radius: 0.1875rem;
    transition: background-color var(--motion-duration-fast) var(--motion-ease-standard);

    &:hover {
      background: var(--home-scrollbar-thumb-hover);
    }
  }

  scrollbar-width: thin;
  scrollbar-color: var(--home-scrollbar-color);
}

@media (max-width: 1100px) {
  .home-container {
    padding-inline: 0.8rem;
    gap: 0.8rem;
  }

  .sidebar {
    width: 14rem;

    &.collapsed {
      width: 5.4rem;
    }
  }

  .search-input {
    flex-basis: 21rem;
    width: 21rem;
    max-width: min(21rem, 100%);
  }
}

.sidebar.collapsed {
  .logo-section {
    justify-content: center;
    padding-inline: 0;
  }

  .logo-brand {
    flex: 0 1 auto;
    justify-content: center;
    margin-inline: auto;
  }

  .sidebar-toggle-btn {
    position: absolute;
    right: 0;
    top: 0.2rem;
  }

  .nav-button {
    justify-content: center;
    padding: 0;
  }

  .nav-icon {
    margin-right: 0;
  }

  .nav-label {
    width: 0;
    flex: 0 0 0;
    min-width: 0;
    opacity: 0;
    transform: translateX(-0.2rem);
    pointer-events: none;
  }

  .logo-copy {
    width: 0;
    flex: 0 0 0;
    min-width: 0;
    opacity: 0;
    transform: translateX(-0.2rem);
    pointer-events: none;
  }
}

@media (max-width: 900px) {
  .home-container {
    padding: 0.75rem 0.75rem 0;
  }

  .header {
    flex-wrap: wrap;
    align-items: stretch;
  }

  .search-container {
    width: 100%;
    flex-wrap: wrap;
  }

  .search-input {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
}

@media (max-width: 720px) {
  .sidebar {
    width: 5.4rem;
  }

  .logo-section {
    justify-content: center;
    padding-inline: 0;
  }

  .logo-copy,
  .nav-label {
    display: none;
  }

  .nav-button {
    justify-content: center;
    padding: 0;
  }

  .nav-icon {
    margin-right: 0;
  }

}
</style>
