<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { TreeRoundDotIcon } from 'tdesign-icons-vue-next'
import fonts from '@renderer/assets/icon_font/icons'

const emit = defineEmits(['switch-category'])

const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)

// Computeds
const hasPluginData = computed(() => {
  return !!(
    userInfo.value.pluginId &&
    userInfo.value.supportedSources &&
    Object.keys(userInfo.value.supportedSources).length > 0
  )
})

const currentPluginName = computed(() => {
  if (!hasPluginData.value) return ''
  return userInfo.value.pluginName || userInfo.value.pluginId || '未知插件'
})

const currentSourceQualities = computed(() => {
  if (!hasPluginData.value || !userInfo.value.selectSources) return []
  const selectedSource = userInfo.value.supportedSources?.[userInfo.value.selectSources]
  return selectedSource?.qualitys || []
})

const qualitySliderValue = ref(0)

const qualityMarks = computed(() => {
  const marks: Record<number, string> = {}
  currentSourceQualities.value.forEach((quality, index) => {
    marks[index] = String(getQualityDisplayName(quality))
  })
  return marks
})

const globalQualityOptions = computed(() => {
  const sources = userInfo.value.supportedSources || {}
  const keys = Object.keys(sources)
  if (keys.length === 0) return []
  const arrays = keys.map((k) => sources[k].qualitys || [])
  const set = new Set(arrays[0])
  for (let i = 1; i < arrays.length; i++) {
    for (const q of Array.from(set)) {
      if (!arrays[i].includes(q)) set.delete(q)
    }
  }
  return Array.from(set)
})

const globalQualitySelected = ref<string>('')

watch(
  () => globalQualityOptions.value,
  (opts) => {
    if (!opts || opts.length === 0) {
      globalQualitySelected.value = ''
      return
    }
    if (!opts.includes(globalQualitySelected.value)) {
      globalQualitySelected.value = opts[opts.length - 1]
    }
  },
  { immediate: true }
)

const applyGlobalQuality = (q: string) => {
  if (!q) return
  if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
  const sources = userInfo.value.supportedSources || {}
  Object.keys(sources).forEach((key) => {
    const arr = sources[key].qualitys || []
    if (arr.includes(q)) userInfo.value.sourceQualityMap![key] = q
  })
  const currentKey = userInfo.value.selectSources as string
  const arr = sources[currentKey]?.qualitys || []
  if (arr.includes(q)) userInfo.value.selectQuality = q
}

// Watch current quality to update slider
watch(
  [() => userInfo.value.selectQuality, () => currentSourceQualities.value],
  ([newQuality, qualities]) => {
    if (qualities.length > 0 && newQuality) {
      const index = qualities.indexOf(newQuality)
      if (index !== -1) {
        qualitySliderValue.value = index
      } else {
        console.log('当前音质不在支持列表中，选择默认音质')
        userInfo.value.selectQuality = qualities[qualities.length - 1]
      }
    }
  },
  { immediate: true }
)

const selectSource = (sourceKey: string) => {
  if (!hasPluginData.value) return

  userInfo.value.selectSources = sourceKey

  const source = userInfo.value.supportedSources?.[sourceKey]
  if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
  if (source && source.qualitys && source.qualitys.length > 0) {
    const saved = userInfo.value.sourceQualityMap[sourceKey]
    const useQuality =
      saved && source.qualitys.includes(saved) ? saved : source.qualitys[source.qualitys.length - 1]
    userInfo.value.sourceQualityMap[sourceKey] = useQuality
    userInfo.value.selectQuality = useQuality
  }
}

const onQualityChange = (value: any) => {
  if (
    currentSourceQualities.value.length > 0 &&
    value >= 0 &&
    value < currentSourceQualities.value.length
  ) {
    const q = currentSourceQualities.value[value]
    userInfo.value.selectQuality = q
    if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
    const key = userInfo.value.selectSources as string
    userInfo.value.sourceQualityMap[key] = q
  }
}

