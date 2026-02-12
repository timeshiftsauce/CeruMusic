<script lang="ts" setup>
import { computed } from 'vue'
import { usePlaySettingStore } from '@renderer/store'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { storeToRefs } from 'pinia'

const playSetting = usePlaySettingStore()
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
</style>
