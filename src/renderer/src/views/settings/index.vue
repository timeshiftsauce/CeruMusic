<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import PlaylistSettings from '@renderer/components/Settings/PlaylistSettings.vue'
import { ref, computed, watch } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import {
  TreeRoundDotIcon,
  PaletteIcon,
  ApiIcon,
  MusicIcon,
  InfoCircleIcon,
  PlayCircleIcon,
  SaveIcon
} from 'tdesign-icons-vue-next'
import fonts from '@renderer/assets/icon_font/icons'
import DirectorySettings from '@renderer/components/Settings/DirectorySettings.vue'
import MusicCache from '@renderer/components/Settings/MusicCache.vue'
import AIFloatBallSettings from '@renderer/components/Settings/AIFloatBallSettings.vue'
import ThemeSelector from '@renderer/components/ThemeSelector.vue'
import DesktopLyricStyle from '@renderer/components/Settings/DesktopLyricStyle.vue'
import Versions from '@renderer/components/Versions.vue'
import { useAutoUpdate } from '@renderer/composables/useAutoUpdate'
import { playSetting as usePlaySetting } from '@renderer/store/playSetting'
import { useSettingsStore } from '@renderer/store/Settings'
const Store = LocalUserDetailStore()
const { userInfo } = storeToRefs(Store)

// 设置存储
const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const playSettingStore = usePlaySetting()
const { isJumpLyric, bgPlaying, isAudioVisualizer } = storeToRefs(playSettingStore)

// 当前选择的设置分类
const activeCategory = ref<string>('appearance')
// 应用版本号
const appVersion = ref('1.0.0')

// 组件引用
const musicCacheRef = ref()
const directorySettingsRef = ref()

// 处理目录更改事件
const handleDirectoryChanged = () => {
  console.log('目录已更改，刷新缓存信息')
  if (musicCacheRef.value?.refreshCacheInfo) {
    musicCacheRef.value.refreshCacheInfo()
  }
}

// 处理缓存清除事件
const handleCacheCleared = () => {
  console.log('缓存已清除，刷新目录大小')
  if (directorySettingsRef.value?.refreshDirectorySizes) {
    directorySettingsRef.value.refreshDirectorySizes()
  }
}

// 获取应用版本号
const getAppVersion = async () => {
  try {
    const version = await window.electron.ipcRenderer.invoke('get-app-version')
    if (version) {
      appVersion.value = version
    }
  } catch (error) {
    console.warn('Failed to get app version via IPC:', error)
  }
}

// 初始化时获取版本号
getAppVersion()

// 自动更新功能
const { checkForUpdates } = useAutoUpdate()

// 检查更新状态
const isCheckingUpdate = ref(false)

// 检查更新函数
const handleCheckUpdate = async () => {
  isCheckingUpdate.value = true
  try {
    await checkForUpdates()
  } catch (error) {
    console.error('检查更新失败:', error)
  } finally {
    isCheckingUpdate.value = false
  }
}

// 设置分类配置
const settingsCategories = [
  {
    key: 'appearance',
    label: '外观设置',
    icon: PaletteIcon,
    description: '主题、标题栏风格等外观配置'
  },
  {
    key: 'ai',
    label: 'AI 功能',
    icon: ApiIcon,
    description: 'DeepSeek API 配置和 AI 相关功能'
  },
  {
    key: 'playlist',
    label: '播放设置',
    icon: PlayCircleIcon,
    description: '播放列表，歌词管理和相关设置'
  },
  {
    key: 'plugins',
    label: '插件管理',
    icon: TreeRoundDotIcon,
    description: '插件安装、配置和管理'
  },
  {
    key: 'music',
    label: '音乐源',
    icon: MusicIcon,
    description: '音乐源选择和音质配置'
  },
  {
    key: 'storage',
    label: '存储管理',
    icon: SaveIcon,
    description: '缓存管理和存储设置'
  },
  {
    key: 'about',
    label: '关于',
    icon: InfoCircleIcon,
    description: '版本信息和功能说明'
  }
]

