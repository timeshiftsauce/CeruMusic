<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next'
import { playSetting as usePlaySetting } from '@renderer/store/playSetting'
import { useSettingsStore } from '@renderer/store/Settings'
import { nasSyncAPI } from '@renderer/api/nasSync'
import PlaylistSettings from '@renderer/components/Settings/PlaylistSettings.vue'
import AudioOutputSettings from '@renderer/components/Settings/AudioOutputSettings.vue'
import EqualizerSettings from '@renderer/components/Settings/EqualizerSettings.vue'
import AudioEffectSettings from '@renderer/components/Settings/AudioEffectSettings.vue'

const playSettingStore = usePlaySetting()
const { isJumpLyric, bgPlaying, isAudioVisualizer } = storeToRefs(playSettingStore)
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const nasSyncLoading = ref(false)

const updateNasSyncEnabled = (value: unknown) => {
  settingsStore.updateSettings({
    nasSyncEnabled: Boolean(value),
    nasSyncStatus: Boolean(value) && settings.value.nasSyncToken ? settings.value.nasSyncStatus : 'disconnected'
  })
}

const updateNasSyncServerUrl = (value: unknown) => {
  settingsStore.updateSettings({
    nasSyncServerUrl: String(value || ''),
    nasSyncStatus: 'disconnected',
    nasSyncToken: '',
    nasSyncLastRevision: 0
  })
}

const updateNasSyncPairCode = (value: unknown) => {
  settingsStore.updateSettings({ nasSyncPairCode: String(value || '') })
}

const bindNasSyncServer = async () => {
  if (!settings.value.nasSyncServerUrl?.trim()) {
    MessagePlugin.warning('请先填写 NAS 同步服务器地址')
    return
  }
  if (!settings.value.nasSyncPairCode?.trim()) {
    MessagePlugin.warning('请填写绑定码')
    return
  }

  nasSyncLoading.value = true
  try {
    const session = await nasSyncAPI.pair(settings.value.nasSyncPairCode)
    settingsStore.updateSettings({
      nasSyncEnabled: true,
      nasSyncToken: session.accessToken,
      nasSyncStatus: 'connected',
      nasSyncPairCode: '',
      nasSyncLastRevision: settings.value.nasSyncLastRevision || 0
    })
    MessagePlugin.success('NAS 同步服务已连接')
  } catch (error: any) {
    settingsStore.updateSettings({ nasSyncStatus: 'disconnected', nasSyncToken: '' })
    MessagePlugin.error(error?.message || 'NAS 同步服务连接失败')
  } finally {
    nasSyncLoading.value = false
  }
}

const checkNasSyncStatus = async () => {
  nasSyncLoading.value = true
  try {
    await nasSyncAPI.me()
    settingsStore.updateSettings({ nasSyncStatus: 'connected' })
    MessagePlugin.success('NAS 同步服务已连接')
  } catch (error: any) {
    settingsStore.updateSettings({ nasSyncStatus: 'disconnected' })
    MessagePlugin.error(error?.message || 'NAS 同步服务未连接')
  } finally {
    nasSyncLoading.value = false
  }
}
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

    <div id="playback-nas-sync" class="setting-group">
      <h3>NAS 登录模块</h3>
      <p class="setting-group-desc">歌单歌曲数据同步服务，用于桌面端和安卓端多端同步。</p>
      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">同步服务开关</div>
          <div class="item-desc">开启后，歌单、喜欢的歌曲和收藏歌单优先写入 NAS 同步服务</div>
        </div>
        <t-switch :value="settings.nasSyncEnabled" @change="updateNasSyncEnabled" />
      </div>
      <div class="nas-sync-form">
        <label>服务器地址</label>
        <t-input
          :value="settings.nasSyncServerUrl"
          placeholder="例如 http://192.168.1.10:31231 或 https://music.example.com"
          clearable
          @change="updateNasSyncServerUrl"
        />
        <label>登录绑定码</label>
        <t-input
          :value="settings.nasSyncPairCode"
          placeholder="在 NAS 同步服务端生成的一次性登录绑定码"
          clearable
          @change="updateNasSyncPairCode"
        />
        <div class="nas-sync-actions">
          <div class="nas-sync-status" :class="settings.nasSyncStatus === 'connected' ? 'connected' : 'disconnected'">
            {{ settings.nasSyncStatus === 'connected' ? '已连接' : '未连接' }}
          </div>
          <t-button theme="primary" :loading="nasSyncLoading" @click="bindNasSyncServer">
            登录 NAS 同步服务
          </t-button>
          <t-button variant="outline" :loading="nasSyncLoading" @click="checkNasSyncStatus">
            检测连接
          </t-button>
        </div>
      </div>
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

      <div id="playback-route-preload" class="setting-item">
        <div class="item-info">
          <div class="item-title">路由预加载</div>
          <div class="item-desc">空闲时预加载页面组件，提升页面切换速度</div>
        </div>
        <t-switch
          :value="settings.routePreloadEnabled"
          @change="(val) => settingsStore.updateSettings({ routePreloadEnabled: Boolean(val) })"
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

  .setting-group-desc {
    margin: 0 0 0.75rem;
    color: var(--settings-text-secondary);
    font-size: 0.82rem;
    line-height: 1.5;
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

.nas-sync-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;

  label {
    color: var(--settings-text-secondary);
    font-size: 0.82rem;
  }
}

.nas-sync-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.nas-sync-status {
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 0.82rem;
  border: 1px solid var(--settings-feature-border);

  &.connected {
    color: #18c37d;
    background: rgba(24, 195, 125, 0.12);
  }

  &.disconnected {
    color: var(--settings-text-secondary);
    background: var(--settings-feature-bg);
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
