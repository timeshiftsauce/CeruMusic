<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'
import LyricFontSettings from '@renderer/components/Settings/LyricFontSettings.vue'
import DesktopLyricStyle from '@renderer/components/Settings/DesktopLyricStyle.vue'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const isMac = computed(() => /mac/i.test(navigator.platform || navigator.userAgent))
</script>

<template>
  <div class="settings-section lyrics-section">
    <div id="appearance-lyric-font"><LyricFontSettings /></div>
    <div id="appearance-desktop-lyric"><DesktopLyricStyle /></div>
    <section v-if="isMac" id="appearance-mac-status-lyric" class="setting-group">
      <h3>状态栏歌词</h3>
      <div class="setting-row">
        <div>
          <div class="item-title">菜单栏显示歌词</div>
          <p>在 mac 状态栏显示当前歌词，并通过状态栏菜单控制播放。</p>
        </div>
        <t-switch
          :value="settings.macStatusBarLyricEnabled"
          aria-label="菜单栏显示歌词"
          @change="(val) => settingsStore.updateSettings({ macStatusBarLyricEnabled: Boolean(val) })"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.lyrics-section { display: flex; flex-direction: column; gap: 18px; }
.lyrics-section :deep(.t-card) { border: 1px solid var(--settings-group-border); border-radius: 12px; box-shadow: none; background: var(--settings-group-bg); }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.item-title { font-size: 14px; font-weight: 500; }
p { margin: 6px 0 0; color: var(--settings-text-secondary); font-size: 13px; line-height: 1.6; }
</style>
