<script lang="ts" setup>
import { computed } from 'vue'
import { usePlaySettingStore } from '@renderer/store'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { storeToRefs } from 'pinia'
import { backgroundRenderers } from '@renderer/config/backgroundRenderers'

const playSetting = usePlaySettingStore()
const backgroundRenderer = computed({
  get: () => playSetting.getBackgroundRenderer,
  set: (value) => playSetting.setBackgroundRenderer(value)
})
const globalPlayStatus = useGlobalPlayStatusStore()
const { player } = storeToRefs(globalPlayStatus)

// 计算偏白的主题色，用于样式绑定
const lightMainColor = computed(() => {
  return player.value.coverDetail.lightMainColor || 'rgba(255, 255, 255, 0.9)'
})

// 设置配置项
const settingSections = computed(() => [
  {
    title: '界面设置',
    items: [
      {
        label: '显示左侧面板',
        value: playSetting.getShowLeftPanel,
        update: (val: boolean) => playSetting.setShowLeftPanel(val)
      },
      {
        label: '沉浸色歌词',
        value: playSetting.getIsImmersiveLyricColor,
        update: (val: boolean) => playSetting.setIsImmersiveLyricColor(val)
      },
      {
        label: '歌词模糊效果',
        value: playSetting.getIsBlurLyric,
        update: (val: boolean) => playSetting.setIsBlurLyric(val)
      },
      {
        label: '音频可视化',
        value: playSetting.getIsAudioVisualizer,
        update: (val: boolean) => playSetting.setIsAudioVisualizer(val)
      },
      {
        label: '自动隐藏控制栏',
        value: playSetting.getAutoHideBottom,
        update: (val: boolean) => playSetting.setAutoHideBottom(val)
      }
    ]
  },
  {
    title: '播放设置',
    items: [
      {
        label: '暂停播放过渡',
        value: playSetting.getIsPauseTransition,
        update: (val: boolean) => playSetting.setIsPauseTransition(val)
      },
      {
        label: '无感过渡(智能交叉淡化)',
        value: playSetting.getIsSeamlessTransition,
        update: (val: boolean) => playSetting.setIsSeamlessTransition(val)
      },
      {
        label: '使用 Apple 风格歌词',
        value: playSetting.getUseAmlLyricRenderer,
        update: (val: boolean) => playSetting.setUseAmlLyricRenderer(val)
      }
    ]
  },
  {
    title: '歌词设置',
    items: [
      {
        label: '跳转时逐行错开',
        value: playSetting.getIsSeekLyricStagger,
        update: (val: boolean) => playSetting.setIsSeekLyricStagger(val)
      },
      {
        label: '过滤歌词歌曲信息(下一首生效)',
        value: playSetting.getIsGrepLyricInfo,
        update: (val: boolean) => playSetting.setIsGrepLyricInfo(val)
      },
      {
        label: '严格过滤模式(可能误伤)',
        value: playSetting.getStrictGrep,
        update: (val: boolean) => playSetting.setStrictGrep(val)
      }
    ]
  }
])
</script>

