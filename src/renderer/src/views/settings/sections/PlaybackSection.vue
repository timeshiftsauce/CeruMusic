<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { playSetting as usePlaySetting } from '@renderer/store/playSetting'
import PlaylistSettings from '@renderer/components/Settings/PlaylistSettings.vue'
import AudioOutputSettings from '@renderer/components/Settings/AudioOutputSettings.vue'
import EqualizerSettings from '@renderer/components/Settings/EqualizerSettings.vue'
import AudioEffectSettings from '@renderer/components/Settings/AudioEffectSettings.vue'

const playSettingStore = usePlaySetting()
const { isJumpLyric, bgPlaying, isAudioVisualizer } = storeToRefs(playSettingStore)
</script>

<template>
  <div class="settings-section">
    <div id="playback-playlist" class="setting-group">
      <h3>播放列表管理</h3>
      <PlaylistSettings />
    </div>

    <div id="playback-audio-output" class="setting-group">
      <h3>音频输出</h3>
      <AudioOutputSettings />
    </div>

    <div id="playback-equalizer" class="setting-group">
      <h3>音频均衡器</h3>
      <EqualizerSettings />
    </div>

    <div id="playback-audio-effect" class="setting-group">
      <h3>高级音效处理</h3>
      <AudioEffectSettings />
    </div>

    <!-- 播放显示 -->
    <div id="playback-performance" class="setting-group">
      <h3>全屏播放-性能优化</h3>

      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">跳动歌词</div>
          <div class="item-desc">使用弹簧引擎效果跳动歌词、占用更高的性能</div>
        </div>
        <t-switch v-model="isJumpLyric" @change="playSettingStore.setIsDumpLyric(isJumpLyric)" />
      </div>

      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">背景动画</div>
          <div class="item-desc">启用布朗运动背景动画、占用更高的性能</div>
        </div>
        <t-switch v-model="bgPlaying" @change="playSettingStore.setBgPlaying(bgPlaying)" />
      </div>

      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">音频可视化</div>
          <div class="item-desc">显示实时频谱/波形可视化、占用更高的性能</div>
        </div>
        <t-switch
          v-model="isAudioVisualizer"
          @change="playSettingStore.setIsAudioVisualizer(isAudioVisualizer)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-section {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;
}

.setting-group {
  background: var(--settings-group-bg);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--settings-group-border);
  box-shadow: 0 1px 3px var(--settings-group-shadow);
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;

  @for $i from 1 through 5 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 0.1}s;
    }
  }

  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--settings-text-primary);
  }
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  border: 1px solid var(--settings-feature-border);
  background: var(--settings-feature-bg);
  border-radius: 0.5rem;
  margin-top: 0.75rem;

  .item-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;

    .item-title {
      font-weight: 600;
      color: var(--settings-text-primary);
      font-size: 0.95rem;
      line-height: 1.2;
    }

    .item-desc {
      color: var(--settings-text-secondary);
      font-size: 0.8rem;
      line-height: 1.2;
    }
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
