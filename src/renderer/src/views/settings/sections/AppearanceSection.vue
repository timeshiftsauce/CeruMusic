<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import ThemeSelector from '@renderer/components/ThemeSelector.vue'
import LyricFontSettings from '@renderer/components/Settings/LyricFontSettings.vue'
import DesktopLyricStyle from '@renderer/components/Settings/DesktopLyricStyle.vue'

// Store initialization
const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

// Title bar style logic
const currentStyle = ref<'windows' | 'traffic-light'>(
  userInfo.value.topBarStyle ? 'traffic-light' : 'windows'
)

const switchStyle = (style: 'windows' | 'traffic-light'): void => {
  currentStyle.value = style
  console.log(`设置成 ${style} 风格 ${style === 'windows'}`)
  userInfo.value.topBarStyle = style === 'traffic-light'
}
</script>

<template>
  <div class="settings-section">
    <!-- 基础外观 -->
    <t-card title="基础外观" class="setting-card" hover-shadow>
      <div id="appearance-titlebar" class="setting-group-item">
        <div class="setting-label">
          <h4>标题栏风格</h4>
          <p>选择您喜欢的标题栏控制按钮风格</p>
        </div>

        <div class="style-buttons">
          <t-button
            :theme="currentStyle === 'windows' ? 'primary' : 'default'"
            @click="switchStyle('windows')"
          >
            Windows 风格
          </t-button>
          <t-button
            :theme="currentStyle === 'traffic-light' ? 'primary' : 'default'"
            @click="switchStyle('traffic-light')"
          >
            红绿灯风格
          </t-button>
        </div>

        <div class="style-preview">
          <div class="preview-item">
            <h4>Windows 风格</h4>
            <div class="mock-titlebar">
              <div class="mock-title">Windows 风格标题栏</div>
              <TitleBarControls control-style="windows" />
            </div>
          </div>
          <div class="preview-item">
            <h4>红绿灯风格 (macOS)</h4>
            <div class="mock-titlebar">
              <div class="mock-title">红绿灯风格标题栏</div>
              <TitleBarControls control-style="traffic-light" />
            </div>
          </div>
        </div>
      </div>

      <t-divider />

      <div id="appearance-close-behavior" class="setting-group-item">
        <div class="setting-label">
          <h4>关闭按钮行为</h4>
          <p>设置点击窗口关闭按钮时的行为</p>
        </div>
        <div class="setting-control" style="display: flex; align-items: center; gap: 10px">
          <t-switch
            :value="settings.closeToTray"
            @change="(val) => settingsStore.updateSettings({ closeToTray: Boolean(val) })"
          />
          <span class="setting-text">{{
            settings.closeToTray ? '最小化到托盘' : '直接退出应用'
          }}</span>
        </div>
      </div>

      <t-divider />

      <div id="appearance-theme" class="setting-group-item">
        <div class="setting-label">
          <h4>应用主题色</h4>
          <p>选择应用的主题颜色</p>
        </div>
        <ThemeSelector />
      </div>

      <t-divider />

      <div
        v-if="settingsStore.shouldUseSpringFestivalTheme()"
        id="appearance-festival-theme"
        class="setting-group-item"
      >
        <div class="setting-label">
          <h4>节日主题(限时体验)</h4>
          <p>当前为春节主题，您可以选择关闭</p>
        </div>
        <div class="setting-control" style="display: flex; align-items: center; gap: 10px">
          <t-button
            v-if="!settings.springFestivalDisabled"
            theme="danger"
            @click="settingsStore.disableSpringFestivalTheme()"
          >
            关闭春节主题
          </t-button>
          <template v-else>
            <t-tag theme="default">春节主题已关闭</t-tag>
            <t-button
              theme="success"
              variant="outline"
              @click="settingsStore.enableSpringFestivalTheme()"
            >
              开启春节主题
            </t-button>
          </template>
        </div>
      </div>
    </t-card>

    <!-- 歌词设置 -->
    <div class="setting-spacer"></div>
    <div id="appearance-lyric-font">
      <LyricFontSettings />
    </div>

    <div class="setting-spacer"></div>
    <div id="appearance-desktop-lyric">
      <DesktopLyricStyle />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-section {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;
}

.setting-group-item {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.setting-label {
  margin-bottom: 16px;

  h4 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--td-text-color-primary);
  }

  p {
    margin: 0;
    font-size: 12px;
    color: var(--td-text-color-secondary);
  }
}

.style-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;

  .t-button {
    transition: all 0.2s ease;
    &:hover {
      transform: translateY(-1px);
    }
  }
}

.style-preview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  .preview-item {
    background: var(--settings-preview-bg);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--settings-preview-border);

    h4 {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--settings-text-primary);
    }
  }
}

.mock-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--settings-mock-titlebar-bg);
  border-radius: 0.375rem;
  border: 1px solid var(--settings-mock-titlebar-border);

  .mock-title {
    font-weight: 500;
    color: var(--settings-text-primary);
    font-size: 0.875rem;
  }
}

.setting-spacer {
  height: 24px;
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

@media (max-width: 768px) {
  .style-preview {
    grid-template-columns: 1fr;
  }
}
</style>