<template>
  <div class="container">
    <div class="panel-header">播放器样式</div>
    <div class="style-cards">
      <div
        class="style-card"
        :class="{ active: playSetting.getLayoutMode === 'cd' }"
        @click="playSetting.setLayoutMode('cd')"
      >
        <div class="card-preview cd-preview">
          <!-- <div class="preview-circle"></div> -->
          <img src="../../assets/images/cd.png" shape="circle" class="cover" width="100%" />
        </div>
        <span>经典黑胶</span>
      </div>
      <div
        class="style-card"
        :class="{ active: playSetting.getLayoutMode === 'cover' }"
        @click="playSetting.setLayoutMode('cover')"
      >
        <div class="card-preview cover-preview">
          <img src="../../assets/images/cover-play.png" shape="circle" class="cover" width="100%" />
        </div>

        <span>沉浸封面</span>
      </div>
    </div>

    <div class="panel-header" style="margin-top: 24px">背景设置</div>
    <div class="renderer-select">
      <span class="renderer-title">背景渲染器</span>
      <div class="renderer-options" role="radiogroup" aria-label="背景渲染器">
        <t-popup
          v-for="renderer in backgroundRenderers"
          :key="renderer.value"
          trigger="hover"
          placement="top"
          :delay="[2000, 120]"
          :show-arrow="false"
          destroy-on-close
          overlay-inner-class-name="renderer-info-popup"
        >
          <label class="renderer-option" :class="{ active: backgroundRenderer === renderer.value }">
            <input
              v-model="backgroundRenderer"
              type="radio"
              name="background-renderer"
              :value="renderer.value"
              :aria-label="`${renderer.label} ${renderer.name}`"
              :aria-describedby="`renderer-description-${renderer.value}`"
            />
            <span class="renderer-name">{{ renderer.name }}</span>
          </label>
          <template #content>
            <div
              :id="`renderer-description-${renderer.value}`"
              class="renderer-description"
              role="tooltip"
            >
              <div class="renderer-description-header">
                <strong>{{ renderer.label }}</strong>
                <span class="renderer-beat-badge" :class="{ supported: renderer.supportsBeat }">
                  {{ renderer.supportsBeat ? '支持鼓点' : '不支持鼓点' }}
                </span>
              </div>
              <div class="renderer-description-name">{{ renderer.fullName }}</div>
              <p>{{ renderer.description }}</p>
              <div class="renderer-description-detail">{{ renderer.detail }}</div>
            </div>
          </template>
        </t-popup>
      </div>
    </div>
    <div v-if="playSetting.getBackgroundSupportsBeat" class="control-row">
      <span>背景鼓点效果</span>
      <t-switch
        :value="playSetting.getIsBackgroundBeat"
        @update:value="playSetting.setIsBackgroundBeat"
      />
    </div>

    <template v-for="section in settingSections" :key="section.title">
      <div class="panel-header" style="margin-top: 24px">{{ section.title }}</div>
      <div v-for="item in section.items" :key="item.label" class="control-row">
        <span>{{ item.label }}</span>
        <t-switch :value="item.value" @update:value="item.update" />
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.container {
  user-select: none;
  border-radius: 4px;
  flex: 1;
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-width: none;
}
.panel-header {
  color: rgba(255, 255, 255, 0.95);
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  letter-spacing: 0.5px;
}

.style-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.style-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 16px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: translateY(-2px);
  }

  &.active {
    background: rgba(255, 255, 255, 0.15);
    border-color: v-bind(lightMainColor);
    box-shadow: 0 8px 20px -5px rgba(0, 0, 0, 0.3);
  }

  .card-preview {
    width: 100%;
    // height: 80px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 10px;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: content-box;
    &.cd-preview {
      padding: 10px;
    }

    &.cover-preview {
      padding: 10px;
    }
  }

  span {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    font-weight: 500;
  }
}

.control-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;

  span {
    color: rgba(241, 241, 241, 0.8);
    font-size: 14px;
    font-weight: 500;
  }
}

.renderer-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  padding: 4px 8px;
  font-size: 14px;

  .renderer-title {
    flex-shrink: 0;
    color: rgba(241, 241, 241, 0.8);
  }
}

.renderer-options {
  display: grid;
  grid-template-columns: 0.85fr 0.85fr 1.3fr;
  flex: 0 1 190px;
  min-width: 0;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.1);
}

.renderer-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 5px 4px;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.2s;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.09);
  }

  &.active {
    background: rgba(255, 255, 255, 0.18);
    .renderer-name {
      color: rgba(255, 255, 255, 0.95);
    }
  }

  &:has(input:focus-visible) {
    outline: 2px solid rgba(255, 255, 255, 0.9);
    outline-offset: 3px;
  }

  .renderer-name {
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
  }
}
</style>

<!-- 提示浮层挂载到 body，避免被设置面板的滚动区域裁切。 -->
<style lang="scss">
.t-popup__content.renderer-info-popup {
  width: 292px;
  max-width: calc(100vw - 32px);
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(30, 28, 38, 0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
  user-select: none;

  .renderer-description-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
  }

  .renderer-beat-badge {
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;
    line-height: 18px;
    white-space: nowrap;

    &.supported {
      background: rgba(140, 205, 177, 0.12);
      color: #b7ddcb;
    }
  }

  .renderer-description-name {
    margin-top: 3px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
  }

  p {
    margin: 12px 0;
    color: rgba(255, 255, 255, 0.8);
    font-size: 13px;
    line-height: 1.7;
  }

  .renderer-description-detail {
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