// 当前选择的控制风格
const currentStyle = ref<'windows' | 'traffic-light'>(
  userInfo.value.topBarStyle ? 'traffic-light' : 'windows'
)

// DeepSeek API Key 配置
const deepseekAPIkey = ref<string>(userInfo.value.deepseekAPIkey || '')
const isEditingAPIKey = ref<boolean>(false)

// 切换设置分类
const switchCategory = (categoryKey: string): void => {
  activeCategory.value = categoryKey
}

// 切换风格
const switchStyle = (style: 'windows' | 'traffic-light'): void => {
  currentStyle.value = style
  console.log(`设置成 ${style} 风格 ${style === 'windows'}`)
  userInfo.value.topBarStyle = style === 'traffic-light' ? true : false
}

// 保存 DeepSeek API Key
const saveAPIKey = (): void => {
  userInfo.value.deepseekAPIkey = deepseekAPIkey.value.trim()
  isEditingAPIKey.value = false
  console.log('DeepSeek API Key 已保存')
}

// 开始编辑 API Key
const startEditAPIKey = (): void => {
  isEditingAPIKey.value = true
}

// 取消编辑 API Key
const cancelEditAPIKey = (): void => {
  deepseekAPIkey.value = userInfo.value.deepseekAPIkey || ''
  isEditingAPIKey.value = false
}

// 清空 API Key
const clearAPIKey = (): void => {
  deepseekAPIkey.value = ''
  userInfo.value.deepseekAPIkey = ''
  isEditingAPIKey.value = false
  console.log('DeepSeek API Key 已清空')
}

const goPlugin = () => {
  switchCategory('plugins')
}

// 音乐源和音质配置相关
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

// 监听当前选择的音质，更新滑块位置
watch(
  [() => userInfo.value.selectQuality, () => currentSourceQualities.value],
  ([newQuality, qualities]) => {
    if (qualities.length > 0 && newQuality) {
      // 检查当前选择的音质是否在新平台的支持列表中
      const index = qualities.indexOf(newQuality)
      if (index !== -1) {
        qualitySliderValue.value = index
      } else {
        // 如果当前音质不在支持列表中，选择默认音质
        console.log('当前音质不在支持列表中，选择默认音质')
        // 选择最高音质
        userInfo.value.selectQuality = qualities[qualities.length - 1]
      }
    }
  },
  { immediate: true }
)

// 选择音乐源
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

// 音质滑块变化处理
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

// 获取音质显示名称
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

// 获取音质描述
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

// 获取当前音源名称
const getCurrentSourceName = () => {
  if (!hasPluginData.value || !userInfo.value.selectSources) return '未选择'
  const source = userInfo.value.supportedSources?.[userInfo.value.selectSources]
  return source?.name || userInfo.value.selectSources
}

// 打开外部链接
const openLink = (url: string) => {
  window.open(url, '_blank')
}

// 标签写入选项
const tagWriteOptions = ref({
  basicInfo: settings.value.tagWriteOptions?.basicInfo ?? true,
  cover: settings.value.tagWriteOptions?.cover ?? true,
  lyrics: settings.value.tagWriteOptions?.lyrics ?? true
})

// 更新标签写入选项
const updateTagWriteOptions = () => {
  settingsStore.updateSettings({
    tagWriteOptions: { ...tagWriteOptions.value }
  })
}

// 获取标签选项状态描述
const getTagOptionsStatus = () => {
  const enabled: string[] = []
  if (tagWriteOptions.value.basicInfo) enabled.push('基础信息')
  if (tagWriteOptions.value.cover) enabled.push('封面')
  if (tagWriteOptions.value.lyrics) enabled.push('歌词')

  return enabled.length > 0 ? enabled.join('、') : '未选择任何选项'
}
</script>

