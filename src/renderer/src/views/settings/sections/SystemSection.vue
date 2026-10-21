<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'
import { playSetting as usePlaySetting } from '@renderer/store/playSetting'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const playSettingStore = usePlaySetting()
const { smtcHiresCover } = storeToRefs(playSettingStore)
</script>

<template>
  <div class="settings-section">
    <section class="setting-group">
      <h3>窗口行为</h3>
      <div id="appearance-close-behavior" class="setting-row">
        <div class="item-info">
          <div class="item-title">关闭时最小化到托盘</div>
          <p>{{ settings.closeToTray ? '点击关闭按钮后继续在后台播放。' : '点击关闭按钮后直接退出应用。' }}</p>
        </div>
        <t-switch :value="settings.closeToTray" aria-label="关闭时最小化到托盘"
          @change="(val) => settingsStore.updateSettings({ closeToTray: Boolean(val) })" />
      </div>
    </section>
    <section class="setting-group">
      <h3>性能与系统集成</h3>
      <div id="playback-route-preload" class="setting-row">
        <div class="item-info">
          <div class="item-title">页面预加载</div>
          <p>空闲时预加载页面组件，提升页面切换速度。</p>
        </div>
        <t-switch :value="settings.routePreloadEnabled" aria-label="页面预加载"
          @change="(val) => settingsStore.updateSettings({ routePreloadEnabled: Boolean(val) })" />
      </div>
      <div id="playback-smtc-hires" class="setting-row">
        <div class="item-info">
          <div class="item-title">系统媒体控件高清封面</div>
          <p>向音源插件获取高清封面，用于系统媒体卡片。需插件支持；获取失败时自动使用原有封面。</p>
        </div>
        <t-switch v-model="smtcHiresCover" aria-label="系统媒体控件高清封面"
          @change="playSettingStore.setSmtcHiresCover(smtcHiresCover)" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 0; }
.setting-row + .setting-row { border-top: 1px solid var(--settings-group-border); }
.item-info { min-width: 0; }
.item-title { font-size: 14px; font-weight: 500; }
p { margin: 6px 0 0; font-size: 13px; line-height: 1.6; color: var(--settings-text-secondary); }
.setting-row :deep(.t-switch) { flex-shrink: 0; }
</style>
