<script setup lang="ts">
import PlayMusic from '@renderer/components/Play/PlayMusic.vue'
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import { onMounted, ref, watchEffect } from 'vue'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { useRouter } from 'vue-router'
import { searchValue } from '@renderer/store/search'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
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
    name: '本地',
    icon: 'icon-music',
    path: '/home/local'
  },
  {
    name: '最近',
    icon: 'icon-shijian',
    path: '/home/recent'
  }
]
const menuActive = ref(0)
const router = useRouter()

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
const keyword = ref('')

// 搜索类型：1: 单曲, 10: 专辑, 100: 歌手, 1000: 歌单
// const searchType = ref(1)

// 处理搜索事件
const handleSearch = async () => {
  if (!keyword.value.trim()) return
  const useSearch = searchValue()
  // 重新设置搜索关键字
  try {
    // 跳转到搜索结果页面，并传递搜索结果和关键词
    useSearch.setValue(keyword.value.trim()) // 设置搜索关键字
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
}
</script>

<template>
  <div class="home">
    <t-layout class="home-container">
      <!-- sidebar -->
      <t-aside class="sidebar">
        <div class="sidebar-content">
          <div class="logo-section">
            <div class="logo-icon">
              <i class="iconfont icon-music"></i>
            </div>
            <p class="app-title">
              <span style="color: #000; font-weight: 800">Ceru Music</span>
            </p>
          </div>

          <nav class="nav-section">
            <t-button v-for="(item, index) in menuList" :key="index" :variant="menuActive == index ? 'base' : 'text'"
              :class="menuActive == index ? 'nav-button active' : 'nav-button'" block @click="handleClick(index)">
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
                  <svg class="icon" aria-hidden="true">
                    <use :xlink:href="`#icon-${source}`"></use>
                  </svg>
                  <t-input v-model="keyword" placeholder="搜索音乐、歌手" style="width: 100%" @enter="handleKeyDown">
                    <template #suffix>
                      <t-button theme="primary" variant="text" shape="circle"
                        style="display: flex; align-items: center; justify-content: center" @click="handleSearch">
                        <SearchIcon style="font-size: 16px; color: #000" />
                      </t-button>
                    </template>
                  </t-input>
                </div>

                <TitleBarControls :color="'#000'"></TitleBarControls>
              </div>
            </div>

            <div class="mainContent">
              <router-view v-slot="{ Component, route }">
                <Transition name="page"
                  :enter-active-class="`animate__animated ${route.meta.transitionIn} animate__fast`"
                  :leave-active-class="`animate__animated ${route.meta.transitionOut} animate__fast`">
                  <KeepAlive exclude="list">
                    <component :is="Component" />
                  </KeepAlive>
                </Transition>
              </router-view>
            </div>
          </div>
        </t-content>
      </t-layout>
    </t-layout>
    <PlayMusic />
  </div>
</template>

<style lang="scss" scoped>
.animate__animated {
  position: absolute;
  width: 100%;
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
  background-image: linear-gradient(to bottom,var(--td-brand-color-4) -140vh, #ffffff 30vh);
  border-right: 0.0625rem solid #e5e7eb;
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
          color: white;
        }
      }

      .app-title {
        font-weight: 500;
        font-size: 1.125rem;
        color: #111827;

        span {
          font-weight: 500;
          color: #b8f0cc;
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

        &.active {
          background-color: var(--td-brand-color-4);
          color: rgb(255, 255, 255);

          &:hover {
            background-color: var(--td-brand-color-5);
          }
        }

        &:not(.active) {
          color: #6b7280;

          &:hover {
            color: #111827;
            background-color: #f3f4f6;
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
  background-image: linear-gradient(to bottom,var(--td-brand-color-4) -110vh, #ffffff 15vh);

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
        color: #3d4043;
      }

      &:hover .iconfont {
        color: #111827;
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
        width: min(18.75rem,400px);
        margin-right: 0.5rem;
        border-radius: 1.25rem !important;
        background-color: #fff;
        overflow: hidden;
        &:has(input:focus){
          width: max(18.75rem,400px);
        }
      }

      :deep(.t-input) {
        border-radius: 0rem !important;
        border: none;
        box-shadow: none;
      }

      .settings-btn {
        .iconfont {
          font-size: 1rem;
          color: #6b7280;
        }

        &:hover .iconfont {
          color: #111827;
        }
      }
    }
  }

  .mainContent {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    height: 0;
    /* 确保flex子元素能够正确计算高度 */

    &::-webkit-scrollbar {
      width: 0.375rem;
    }

    &::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 0.1875rem;
    }

    &::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 0.1875rem;
      transition: background-color 0.2s ease;

      &:hover {
        background: #94a3b8;
      }
    }

    /* Firefox 滚动条样式 */
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 #f1f5f9;
  }
}
</style>
