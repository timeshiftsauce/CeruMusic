<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import SearchSuggest from '@renderer/components/search/searchSuggest.vue'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { onMounted, onUnmounted, ref, watchEffect, computed, watch } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useRouter, useRoute } from 'vue-router'
import { useSearchStore } from '@renderer/store'
import { GuideStep } from 'tdesign-vue-next'

let stopWatchEffect: (() => void) | null = null

onMounted(() => {
  const LocalUserDetail = LocalUserDetailStore()
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
})

onUnmounted(() => {
  // 清理 watchEffect，防止内存泄漏
  if (stopWatchEffect) {
    stopWatchEffect()
    stopWatchEffect = null
  }
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

// 导航历史前进后退功能
const goBack = (): void => {
  router.go(-1)
}

const goForward = (): void => {
  router.go(1)
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
    body: '顶部栏包含了应用的一些高频操作按钮，如返回、前进、全局在线搜索、账号等。你可以在顶部栏上点击这些按钮，执行对应的操作。'
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
    <!-- sidebar -->
    <t-aside class="sidebar">
      <div class="sidebar-content">
        <div class="logo-section">
          <div class="logo-icon">
            <i class="iconfont icon-music"></i>
            <!-- <img src="../../assets/logo.png" width="100%"></img> -->
          </div>
          <p class="app-title">
            <span style="font-weight: 800">Ceru Music</span>
          </p>
        </div>

        <nav class="nav-section">
          <t-button
            v-for="(item, index) in menuList"
            :key="index"
            :variant="menuActive == index ? 'base' : 'text'"
            :class="menuActive == index ? 'nav-button active' : 'nav-button'"
            block
            @click="handleClick(index)"
          >
            <i :class="`iconfont ${item.icon} nav-icon`"></i>
            {{ item.name }}
          </t-button>
        </nav>
      </div>
    </t-aside>

    <t-layout style="flex: 1">
      <t-content>
        <div class="content">
          <!-- Header -->
          <div class="header">
            <t-button shape="circle" theme="default" class="nav-btn" @click="goBack">
              <i class="iconfont icon-xiangzuo"></i>
            </t-button>
            <t-button shape="circle" theme="default" class="nav-btn" @click="goForward">
              <i class="iconfont icon-xiangyou"></i>
            </t-button>

            <div class="search-container">
              <div class="search-input">
                <div class="source-selector" @click="toggleSourceList">
                  <svg class="icon" aria-hidden="true">
                    <use :xlink:href="`#icon-${source}`"></use>
                  </svg>
                </div>
                <!-- 透明遮罩 -->
                <transition name="mask">
                  <div v-if="source_list_show" class="source-mask" @click="handleMaskClick"></div>
                </transition>
                <!-- 音源选择列表 -->
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

              <TitleBarControls :show-account="true"></TitleBarControls>
            </div>
          </div>

          <div class="mainContent">
            <slot name="body"></slot>
          </div>
        </div>
      </t-content>
    </t-layout>
    <FirstRunDialog @next="checkGuide" />
  </t-layout>
</template>

<style scoped lang="scss">
:deep(.animate__animated) {
  position: absolute;
  width: 100%;
}

// 音源选择器过渡动画
.source-enter-active,
.source-leave-active {
  transition: all 0.2s ease;
}

.source-enter-from {
  opacity: 0;
  transform: translateY(-0.5rem);
}

.source-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

// 遮罩过渡动画
.mask-enter-active,
.mask-leave-active {
  transition: opacity 0.2s ease;
}

.mask-enter-from,
.mask-leave-to {
  opacity: 0;
}

.home-container {
  height: calc(100vh - var(--play-bottom-height));
  overflow-y: hidden;
  position: relative;
}

.icon {
  width: 1.5rem;
  height: 1.5rem;
}

.sidebar {
  width: 15rem;
  background-image: linear-gradient(
    to bottom,
    var(--td-brand-color-4) -140vh,
    var(--td-bg-color-container) 30vh
  );
  border-right: 0.0625rem solid var(--td-border-level-1-color);
  flex-shrink: 0;

  .sidebar-content {
    padding: 1rem;

    .logo-section {
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;

      .logo-icon {
        width: 2rem;
        height: 2rem;
        background-color: var(--td-brand-color-4);
        border-radius: 0.625rem;
        display: flex;
        align-items: center;
        justify-content: center;

        .iconfont {
          font-size: 1.25rem;
          color: #fff;
        }
      }

      .app-title {
        font-weight: 500;
        font-size: 1.125rem;
        color: var(--td-text-color-primary);

        span {
          font-weight: 500;
        }
      }
    }

    .nav-section {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;

      .nav-button {
        justify-content: flex-start;
        height: 2.4rem;
        text-align: left;
        padding: 0.7rem 1rem;
        border-radius: 0.5rem;
        border: none;

        .nav-icon {
          margin-right: 0.75rem;
          font-size: 1rem;
        }
        div {
          display: none !important;
          visibility: hidden;
        }
        &.active {
          background-color: var(--td-brand-color-4);
          color: var(--td-text-color-anti);
          &:active {
            background-color: var(--td-brand-color-5) !important;
          }

          &:hover {
            background-color: var(--td-brand-color-5) !important;
          }
        }

        &:not(.active) {
          color: var(--hover-nav-text);

          // color: var(--td-text-color-secondary);

          &:hover {
            color: var(--hover-nav-text-hover);
            background-color: var(--hover-nav-color);
          }
        }
      }
    }
  }
}

:deep(.t-layout__content) {
  height: 100%;
  display: flex;
}

.content {
  padding: 0;
  background-image: linear-gradient(
    to bottom,
    var(--td-brand-color-4) -110vh,
    var(--td-bg-color-container) 15vh
  );

  display: flex;
  flex: 1;
  flex-direction: column;

  .header {
    -webkit-app-region: drag;
    display: flex;
    align-items: center;
    padding: 1.5rem;

    .nav-btn {
      -webkit-app-region: no-drag;
      margin-right: 0.5rem;

      &:last-of-type {
        margin-right: 0.5rem;
      }

      .iconfont {
        font-size: 1rem;
        color: var(--home-nav-btn-color);
      }

      &:hover .iconfont {
        color: var(--home-nav-btn-hover);
      }
    }

    .search-container {
      display: flex;
      flex: 1;
      position: relative;
      justify-content: space-between;

      .search-input {
        -webkit-app-region: no-drag;
        display: flex;
        align-items: center;
        transition: width 0.3s;
        padding: 0 0.5rem;
        width: min(18.75rem, 400px);
        margin-right: 0.5rem;
        border-radius: 1.25rem !important;
        background-color: var(--td-bg-color-container);
        overflow: visible;
        position: relative;

        &:has(input:focus) {
          width: max(18.75rem, 400px);
        }

        .source-selector {
          display: flex;
          align-items: center;
          cursor: pointer;
          box-sizing: border-box;
          padding: 0.25rem;
          aspect-ratio: 1 / 1;
          border-radius: 999px;
          overflow: hidden;
          transition: background-color 0.2s;

          &:hover {
            background-color: var(--home-source-selector-hover);
          }

          .source-arrow {
            margin-left: 0.25rem;
            font-size: 0.75rem;
            color: #6b7280;
            transition: transform 0.2s;

            &.rotated {
              transform: rotate(180deg);
            }
          }
        }

        .source-mask {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999999;
          background: transparent;
          cursor: pointer;
        }

        .source-list {
          position: absolute;
          top: 100%;
          left: 0;
          z-index: 10000000;
          background: var(--home-source-list-bg);
          border: 1px solid var(--home-source-list-border);
          border-radius: 0.5rem;
          box-shadow: var(--home-source-list-shadow);
          min-width: 10rem;
          overflow-y: hidden;
          margin-top: 0.25rem;
          padding: 0.5em;

          .items {
            max-height: 12rem;
            overflow-y: auto;

            // 隐藏滚动条
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

            // Firefox 隐藏滚动条
            scrollbar-width: none;
          }

          .source-item {
            border-radius: 5px;
            display: flex;
            align-items: center;
            padding: 0.5rem 0.75rem;
            margin-bottom: 5px;
            cursor: pointer;
            transition: background-color 0.2s;

            &:last-child {
              margin: 0;
            }

            &:hover {
              background-color: var(--home-source-item-hover);
            }

            &.active {
              background-color: var(--td-brand-color-1);
              color: var(--td-brand-color);
            }

            .source-icon {
              width: 1rem;
              height: 1rem;
              margin-right: 0.5rem;
            }

            .source-name {
              font-size: 0.875rem;
              white-space: nowrap;
            }
          }
        }
      }

      :deep(.t-input) {
        border-radius: 0rem !important;
        border: none;
        box-shadow: none;
        &.t-input--suffix {
          padding-right: 0 !important;
        }
      }

      .settings-btn {
        .iconfont {
          font-size: 1rem;
          color: var(--td-text-color-secondary);
        }

        &:hover .iconfont {
          color: var(--td-text-color-primary);
        }
      }
    }
  }

  .mainContent {
    flex: 1;
    // overflow-y: auto;
    overflow: hidden;
    position: relative;
    height: 0;
    /* 确保flex子元素能够正确计算高度 */

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
      transition: background-color 0.2s ease;

      &:hover {
        background: var(--home-scrollbar-thumb-hover);
      }
    }

    /* Firefox 滚动条样式 */
    scrollbar-width: thin;
    scrollbar-color: var(--home-scrollbar-color);
  }
}
</style>