<template>
  <div class="main-container">
    <!-- 标题栏 -->
    <div class="header">
      <TitleBarControls title="设置" :show-back="true" />
    </div>

    <!-- 主要内容区域 -->
    <div class="settings-layout">
      <!-- 左侧导航栏 -->
      <div class="sidebar">
        <nav class="sidebar-nav">
          <div
            v-for="category in settingsCategories"
            :key="category.key"
            class="nav-item"
            :class="{ active: activeCategory === category.key }"
            @click="switchCategory(category.key)"
          >
            <div class="nav-icon">
              <component :is="category.icon" />
            </div>
            <div class="nav-content">
              <div class="nav-label">{{ category.label }}</div>
              <div class="nav-description">{{ category.description }}</div>
            </div>
          </div>
        </nav>
      </div>

      <!-- 右侧内容面板 -->
      <div class="content-panel">
        <div class="panel-content">
          <!-- 设置内容区域 -->
          <transition name="fade-slide" mode="out-in">
            <!-- 外观设置 -->
            <div v-if="activeCategory === 'appearance'" key="appearance" class="settings-section">
              <div class="setting-group">
                <h3>标题栏风格</h3>
                <p>选择您喜欢的标题栏控制按钮风格</p>

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

              <div class="setting-group">
                <h3>应用主题色</h3>
                <ThemeSelector />
              </div>

              <div class="setting-group">
                <DesktopLyricStyle />
              </div>
            </div>

            <!-- AI 功能设置 -->
            <div v-else-if="activeCategory === 'ai'" key="ai" class="settings-section">
              <div class="setting-group">
                <h3>DeepSeek API 配置</h3>
                <p>配置您的 DeepSeek API Key 以使用 AI 功能</p>

                <div class="api-key-section">
                  <div class="api-key-input-group">
                    <label for="deepseek-api-key">API Key:</label>
                    <div class="input-container">
                      <t-input
                        id="deepseek-api-key"
                        v-model="deepseekAPIkey"
                        :type="isEditingAPIKey ? 'text' : 'password'"
                        :readonly="!isEditingAPIKey"
                        :placeholder="
                          isEditingAPIKey ? '请输入您的 DeepSeek API Key' : '未配置 API Key'
                        "
                        class="api-key-input"
                      />
                      <div class="input-actions">
                        <t-button v-if="!isEditingAPIKey" theme="primary" @click="startEditAPIKey">
                          {{ userInfo.deepseekAPIkey ? '编辑' : '配置' }}
                        </t-button>
                        <template v-else>
                          <t-button theme="primary" @click="saveAPIKey"> 保存 </t-button>
                          <t-button theme="default" @click="cancelEditAPIKey"> 取消 </t-button>
                          <t-button theme="danger" @click="clearAPIKey"> 清空 </t-button>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="api-key-status">
                    <div class="status-indicator">
                      <span
                        :class="[
                          'status-dot',
                          userInfo.deepseekAPIkey ? 'configured' : 'not-configured'
                        ]"
                      ></span>
                      <span class="status-text">
                        {{ userInfo.deepseekAPIkey ? 'API Key 已配置' : 'API Key 未配置' }}
                      </span>
                    </div>
                  </div>

                  <div class="api-key-tips">
                    <h4>使用说明：</h4>
                    <ul>
                      <li>
                        请前往
                        <a href="https://platform.deepseek.com/" target="_blank">DeepSeek 官网</a>
                        获取您的 API Key
                      </li>
                      <li>API Key 将安全存储在本地，不会上传到服务器</li>
                      <li>配置后即可使用 AI 相关功能</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="setting-group">
                <h3>AI 浮球设置</h3>
                <AIFloatBallSettings />
              </div>
            </div>

            <!-- 播放设置 -->
            <div v-else-if="activeCategory === 'playlist'" key="playlist" class="settings-section">
              <div class="setting-group">
                <h3>播放列表管理</h3>
                <PlaylistSettings />
              </div>

              <!-- 播放显示 -->
              <div class="setting-group">
                <h3>全屏播放-性能优化</h3>

                <div class="setting-item">
                  <div class="item-info">
                    <div class="item-title">跳动歌词</div>
                    <div class="item-desc">使用弹簧引擎效果跳动歌词、占用更高的性能</div>
                  </div>
                  <t-switch
                    v-model="isJumpLyric"
                    @change="playSettingStore.setIsDumpLyric(isJumpLyric)"
                  />
                </div>

                <div class="setting-item">
                  <div class="item-info">
                    <div class="item-title">背景动画</div>
                    <div class="item-desc">启用布朗运动背景动画、占用更高的性能</div>
                  </div>
                  <t-switch
                    v-model="bgPlaying"
                    @change="playSettingStore.setBgPlaying(bgPlaying)"
                  />
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

            <!-- 插件管理 -->
            <div v-else-if="activeCategory === 'plugins'" key="plugins" class="settings-section">
              <!-- <div class="setting-group">
                <h3>插件管理</h3>
                <p>管理和配置应用插件，扩展音乐播放器功能</p>
                <t-button theme="primary" @click="goPlugin">
                  <TreeRoundDotIcon style="margin-right: 0.5em" />
                  打开插件管理
                </t-button>
              </div> -->
              <plugins />
            </div>

            <!-- 音乐源配置 -->
            <div v-else-if="activeCategory === 'music'" key="music" class="settings-section">
              <!-- 有插件数据时显示配置 -->
              <div v-if="hasPluginData" class="music-config-container">
                <div class="setting-group">
                  <div class="plugin-info">
                    <span class="plugin-name">当前插件: {{ currentPluginName }}</span>
                    <span class="plugin-status">已启用</span>
                  </div>
                </div>

                <div class="setting-group">
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

                <div v-if="currentSourceQualities.length > 0" class="setting-group">
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

            <!-- 存储管理 -->
            <div v-else-if="activeCategory === 'storage'" key="storage" class="settings-section">
              <DirectorySettings
                ref="directorySettingsRef"
                class="setting-group"
                @directory-changed="handleDirectoryChanged"
                @cache-cleared="handleCacheCleared"
              />
              <div style="margin-top: 20px" class="setting-group">
                <MusicCache ref="musicCacheRef" @cache-cleared="handleCacheCleared" />
              </div>

              <!-- 缓存策略 -->
              <div class="setting-group">
                <h3>缓存策略</h3>
                <div class="setting-item">
                  <div class="item-info">
                    <div class="item-title">自动缓存音乐</div>
                    <div class="item-desc">播放时自动读取/写入缓存，加速后续播放</div>
                  </div>
                  <t-switch
                    v-model="settings.autoCacheMusic"
                    @change="
                      settingsStore.updateSettings({ autoCacheMusic: settings.autoCacheMusic })
                    "
                  />
                </div>
              </div>

              <!-- 标签写入设置 -->
              <div class="setting-group">
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
                      普通歌词
                    </t-checkbox>
                    <p class="option-desc">将歌词信息写入到音频文件的标签中</p>
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

            <!-- 关于页面 -->
            <div v-else-if="activeCategory === 'about'" key="about" class="settings-section">
              <!-- 应用信息 -->
              <div class="setting-group">
                <div class="app-header">
                  <div class="app-logo">
                    <img src="/logo.svg" alt="Ceru Music" />
                  </div>
                  <div class="app-info">
                    <div class="app-title-row">
                      <h2>Cerulearn Music</h2>
                      <span class="app-version">v{{ appVersion }}</span>
                    </div>
                    <p class="app-subtitle">澜音 播放器</p>
                    <p class="app-description">
                      澜音是一个跨平台的音乐播放器应用，支持基于合规插件获取公开音乐信息与播放功能。
                    </p>
                  </div>
                </div>
              </div>

              <!-- 版本信息 -->
              <div class="setting-group">
                <h3>版本信息</h3>
                <div class="version-section">
                  <Versions />
                  <div class="update-actions">
                    <t-button
                      theme="primary"
                      :loading="isCheckingUpdate"
                      @click="handleCheckUpdate"
                    >
                      {{ isCheckingUpdate ? '检查中...' : '检查更新' }}
                    </t-button>
                  </div>
                </div>
              </div>

              <!-- 技术栈 -->
              <div class="setting-group">
                <h3>技术栈&服务&友商</h3>
                <div class="tech-stack">
                  <div class="tech-item">
                    <span class="tech-name">Electron</span>
                    <span class="tech-desc">跨平台桌面应用框架</span>
                  </div>
                  <div class="tech-item">
                    <span class="tech-name">Vue 3</span>
                    <span class="tech-desc">响应式前端框架</span>
                  </div>
                  <div class="tech-item">
                    <span class="tech-name">TypeScript</span>
                    <span class="tech-desc">类型安全的 JavaScript</span>
                  </div>
                  <div class="tech-item">
                    <span class="tech-name">Pinia</span>
                    <span class="tech-desc">Vue 状态管理工具</span>
                  </div>
                  <div class="tech-item">
                    <span class="tech-name">Vite</span>
                    <span class="tech-desc">快速前端构建工具</span>
                  </div>
                  <div
                    class="tech-item link"
                    style="cursor: pointer"
                    @click="openLink('https://sadidc.com/aff/VQAXGBZT')"
                  >
                    <span class="tech-name">伤心的云</span>
                    <span class="tech-desc"
                      >🔗 强烈推荐 服务器低至一元 1000mbps超高带宽,16h16g 38.99元/月
                    </span>
                  </div>
                  <div
                    class="tech-item link"
                    style="cursor: pointer"
                    @click="openLink('https://www.rainyun.com/sqj_')"
                  >
                    <span class="tech-name">雨云</span>
                    <span class="tech-desc"
                      >🔗 提供的性价比云服务支持，新人半价起，服务器低至7.5元</span
                    >
                  </div>
                </div>
              </div>

              <!-- 开发团队 -->
              <div class="setting-group">
                <h3>开发团队</h3>
                <div class="developer-list">
                  <div class="developer-item" @click="openLink('https://shiqianjiang.cn/')">
                    <div class="developer-avatar">
                      <img src="/head.jpg" alt="时迁酱" />
                    </div>
                    <div class="developer-info">
                      <h4>时迁酱</h4>
                      <p>产品总体设计与开发</p>
                    </div>
                  </div>
                  <div class="developer-item">
                    <div class="developer-avatar">
                      <img src="/wldss.png" alt="无聊的霜霜" />
                    </div>
                    <div class="developer-info">
                      <h4>无聊的霜霜</h4>
                      <p>首页设计 & AI助手</p>
                    </div>
                  </div>
                  <div class="developer-item">
                    <div class="developer-avatar">
                      <img src="/star.png" alt="Star" />
                    </div>
                    <div class="developer-info">
                      <h4>Star</h4>
                      <p>插件管理相关功能 & 部分接口封装</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 开源许可 -->
              <div class="setting-group">
                <h3>开源许可</h3>
                <div class="license-info">
                  <p>
                    本项目源代码遵循 <strong>Apache License 2.0</strong> 开源协议，
                    仅授权用户对项目框架进行学习、修改与二次开发，不包含任何音乐数据相关授权。
                  </p>
                  <div class="license-actions">
                    <t-button
                      theme="default"
                      @click="openLink('https://github.com/timeshiftsauce/CeruMusic')"
                    >
                      <i class="iconfont icon-github"></i>
                      查看源码
                    </t-button>
                    <t-button
                      theme="default"
                      @click="
                        openLink('https://github.com/timeshiftsauce/CeruMusic/blob/main/LICENSE')
                      "
                    >
                      <i class="iconfont icon-license"></i>
                      许可协议
                    </t-button>
                  </div>
                </div>
              </div>

              <!-- 法律声明 -->
              <div class="setting-group">
                <h3>法律声明</h3>
                <div class="legal-notice">
                  <div class="notice-item">
                    <h4>🔒 数据与内容责任</h4>
                    <p>
                      本项目不直接获取、存储、传输任何音乐数据或版权内容，仅提供插件运行框架。
                      用户通过插件获取的所有数据，其合法性由插件提供者及用户自行负责。
                    </p>
                  </div>
                  <div class="notice-item">
                    <h4>⚖️ 版权合规要求</h4>
                    <p>
                      用户承诺仅通过合规插件获取音乐相关信息，且获取、使用版权内容的行为符合
                      《中华人民共和国著作权法》及相关法律法规，不侵犯任何第三方合法权益。
                    </p>
                  </div>
                  <div class="notice-item">
                    <h4>🚫 使用限制</h4>
                    <p>
                      本项目仅允许用于非商业、纯技术学习目的，禁止用于任何商业运营、盈利活动，
                      禁止修改后用于侵犯第三方权益的场景。
                    </p>
                  </div>
                </div>
                <h3 style="margin-top: 2rem">关于我们</h3>
                <div class="legal-notice">
                  <div class="notice-item">
                    <h4>😊 时迁酱</h4>
                    <p>
                      你好呀好呀～我是 (时迁酱)
                      <br />
                      一枚普普通通的高中生，因为好奇+喜欢，悄悄自学了一点编程✨！
                      <br />
                      <br />
                      没想到今天你能用上我做的软件——「澜音」，它其实是我学 Electron
                      时孵出来的小demo！
                      <br />
                      看到它真的能运行、还有人愿意用，我真的超级开心＋骄傲的！💖
                      <br />
                      <br />
                      当然啦，平时还是要乖乖写作业上课哒～但我还是会继续挤出时间，让澜音慢慢长大，越走越远哒！💪
                      <br />
                      <br />
                      如果你也喜欢它，或者想给我加点零食鼓励🧋，欢迎打赏赞助哟～谢谢可爱的你！！
                      <img
                        src="https://oss.shiqianjiang.cn/storage/default/20250907/image-2025082711173bb1bba3608ef15d0e1fb485f80f29c728186.png"
                        alt="赞赏"
                        style="width: 100%; padding: 20px 30%"
                      />
                      什么你也想学习编程？我教你吖！QQ:2115295703
                    </p>
                    <br />
                    <h4>...待补充</h4>
                  </div>
                </div>
              </div>

              <!-- 联系方式 -->
              <div class="setting-group">
                <h3>联系方式</h3>
                <div class="contact-info">
                  <p>如有技术问题或合作意向（仅限技术交流），请通过以下方式联系：</p>
                  <div class="contact-actions">
                    <t-button theme="primary" @click="openLink('https://qm.qq.com/q/8c25dPfylG')">
                      官方QQ群(1057783951)
                    </t-button>
                    <t-button
                      theme="primary"
                      variant="outline"
                      @click="openLink('https://ceru.docs.shiqianjiang.cn/')"
                    >
                      官方网站
                    </t-button>
                    <t-button
                      theme="default"
                      @click="openLink('https://github.com/timeshiftsauce/CeruMusic/issues')"
                    >
                      问题反馈
                    </t-button>
                  </div>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--settings-main-bg);
}

