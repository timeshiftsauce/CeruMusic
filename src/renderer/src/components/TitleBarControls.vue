<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import defaultAvatar from '@renderer/assets/user.webp'
import { useAuthStore } from '@renderer/store'
import { PoweroffIcon, UserIcon } from 'tdesign-icons-vue-next'
import { NIcon } from 'naive-ui'
import { h, type Component } from 'vue'

const props = withDefaults(defineProps<Props>(), {
  controlStyle: false,
  showSettings: true,
  showBack: false,
  showAccount: false,
  title: '',
  color: 'var(--titlebar-btn-text-color)'
})
const Store = LocalUserDetailStore()
const { userInfo } = storeToRefs(Store)
const authStore = useAuthStore()

const renderIcon = (icon: Component) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const userOpt = [
  {
    label: '我的个人信息',
    key: 'myInfo',
    icon: renderIcon(UserIcon)
  },
  {
    type: 'divider',
    key: 'd1'
  },
  {
    label: '注销登录',
    key: 'logout',
    icon: renderIcon(PoweroffIcon)
  }
]

const dropdownTheme = {
  borderRadius: '8px'
}

type ControlStyle = 'traffic-light' | 'windows'

// 组件属性
interface Props {
  controlStyle?: ControlStyle | boolean
  showSettings?: boolean
  showBack?: boolean
  showAccount?: boolean
  title?: string
  color?: string
}

// 账号相关
const handleLogin = () => {
  authStore.login()
}

const handleMenuSelect = (key: string | number) => {
  if (key === 'logout') {
    authStore.logout()
  }
}

const displayName = computed(() => {
  const u = authStore.user
  return u?.name || u?.username || u?.email || '用户'
})

// Mini 模式现在是直接隐藏到系统托盘，不需要状态跟踪

// 计算样式类名
const controlsClass = computed(() => {
  if (props.controlStyle !== false) {
    return `title-controls ${props.controlStyle}`
  } else {
    return userInfo.value.topBarStyle ? 'title-controls traffic-light' : 'title-controls windows'
  }
})

// 窗口控制方法
const handleMinimize = (): void => {
  window.api?.minimize()
}

const handleMaximize = (): void => {
  window.api?.maximize()
}

const handleClose = (): void => {
  window.api?.close()
}

const handleMiniMode = (): void => {
  // 直接最小化到系统托盘
  console.log('TitleBarControls: 点击了最小化到系统托盘按钮')
  if (window.api) {
    console.log('TitleBarControls: window.api 存在，调用 setMiniMode(true)')
    window.api.setMiniMode(true)
  } else {
    console.error('TitleBarControls: window.api 不存在！')
  }
  console.log('最小化到系统托盘')
}

// 路由实例
const router = useRouter()

const handleSettings = (): void => {
  // 跳转到设置页面
  router.push('/settings')
}

const handleBack = (): void => {
  // 返回上一页
  router.back()
}
</script>

<template>
  <div :class="controlsClass">
    <div class="left">
      <div class="back-box">
        <t-button
          v-if="showBack"
          shape="circle"
          theme="default"
          variant="text"
          class="control-btn back-btn"
          title="返回"
          @click="handleBack"
        >
          <i class="iconfont icon-xiangzuo"></i>
        </t-button>
      </div>
      <div class="title-box">
        <p>{{ title }}</p>
      </div>
    </div>

    <div class="window-controls">
      <!-- 账号模块 -->
      <div v-if="showAccount" class="account-module">
        <n-dropdown
          v-if="authStore.isAuthenticated && authStore.user"
          style="-webkit-app-region: none"
          :options="userOpt"
          placement="bottom-start"
          trigger="hover"
          :theme-overrides="dropdownTheme"
          @select="handleMenuSelect"
        >
          <div
            class="user-capsule"
            :style="
              authStore.isAuthenticated
                ? 'background: rgba(125, 125, 125, 0.1);border: 1px solid rgba(125, 125, 125, 0.2);'
                : ''
            "
          >
            <t-avatar
              v-if="authStore.user.picture"
              :image="authStore.user.picture"
              size="small"
              style="margin-right: 4px"
            />
            <t-avatar
              v-else
              :image="defaultAvatar"
              size="small"
              style="margin-right: 4px; background: rgba(125, 125, 125, 0.2); color: inherit"
            />
            <span class="user-name">{{ displayName }}</span>
          </div>
        </n-dropdown>
        <div v-else class="user-capsule" @click="handleLogin">
          <t-avatar :image="defaultAvatar" size="small" style="margin-right: 4px" />
          <span class="user-name">未登录</span>
        </div>
      </div>

      <!-- 设置按钮 -->
      <t-button
        v-if="showSettings"
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn settings-btn"
        @click="handleSettings"
      >
        <i class="iconfont icon-shezhi"></i>
      </t-button>

      <!-- Mini 模式按钮 -->
      <t-button
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn mini-btn"
        title="最小化到系统托盘"
        @click="handleMiniMode"
      >
        <i class="iconfont icon-dibu"></i>
      </t-button>

      <!-- 最小化按钮 -->
      <t-button
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn minimize-btn"
        title="最小化"
        @click="handleMinimize"
      >
        <i
          v-if="
            controlStyle === false ? userInfo.topBarStyle === false : controlStyle === 'windows'
          "
          class="iconfont icon-zuixiaohua"
        ></i>
        <div v-else class="traffic-light minimize"></div>
      </t-button>

      <!-- 最大化按钮 -->
      <t-button
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn maximize-btn"
        title="最大化"
        @click="handleMaximize"
      >
        <i
          v-if="
            controlStyle === false ? userInfo.topBarStyle === false : controlStyle === 'windows'
          "
          class="iconfont icon-a-tingzhiwukuang"
        ></i>
        <div v-else class="traffic-light maximize"></div>
      </t-button>

      <!-- 关闭按钮 -->
      <t-button
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn close-btn"
        title="关闭"
        @click="handleClose"
      >
        <i
          v-if="
            controlStyle === false ? userInfo.topBarStyle === false : controlStyle === 'windows'
          "
          class="iconfont icon-a-quxiaoguanbi"
        ></i>
        <div v-else class="traffic-light close"></div>
      </t-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
