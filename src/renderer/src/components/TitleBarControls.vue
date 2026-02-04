<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

const props = withDefaults(defineProps<Props>(), {
  controlStyle: false,
  showSettings: true,
  showBack: false,
  showAccount: false,
  title: '',
  color: ''
})
const Store = LocalUserDetailStore()
const { userInfo } = storeToRefs(Store)

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

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
  if (!settings.value.hasConfiguredCloseBehavior) {
    showCloseDialog.value = true
    return
  }

  if (settings.value.closeToTray) {
    handleMiniMode()
  } else {
    window.api?.close()
  }
}

const showCloseDialog = ref(false)
const rememberChoice = ref(true)

const handleCloseChoice = (toTray: boolean): void => {
  if (rememberChoice.value) {
    settingsStore.updateSettings({
      closeToTray: toTray,
      hasConfiguredCloseBehavior: true
    })
  }
  showCloseDialog.value = false
  if (toTray) {
    handleMiniMode()
  } else {
    window.api?.close()
  }
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
      <slot name="extra" />
      <!-- 账号模块 -->
      <div v-if="showAccount" class="account-module">
        <UserCapsule :color="color" />
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
        v-if="!settings.closeToTray"
        shape="circle"
        theme="default"
        variant="text"
        class="control-btn mini-btn"
        title="最小化到系统托盘"
        @click="handleMiniMode"
      >
        <i class="iconfont icon-dibu"></i>
      </t-button>
      <div
        v-if="userInfo.topBarStyle === false"
        style="
          width: 1px;
          height: 1rem;
          background: var(--td-border-level-1-color);
          margin: 0 3px;
          border-radius: 2px;
        "
        :style="color ? 'background: ' + color : ''"
      ></div>
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

    <t-dialog v-model:visible="showCloseDialog" header="关闭提示" :close-btn="true" placement="top">
      <div>您希望如何处理关闭操作？</div>
      <div style="margin-top: 10px">
        <t-checkbox v-model="rememberChoice">记住我的选择，下次不再询问</t-checkbox>
      </div>
      <template #footer>
        <t-button theme="default" @click="handleCloseChoice(false)">
          <template #icon>
            <i
              class="iconfont icon-a-quxiaoguanbi"
              style="font-size: 0.8em; margin-right: 0.5em"
            ></i>
          </template>
          直接退出</t-button
        >
        <t-button theme="primary" @click="handleCloseChoice(true)">
          <template #icon>
            <i class="iconfont icon-dibu" style="font-size: 0.8em; margin-right: 0.5em"></i>
          </template>
          最小化到托盘</t-button
        >
      </template>
    </t-dialog>
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
    flex-shrink: 0;
  }

  .account-module {
    -webkit-app-region: no-drag;
    margin-right: 0.25rem;
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