.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background: var(--settings-header-bg);
  padding: 1.5rem;
  // border-bottom: 1px solid var(--settings-sidebar-border);
  // box-shadow: 0 1px 3px var(--settings-group-shadow);
  z-index: 1000;
}

.settings-layout {
  // margin: 0px 6px;

  display: flex;
  flex: 1;
  overflow: hidden;
}

// 左侧导航栏
.sidebar {
  width: 280px;
  background: var(--settings-sidebar-bg);
  // border-right: 1px solid var(--settings-sidebar-border);
  padding-right: 5px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-left: 5px;
  .sidebar-header {
    // padding: 1.5rem;
    border-bottom: 1px solid var(--settings-sidebar-border);

    h3 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--settings-text-primary);
    }
  }

  .sidebar-nav {
    flex: 1;
    // padding: 1rem 0;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    margin-top: 5px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-left: 3px solid transparent;

    &:hover {
      background: var(--settings-nav-hover-bg);
    }

    &.active {
      background: var(--settings-nav-active-bg);
      border-left-color: var(--settings-nav-active-border);

      .nav-icon {
        color: var(--settings-nav-icon-active);
      }

      .nav-label {
        color: var(--settings-nav-label-active);
        font-weight: 600;
      }
    }

    .nav-icon {
      width: 20px;
      height: 20px;
      color: var(--settings-nav-icon-color);
      display: flex;
      justify-content: center;
      align-items: center;

      svg {
        width: 100%;
        height: 100%;
      }

      transition: color 0.2s ease;
    }

    .nav-content {
      flex: 1;
      min-width: 0;

      .nav-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--settings-nav-label-color);
        margin-bottom: 0.125rem;
        transition: color 0.2s ease;
      }

      .nav-description {
        font-size: 0.75rem;
        color: var(--settings-nav-desc-color);
        line-height: 1.3;
      }
    }
  }
}