const getQualityDisplayName = (quality: string) => {
  const qualityMap: Record<string, string> = {
    low: '标准',
    standard: '高品质',
    high: '超高品质',
    lossless: '无损',
    '128k': '标准 128K',
    '192k': '高品质 192K',
    '320k': '超高品质 320K',
    flac: '无损 FLAC',
    flac24bit: '高解析度无损',
    hires: '高清臻音',
    atmos: '沉浸环绕声',
    master: '超清母带'
  }
  return qualityMap[quality] || quality
}

const getQualityDescription = (quality: string) => {
  const descriptions: Record<string, string> = {
    low: '适合网络较慢的环境，节省流量',
    standard: '平衡音质与文件大小，推荐选择',
    high: '高音质体验，适合有线网络',
    lossless: '最佳音质体验，需要较好的网络环境',
    '128k': '基础音质，文件较小',
    '192k': '良好音质，适合大多数场景',
    '320k': '高品质音质，接近CD品质',
    flac: '无损音质，完美还原原始录音',
    flac24bit: '更饱满清晰的高解析度音质，最高192kHz/24bit',
    hires: '声音听感加强，96kHz/24bit',
    atmos: '沉浸式空间环绕音感，最高5.1声道',
    master: '母带级音质,192kHz/24bit'
  }
  return descriptions[quality] || '自定义音质设置'
}

const getCurrentSourceName = () => {
  if (!hasPluginData.value || !userInfo.value.selectSources) return '未选择'
  const source = userInfo.value.supportedSources?.[userInfo.value.selectSources]
  return source?.name || userInfo.value.selectSources
}

const goPlugin = () => {
  emit('switch-category', 'plugins')
}
</script>

