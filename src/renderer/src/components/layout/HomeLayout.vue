<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import SearchSuggest from '@renderer/components/search/searchSuggest.vue'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { onMounted, ref, watchEffect, computed } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useRouter } from 'vue-router'
import { useSearchStore } from '@renderer/store'

onMounted(() => {
  const LocalUserDetail = LocalUserDetailStore()
  watchEffect(() => {
    source.value = sourceicon[LocalUserDetail.userSource.source || 'wy']
  })
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
  }
  // {
  //   name: '最近',
  //   icon: 'icon-shijian',
  //   path: '/home/recent'
  // }
]
const menuActive = ref(0)
const router = useRouter()
const source_list_show = ref(false)

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
</script>

<template>
  <t-layout class="home-container">
    <!-- sidebar -->
    <t-aside class="sidebar">
      <div class="sidebar-content">
        <div class="logo-section">
          <div class="logo-icon">
            <i class="iconfont icon-music"></i>
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

              <TitleBarControls></TitleBarControls>
            </div>
          </div>

          <div class="mainContent">
            <slot name="body"></slot>
          </div>
        </div>
      </t-content>
    </t-layout>
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
