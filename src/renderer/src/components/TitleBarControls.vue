<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

// 定义窗口控制按钮风格类型
type ControlStyle = 'traffic-light' | 'windows'

// 组件属性
interface Props {
  controlStyle?: ControlStyle
  showSettings?: boolean
  showBack?: boolean
  title?: string
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  controlStyle: 'windows',
  showSettings: true,
  showBack: false,
  title: '',
  color: '#f3f4f6'
})

// Mini 模式现在是直接隐藏到系统托盘，不需要状态跟踪

// 计算样式类名
const controlsClass = computed(() => {
  return `title-controls ${props.controlStyle}`
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
  window.api?.setMiniMode(true)
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

    <!-- 窗口控制按钮组 -->
    <div class="window-controls">
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
        <i v-if="controlStyle === 'windows'" class="iconfont icon-zuixiaohua"></i>
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
        <i v-if="controlStyle === 'windows'" class="iconfont icon-a-tingzhiwukuang"></i>
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
        <i v-if="controlStyle === 'windows'" class="iconfont icon-a-quxiaoguanbi"></i>
        <div v-else class="traffic-light close"></div>
      </t-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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
      color: #111827;
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
          background-color: #f3f4f6;
        }
      }
    }
    .title-box {
      flex: 1;
    }
  }

  .settings-btn {
    margin-right: 0.5rem;

    &:hover {
      background-color: #f3f4f6;
    }
  }

  .window-controls {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .mini-btn {
    &.active .iconfont {
      color: #f97316;
    }

    &:hover {
      background-color: #f3f4f6;
    }
  }

  .minimize-btn:hover {
    background-color: #f3f4f6;
  }

  .maximize-btn:hover {
    background-color: #f3f4f6;
  }

  .close-btn:hover {
    background-color: #fee2e2;

    .iconfont {
      color: #dc2626;
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