// 右侧内容面板
.content-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 10px;

  .panel-header {
    padding: 2rem 2rem 1rem;
    background: var(--settings-header-bg);
    border-bottom: 1px solid var(--settings-sidebar-border);

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--settings-text-primary);
    }

    p {
      margin: 0;
      color: var(--settings-text-secondary);
      font-size: 0.875rem;
    }
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    // padding: 2rem;
    background: var(--settings-main-bg);
  }
}

// 设置区域
.settings-section {
  .setting-group {
    background: var(--settings-group-bg);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--settings-group-border);
    box-shadow: 0 1px 3px var(--settings-group-shadow);

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
}

// 样式按钮
.style-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

// 样式预览
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

// 功能列表
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  .feature-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--settings-feature-bg);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-feature-border);

    .iconfont {
      font-size: 1.125rem;
      color: var(--td-brand-color-5);
      margin-top: 0.125rem;
    }

    div {
      flex: 1;

      strong {
        display: block;
        color: var(--settings-text-primary);
        margin-bottom: 0.25rem;
        font-weight: 600;
      }

      p {
        color: var(--settings-text-secondary);
        font-size: 0.875rem;
        margin: 0;
        line-height: 1.4;
      }
    }
  }
}

// API 配置样式
.api-key-section {
  .api-key-input-group {
    margin-bottom: 1rem;

    label {
      display: block;
      font-weight: 600;
      color: var(--settings-text-primary);
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }

    .input-container {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;

      .api-key-input {
        flex: 1;
      }

      .input-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
      }
    }
  }

  .api-key-status {
    margin-bottom: 1.5rem;

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;

        &.configured {
          background-color: var(--td-brand-color-5);
        }

        &.not-configured {
          background-color: var(--td-error-color);
        }
      }

      .status-text {
        font-size: 0.875rem;
        color: var(--settings-text-secondary);
      }
    }
  }

  .api-key-tips {
    background: var(--settings-api-tips-bg);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--settings-api-tips-border);

    h4 {
      color: var(--settings-text-primary);
      margin: 0 0 0.75rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    ul {
      margin: 0;
      padding-left: 1.25rem;

      li {
        color: var(--settings-text-secondary);
        font-size: 0.875rem;
        margin-bottom: 0.5rem;

        &:last-child {
          margin-bottom: 0;
        }

        a {
          color: var(--td-brand-color-5);
          text-decoration: none;

          &:hover {
            text-decoration: underline;
          }
        }
      }
    }
  }
}

