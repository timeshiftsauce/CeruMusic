<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'
import DirectorySettings from '@renderer/components/Settings/DirectorySettings.vue'
import MusicCache from '@renderer/components/Settings/MusicCache.vue'
import { formatMusicInfo } from '@common/utils/format'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const musicCacheRef = ref()
const directorySettingsRef = ref()

const handleDirectoryChanged = () => {
  console.log('目录已更改，刷新缓存信息')
  if (musicCacheRef.value?.refreshCacheInfo) {
    musicCacheRef.value.refreshCacheInfo()
  }
}

const handleCacheCleared = () => {
  console.log('缓存已清除，刷新目录大小')
  if (directorySettingsRef.value?.refreshDirectorySizes) {
    directorySettingsRef.value.refreshDirectorySizes()
  }
}

// Filename template logic
const filenameTemplate = ref(settings.value.filenameTemplate || '%t - %s')
const previewSongInfo: any = {
  name: '半岛铁盒',
  singer: '周杰伦',
  albumName: '八度空间',
  platform: 'tx',
  quality: 'master',
  date: '2026-01-01'
}

const updateFilenameTemplate = () => {
  settingsStore.updateSettings({
    filenameTemplate: filenameTemplate.value || '%t - %s'
  })
}

// Tag options logic
const tagWriteOptions = ref({
  basicInfo: settings.value.tagWriteOptions?.basicInfo ?? true,
  cover: settings.value.tagWriteOptions?.cover ?? true,
  lyrics: settings.value.tagWriteOptions?.lyrics ?? true,
  downloadLyrics: settings.value.tagWriteOptions?.downloadLyrics ?? false,
  includeTranslation: settings.value.tagWriteOptions?.includeTranslation ?? false,
  lyricFormat: settings.value.tagWriteOptions?.lyricFormat ?? 'word-by-word'
})

const updateTagWriteOptions = () => {
  settingsStore.updateSettings({
    tagWriteOptions: { ...tagWriteOptions.value }
  })
}

const getTagOptionsStatus = () => {
  const enabled: string[] = []
  if (tagWriteOptions.value.basicInfo) enabled.push('基础信息')
  if (tagWriteOptions.value.cover) enabled.push('封面')
  if (tagWriteOptions.value.lyrics) enabled.push('歌词')
  if (tagWriteOptions.value.downloadLyrics) enabled.push('单独下载歌词')
  if (tagWriteOptions.value.includeTranslation) enabled.push('歌词翻译')

  return enabled.length > 0 ? enabled.join('、') : '未选择任何选项'
}
</script>