<template>
  <div class="settings-section">
    <!-- 有插件数据时显示配置 -->
    <div v-if="hasPluginData" class="music-config-container">
      <div class="setting-group">
        <div class="plugin-info">
          <span class="plugin-name">当前插件: {{ currentPluginName }}</span>
          <span class="plugin-status">已启用</span>
        </div>
      </div>

      <div id="music-source" class="setting-group">
        <h3>音乐源选择</h3>
        <div class="source-cards">
          <div
            v-for="(source, key) in userInfo.supportedSources"
            :key="key"
            class="source-card"
            :class="{ active: userInfo.selectSources === key }"
            @click="selectSource(key as string)"
          >
            <div class="source-icon">
              <component :is="fonts[key]" style="font-size: 2em"></component>
            </div>
            <div class="source-info">
              <div class="source-name">{{ source.name }}</div>
              <div class="source-type">{{ source.type || '音乐源' }}</div>
            </div>
            <div v-if="userInfo.selectSources === key" class="source-check">
              <i class="iconfont icon-check"></i>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentSourceQualities.length > 0" id="music-quality" class="setting-group">
        <h3>音质选择</h3>
        <div class="quality-slider-container">
          <t-slider
            v-model="qualitySliderValue"
            :min="0"
            :max="currentSourceQualities.length - 1"
            :step="1"
            :marks="qualityMarks"
            :label="qualityMarks[qualitySliderValue]"
            class="quality-slider"
            @change="onQualityChange"
          />
        </div>
        <div class="quality-description">
          <p>
            当前选择:
            <strong>{{ getQualityDisplayName(userInfo.selectQuality || '') }}</strong>
          </p>
          <p class="quality-hint">
            {{ getQualityDescription(userInfo.selectQuality || '') }}
          </p>
        </div>
      </div>

      <div v-if="globalQualityOptions.length > 0" class="setting-group">
        <h3>全局音质（支持交集）</h3>
        <div class="quality-slider-container">
          <t-select
            v-model="globalQualitySelected"
            @change="(v) => applyGlobalQuality(v as string)"
          >
            <t-option
              v-for="q in globalQualityOptions"
              :key="q"
              :value="q"
              :label="getQualityDisplayName(q)"
            />
          </t-select>
        </div>
      </div>

      <div class="setting-group">
        <h3>配置状态</h3>
        <div class="config-status">
          <div class="status-item">
            <span class="status-label">音乐源:</span>
            <span class="status-value">{{ getCurrentSourceName() }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">音质:</span>
            <span class="status-value">{{
              getQualityDisplayName(userInfo.selectQuality || '')
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 未配置插件提示 -->
    <div v-else class="plugin-prompt">
      <div class="prompt-icon">
        <TreeRoundDotIcon />
      </div>
      <div class="prompt-content">
        <h4>未检测到插件配置</h4>
        <p>请先安装并选择一个音乐插件，然后返回此处配置音乐源和音质选项。</p>
        <t-button theme="primary" @click="goPlugin">
          <i class="iconfont icon-plugin"></i>
          前往插件管理
        </t-button>
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

.music-config-container {
  .plugin-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(135deg, var(--td-brand-color-1) 0%, var(--td-brand-color-2) 100%);
    border-radius: 0.75rem;
    border: 1px solid var(--td-brand-color-3);

    .plugin-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--td-brand-color-6);
    }

    .plugin-status {
      background: var(--td-brand-color-5);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      font-weight: 500;
    }
  }

  .source-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .source-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--settings-source-card-bg);
    border: 2px solid var(--settings-source-card-border);
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--settings-source-card-hover-border);
      box-shadow: 0 4px 6px -1px var(--settings-group-shadow);
    }

    &.active {
      border-color: var(--settings-source-card-active-border);
      background: var(--settings-source-card-active-bg);
      box-shadow: 0 0 0 3px var(--td-brand-color-2);
    }

    .source-icon {
      width: 2.5rem;
      height: 2.5rem;
      background: var(--settings-source-icon-bg);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--settings-text-secondary);
    }

    .source-info {
      flex: 1;

      .source-name {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--settings-text-primary);
        margin-bottom: 0.125rem;
      }

      .source-type {
        font-size: 0.75rem;
        color: var(--settings-text-secondary);
      }
    }

    .source-check {
      color: var(--td-brand-color-5);
      font-size: 1.125rem;
    }
  }

  .quality-slider-container {
    background: var(--settings-quality-container-bg);
    padding: 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid var(--settings-quality-container-border);

    .quality-slider {
      margin-bottom: 1rem;
    }
  }

  .quality-description {
    text-align: center;
    margin-top: 1rem;

    p {
      margin: 0.5rem 0;

      &:first-child {
        font-size: 1rem;
        font-weight: 600;
        color: var(--settings-text-primary);
      }

      &.quality-hint {
        font-size: 0.875rem;
        color: var(--settings-text-secondary);
      }
    }
  }

  .config-status {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;

    .status-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: var(--settings-status-item-bg);
      border-radius: 0.5rem;
      border: 1px solid var(--settings-status-item-border);

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
}

.plugin-prompt {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 2rem;
  background: var(--settings-plugin-prompt-bg);
  border-radius: 1rem;
  border: 2px dashed var(--settings-plugin-prompt-border);

  .prompt-icon {
    width: 3rem;
    height: 3rem;
    background: linear-gradient(135deg, var(--td-brand-color-5) 0%, var(--td-brand-color-6) 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: white;
    font-size: 1.5rem;
  }

  .prompt-content {
    flex: 1;

    h4 {
      color: var(--settings-text-primary);
      margin: 0 0 0.5rem 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    p {
      color: var(--settings-text-secondary);
      margin: 0 0 1.5rem 0;
      line-height: 1.5;
    }
  }
}

@media (max-width: 768px) {
  .music-config-container {
    .source-cards {
      grid-template-columns: 1fr;
    }

    .config-status {
      grid-template-columns: 1fr;
    }
  }

  .plugin-prompt {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
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
