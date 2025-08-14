<script setup lang="ts">
import PlayMusic from '@renderer/components/Play/PlayMusic.vue'
import { ref } from 'vue'
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
const handleClick = (index: number): void => {
  menuActive.value = index
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
            Such Music
            <span>PC</span>
          </p>
        </div>

        <nav class="nav-section">
          <t-button
            v-for="(item, index) in menuList"
            :key="index"
            :theme="menuActive == index ? 'warning' : ''"
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

    <t-layout>
      <t-content>
        <div class="content">
          <!-- Header -->
          <div class="header">
            <t-button shape="circle" theme="default" class="nav-btn">
              <i class="iconfont icon-xiangzuo"></i>
            </t-button>
            <t-button shape="circle" theme="default" class="nav-btn">
              <i class="iconfont icon-xiangyou"></i>
            </t-button>

            <div class="search-container">
              <div class="search-input">
                <svg class="icon" aria-hidden="true">
                  <use
                    xlink:href="#icon-wangyiyun
"
                  ></use>
                </svg>
                <t-input placeholder="搜索音乐、歌手" />
              </div>
              <t-button shape="circle" theme="default" class="settings-btn">
                <i class="iconfont icon-shezhi"></i>
              </t-button>
            </div>
          </div>

          <router-view />
        </div>
      </t-content>
    </t-layout>
  </t-layout>
  <PlayMusic />
</template>

<style lang="scss" scoped>
.home-container {
  height: 100vh;
}

.icon {
  width: 1.5rem;
  height: 1.5rem;
}

.sidebar {
  width: 15rem;
  background-color: #fff;
  border-right: 0.0625rem solid #e5e7eb;

  .sidebar-content {
    padding: 1rem;

    .logo-section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;

      .logo-icon {
        width: 2rem;
        height: 2rem;
        background-color: #f97316;
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
        font-weight: 800;
        font-size: 1.125rem;
        color: #111827;
        span {
          font-weight: 800;
          color: #f54a00;
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
          background-color: #f97316;
          color: white;

          &:hover {
            background-color: #ea580c;
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

.content {
  padding: 0;
  background: #f6f6f6;
  height: 100vh;

  .header {
    display: flex;
    align-items: center;
    padding: 1.5rem;

    .nav-btn {
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

      .search-input {
        display: flex;
        align-items: center;
        padding: 0 0.5rem;
        width: 18.75rem;
        margin-right: 0.5rem;
        border-radius: 1.25rem !important;
        background-color: #fff;
        overflow: hidden;
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
}
</style>