// 音乐源配置样式
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

// 插件提示样式
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

// 底部信息区域
.footer-info {
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  padding: 1rem 2rem;

  .footer-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 1200px;
    margin: 0 auto;

    .app-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .app-name {
        font-weight: 700;
        color: #1e293b;
        font-size: 1rem;
      }

      .app-version {
        background: #f1f5f9;
        color: #64748b;
        padding: 0.125rem 0.5rem;
        border-radius: 0.375rem;
        font-size: 0.75rem;
        font-weight: 500;
      }
    }

    .developer-info {
      color: #64748b;
      font-size: 0.875rem;
    }

    .copyright {
      color: #94a3b8;
      font-size: 0.75rem;
    }
  }
}

// 响应式设计
@media (max-width: 1024px) {
  .settings-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid #e2e8f0;

    .sidebar-nav {
      display: flex;
      overflow-x: auto;
      padding: 0.5rem;

      .nav-item {
        flex-shrink: 0;
        min-width: 200px;
        border-left: none;
        border-bottom: 3px solid transparent;

        &.active {
          border-left: none;
          border-bottom-color: #3b82f6;
        }
      }
    }
  }

  .footer-info .footer-content {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }
}

@media (max-width: 768px) {
  .style-preview {
    grid-template-columns: 1fr;
  }

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

// 过渡动画效果
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.fade-slide-enter-to,
.fade-slide-leave-from {
  opacity: 1;
  transform: translateX(0);
}

// 导航项悬停动画
.nav-item {
  border-radius: 5px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  // &:hover {
  //   transform: translateX(4px);
  // }
}

// 设置组动画
.setting-group {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;

  &:nth-child(1) {
    animation-delay: 0.1s;
  }

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.3s;
  }

  &:nth-child(4) {
    animation-delay: 0.4s;
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

// 音乐源卡片动画
.source-card {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);
  }
}