<template>
  <div class="settings-section">
    <div id="storage-directory">
      <DirectorySettings
        ref="directorySettingsRef"
        class="setting-group"
        @directory-changed="handleDirectoryChanged"
        @cache-cleared="handleCacheCleared"
      />
    </div>
    <div id="storage-cache" style="margin-top: 20px" class="setting-group">
      <MusicCache ref="musicCacheRef" @cache-cleared="handleCacheCleared" />
    </div>

    <!-- 缓存策略 -->
    <div id="storage-cache-strategy" class="setting-group">
      <h3>缓存策略</h3>
      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">自动缓存音乐</div>
          <div class="item-desc">播放时自动读取/写入缓存，加速后续播放</div>
        </div>
        <t-switch
          v-model="settings.autoCacheMusic"
          @change="settingsStore.updateSettings({ autoCacheMusic: settings.autoCacheMusic })"
        />
      </div>
    </div>

    <!-- 下载文件名格式设置 -->
    <div id="storage-filename" class="setting-group">
      <h3>下载文件名格式设置</h3>
      <p>选择下载歌曲时要保存的文件名格式</p>

      <div class="template-tip">
        <div class="template-tip-item">
          <t-tag>%t</t-tag>
          <span>歌曲名称</span>
        </div>
        <div class="template-tip-item">
          <t-tag>%s</t-tag>
          <span>歌手</span>
        </div>
        <div class="template-tip-item">
          <t-tag>%a</t-tag>
          <span>专辑</span>
        </div>
        <div class="template-tip-item">
          <t-tag>%u</t-tag>
          <span>平台</span>
        </div>
        <t-tooltip content="例如:128k/320k/flac/hires/master...">
          <div class="template-tip-item">
            <t-tag>%q</t-tag>
            <span style="display: flex; align-items: center">
              音质
              <t-icon name="info-circle" size="12" style="margin-left: 0.2em" />
            </span>
          </div>
        </t-tooltip>
        <div class="template-tip-item">
          <t-tag>%d</t-tag>
          <span>日期</span>
        </div>
      </div>

      <div class="setting-item">
        <t-input
          v-model="filenameTemplate"
          placeholder="文件名格式"
          @change="updateFilenameTemplate"
        />
      </div>

      <div class="preview-container">
        <div>预览：</div>
        <div>{{ formatMusicInfo(filenameTemplate || '%t - %s', previewSongInfo) }}</div>
      </div>
    </div>

    <!-- 标签写入设置 -->
    <div id="storage-tags" class="setting-group">
      <h3>下载标签写入设置</h3>
      <p>选择下载歌曲时要写入的标签信息</p>

      <div class="tag-options">
        <div class="tag-option">
          <t-checkbox v-model="tagWriteOptions.basicInfo" @change="updateTagWriteOptions">
            基础信息
          </t-checkbox>
          <p class="option-desc">包括歌曲标题、艺术家、专辑名称等基本信息</p>
        </div>

        <div class="tag-option">
          <t-checkbox v-model="tagWriteOptions.cover" @change="updateTagWriteOptions">
            封面
          </t-checkbox>
          <p class="option-desc">将专辑封面嵌入到音频文件中</p>
        </div>

        <div class="tag-option">
          <t-checkbox v-model="tagWriteOptions.lyrics" @change="updateTagWriteOptions">
            歌词信息
          </t-checkbox>
          <p class="option-desc">将歌词信息写入音频文件的元信息中</p>
        </div>

        <div class="tag-option">
          <t-checkbox v-model="tagWriteOptions.downloadLyrics" @change="updateTagWriteOptions">
            单独下载歌词文件
          </t-checkbox>
          <p class="option-desc">在下载歌曲的同时，在相同目录下保存一个独立的LRC歌词文件</p>
        </div>

        <div class="tag-option">
          <t-checkbox v-model="tagWriteOptions.includeTranslation" @change="updateTagWriteOptions">
            歌词包含翻译
          </t-checkbox>
          <p class="option-desc">下载歌词时合并翻译行，翻译将显示在对应歌词下方</p>
        </div>

        <div class="tag-option lyric-format-options">
          <t-radio-group
            v-model="tagWriteOptions.lyricFormat"
            :disabled="!tagWriteOptions.lyrics && !tagWriteOptions.downloadLyrics"
            @change="updateTagWriteOptions"
          >
            <t-radio-button value="lrc">标准LRC歌词</t-radio-button>
            <t-radio-button value="word-by-word">逐字歌词</t-radio-button>
          </t-radio-group>
          <p class="option-desc">选择写入或下载的歌词格式</p>
        </div>
      </div>

      <div class="tag-options-status">
        <div class="status-summary">
          <span class="status-label">当前配置：</span>
          <span class="status-value">
            {{ getTagOptionsStatus() }}
          </span>
        </div>
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

  > p {
    margin: 0 0 1.5rem;
    color: var(--settings-text-secondary);
    font-size: 0.875rem;
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

// 文件名模板样式
.template-tip {
  display: flex;
  align-items: center;
  gap: 2em;
}

.template-tip-item {
  display: flex;
  gap: 0.5em;
}

.preview-container {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin: 0.5em 0 0 0;
}

// 标签写入设置样式
.tag-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;

  .tag-option {
    padding: 1rem;
    background: var(--settings-tag-option-bg);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tag-option-border);

    .option-desc {
      margin: 0.5rem 0 0 1.5rem;
      font-size: 0.875rem;
      color: var(--settings-text-secondary);
      line-height: 1.4;
    }
  }
  .tag-options-status {
    background: var(--settings-tag-status-bg);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tag-status-border);
  }

  .lyric-format-options {
    padding-top: 1rem;
    margin-top: 1rem;
    border-top: 1px solid var(--settings-group-border);
  }
  .status-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .status-label {
      font-weight: 500;
      color: var(--settings-text-secondary);
      font-size: 0.875rem;
    }

    .status-value {
      font-weight: 600;
      color: var(--settings-text-primary);
      font-size: 0.875rem;
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