:deep(.n-dropdown-menu) {
  -webkit-app-region: none;
}
.title-controls {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.25rem;
  -webkit-app-region: drag;

  .control-btn {
    -webkit-app-region: no-drag;
    width: 2.25rem;
    height: 2.25rem;
    min-width: 2.25rem;
    padding: 0;
    border: none;
    background: transparent;

    .iconfont {
      font-size: 1.125rem;
      color: v-bind(color);
    }

    &:hover .iconfont {
      color: v-bind(color) !important;
    }
  }

  .left {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex: 1;
    -webkit-app-region: drag;
    min-height: 20px;

    .back-box {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      .back-btn {
        -webkit-app-region: no-drag;
        margin-right: 0.5rem;
        &:hover {
          background-color: var(--titlebar-btn-hover-bg);
        }
      }
    }
    .title-box {
      flex: 1;

      p {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--settings-text-primary, v-bind(color));
        line-height: 1.2;
      }
    }
  }

  .settings-btn {
    // margin-right: 0.5rem;

    &:hover {
      background-color: var(--titlebar-btn-hover-bg);
    }
  }

  .window-controls {
    -webkit-app-region: no-drag;

    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .account-module {
    -webkit-app-region: no-drag;
    margin-right: 0.25rem;

    .login-btn {
      width: 2.25rem;
      height: 2.25rem;
      min-width: 2.25rem;
      padding: 0;
      border-radius: 50%;
      background: transparent;
      color: v-bind(color);

      &:hover {
        background-color: var(--titlebar-btn-hover-bg);
      }
    }

    .user-capsule {
      display: flex;
      align-items: center;
      gap: 0.25rem;

      padding: 0.15rem 0.6rem 0.15rem calc((2rem - 24px) / 2);
      border-radius: 999px;
      cursor: pointer;
      transition: background-color 0.2s;
      height: 2rem;
      box-sizing: border-box;

      &:hover {
        background: rgba(125, 125, 125, 0.2);
      }

      .user-name {
        font-size: 0.8rem;
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
        color: v-bind(color);
        line-height: 1;
      }
    }
  }

  .mini-btn {
    &.active .iconfont {
      color: #f97316;
    }

    &:hover {
      background-color: var(--titlebar-btn-hover-bg);
    }
  }

  .minimize-btn:hover {
    background-color: var(--titlebar-btn-hover-bg);
  }

  .maximize-btn:hover {
    background-color: var(--titlebar-btn-hover-bg);
  }

  .close-btn:hover {
    background-color: var(--titlebar-close-hover-bg);

    .iconfont {
      color: v-bind(color) !important;
    }
  }
}

// Windows 风格样式
.title-controls.windows {
  .control-btn {
    border-radius: 0.25rem;
  }
}

// 红绿灯风格样式
.title-controls.traffic-light {
  .control-btn {
    border-radius: 50%;
    width: 2.25rem;
    height: 2.25rem;
    min-width: 2.25rem;
  }

  .traffic-light {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;

    &.close {
      background-color: #ff5f57;

      &:hover {
        background-color: #ff3b30;
      }
    }

    &.minimize {
      background-color: #ffbd2e;

      &:hover {
        background-color: #ff9500;
      }
    }

    &.maximize {
      background-color: #28ca42;

      &:hover {
        background-color: #30d158;
      }
    }
  }

  .close-btn:hover {
    background-color: transparent;
  }

  .minimize-btn:hover,
  .maximize-btn:hover {
    background-color: transparent;
  }
}
</style>