// 按钮动画
.style-buttons .t-button,
.input-actions .t-button {
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }
}

// 功能列表项动画
.feature-item {
  transition: all 0.2s ease;

  &:hover {
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

// 关于页面样式
.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 0;

  .app-logo {
    width: 4rem;
    height: 4rem;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .app-info {
    flex: 1;

    .app-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.25rem;

      h2 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--settings-text-primary);
      }

      .app-version {
        background: var(--td-brand-color-1);
        color: var(--td-brand-color-6);
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        border: 1px solid var(--td-brand-color-3);
      }
    }

    .app-subtitle {
      margin: 0 0 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      color: var(--td-brand-color-5);
    }

    .app-description {
      margin: 0;
      color: var(--settings-text-secondary);
      line-height: 1.5;
    }
  }
}

.tech-stack {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 0.75rem;

  .tech-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--settings-tech-item-bg);
    border-radius: 0.5rem;
    border: 1px solid var(--settings-tech-item-border);
    transition: 0.3s;
    gap: 1rem;

    .tech-name {
      font-weight: 600;
      flex-shrink: 0;
      color: var(--settings-text-primary);
    }

    .tech-desc {
      font-size: 0.875rem;
      color: var(--settings-text-secondary);
    }

    &.link:hover {
      background-color: var(--td-brand-color-1);
      border: 1px solid var(--td-brand-color-5);
    }

    &.link:active {
      transform: scale(0.9);
    }
  }
}

