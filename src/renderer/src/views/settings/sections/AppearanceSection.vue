<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import ThemeSelector from '@renderer/components/ThemeSelector.vue'
import GlobalBackgroundSettings from '@renderer/components/Settings/GlobalBackgroundSettings.vue'

// Store initialization
const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

// Title bar style logic
const currentStyle = ref<'windows' | 'traffic-light'>(
  userInfo.value.topBarStyle ? 'traffic-light' : 'windows'
)

const switchStyle = (style: string | number | boolean): void => {
  if (style !== 'windows' && style !== 'traffic-light') return
  currentStyle.value = style
  console.log(`设置成 ${style} 风格 ${style === 'windows'}`)
  userInfo.value.topBarStyle = style === 'traffic-light'
}
</script>

<template>
  <div class="settings-section">
    <!-- 基础外观 -->
    <t-card title="主题与窗口" class="setting-card">
      <div id="appearance-titlebar" class="setting-group-item">
        <div class="setting-label">
          <h4>标题栏风格</h4>
          <p>选择您喜欢的标题栏控制按钮风格</p>
        </div>

        <t-radio-group
          :value="currentStyle"
          class="style-preview"
          aria-label="标题栏风格"
          @change="switchStyle"
        >
          <t-radio
            v-for="style in (['windows', 'traffic-light'] as const)"
            :key="style"
            :value="style"
            class="preview-item"
            :class="{ selected: currentStyle === style }"
          >
            <span class="mock-window" aria-hidden="true">
              <span class="mock-titlebar">
                <span class="mock-title">澜音</span>
                <span v-if="style === 'windows'" class="mock-controls windows">
                  <span>−</span><span>□</span><span>×</span>
                </span>
                <span v-else class="mock-controls lights">
                  <span></span><span></span><span></span>
                </span>
              </span>
              <span class="mock-body"><span></span><span></span><span></span></span>
            </span>
            <span class="preview-caption">
              <span>{{ style === 'windows' ? 'Windows 风格' : '红绿灯风格' }}</span>
            </span>
          </t-radio>
        </t-radio-group>
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

    <div class="setting-spacer"></div>
    <t-card id="appearance-background" title="全局背景" class="setting-card">
      <GlobalBackgroundSettings />
    </t-card>
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

.style-preview {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.preview-item {
  height: auto;
  margin: 0;
  align-items: flex-end;
  min-width: 0;
  :deep(.t-radio__label) { flex: 1; min-width: 0; white-space: normal; }
  :deep(.t-radio__input) { margin-bottom: 2px; flex-shrink: 0; }
  padding: 14px;
  border: 1px solid var(--settings-preview-border);
  border-radius: 12px;
  background: var(--settings-preview-bg);
  color: var(--settings-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover { border-color: var(--td-brand-color); }
  &:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 3px; }
  &.selected {
    border-color: var(--td-brand-color);
    background: color-mix(in srgb, var(--td-brand-color) 6%, var(--settings-group-bg));
  }
}
.mock-window {
  display: block;
  overflow: hidden;
  border: 1px solid var(--settings-group-border);
  border-radius: 7px;
  background: var(--settings-group-bg);
}
.mock-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--settings-group-border);
  font-size: 11px;
  color: var(--settings-text-secondary);
}
.mock-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  &.windows { font-size: 15px; line-height: 1; }
  &.lights {
    gap: 7px;
    span { width: 9px; height: 9px; border-radius: 50%; background: #ffbd2e; }
    span:nth-child(2) { background: #28c840; }
    span:nth-child(3) { background: #ff5f57; }
  }
}
.mock-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px;
  span { height: 5px; width: 62%; border-radius: 3px; background: var(--settings-group-border); }
  span:first-child { width: 34%; background: color-mix(in srgb, var(--td-brand-color) 28%, var(--settings-group-border)); }
  span:last-child { width: 48%; }
}
.preview-caption {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-top: 12px;
  font-size: 13px;
  font-weight: 600;
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