.developer-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  cursor: pointer;

  .developer-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--settings-developer-item-bg);
    border-radius: 0.75rem;
    border: 1px solid var(--settings-developer-item-border);
    transition: all 0.2s ease;

    &:hover {
      box-shadow: 0 4px 6px -1px var(--settings-group-shadow);
    }

    .developer-avatar {
      width: 3rem;
      height: 3rem;
      border-radius: 50%;
      overflow: hidden;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .developer-info {
      flex: 1;

      h4 {
        margin: 0 0 0.25rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--settings-text-primary);
      }

      p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--settings-text-secondary);
      }
    }
  }
}

.license-info {
  p {
    margin: 0 0 1rem;
    color: var(--settings-text-secondary);
    line-height: 1.5;
  }

  .license-actions {
    display: flex;
    gap: 0.75rem;
  }
}

.legal-notice {
  .notice-item {
    margin-bottom: 1.5rem;

    &:last-child {
      margin-bottom: 0;
    }

    h4 {
      margin: 0 0 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--settings-text-primary);
    }

    p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--settings-text-secondary);
      line-height: 1.5;
    }
  }
}

// 版本信息样式
.version-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: relative;

  .update-actions {
    text-align: center;
  }
}

.contact-info {
  p {
    margin: 0 0 1rem;
    color: #64748b;
    line-height: 1.5;
  }

  .contact-actions {
    display: flex;
    gap: 0.75rem;
  }
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
}

.tag-options-status {
  background: var(--settings-tag-status-bg);
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--settings-tag-status-border);

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

// 响应式适配
@media (max-width: 768px) {
  .app-header {
    flex-direction: column;
    text-align: center;
    gap: 1rem;
  }

  .tech-stack {
    grid-template-columns: 1fr;
  }

  .developer-list {
    grid-template-columns: 1fr;
  }

  .license-actions,
  .contact-actions {
    flex-direction: column;
  }
}

.sidebar,
.panel-content {
  // Webkit 浏览器
  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: transparent;
  }

  // Firefox
  scrollbar-width: none;

  // IE/Edge
  -ms-overflow-style: none;
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
</style>
