<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import PlaylistSettings from '@renderer/components/Settings/PlaylistSettings.vue'
import { ref } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import { TreeRoundDotIcon } from 'tdesign-icons-vue-next'
import fonts from '@renderer/assets/icon_font/icons'

const Store = LocalUserDetailStore()
const { userInfo } = storeToRefs(Store)
// 当前选择的控制风格
const currentStyle = ref<'windows' | 'traffic-light'>(
  userInfo.value.topBarStyle ? 'traffic-light' : 'windows'
)

// DeepSeek API Key 配置
const deepseekAPIkey = ref<string>(userInfo.value.deepseekAPIkey || '')
const isEditingAPIKey = ref<boolean>(false)

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
import { useRouter } from 'vue-router'
import { computed, watch } from 'vue'
import MusicCache from '@renderer/components/Settings/MusicCache.vue'
import AIFloatBallSettings from '@renderer/components/Settings/AIFloatBallSettings.vue'
const router = useRouter()
const goPlugin = () => {
  router.push('/plugins')
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
  // 这里可以根据需要从插件信息中获取名称，暂时使用插件ID
  return userInfo.value.pluginId || '未知插件'
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
    marks[index] = getQualityDisplayName(quality)
  })
  return marks
})

// 监听当前选择的音质，更新滑块位置
watch(
  () => userInfo.value.selectQuality,
  (newQuality) => {
    if (newQuality && currentSourceQualities.value.length > 0) {
      const index = currentSourceQualities.value.indexOf(newQuality)
      if (index !== -1) {
        qualitySliderValue.value = index
      }
    }
  },
  { immediate: true }
)

// 选择音乐源
const selectSource = (sourceKey: string) => {
  if (!hasPluginData.value) return

  userInfo.value.selectSources = sourceKey

  // 自动选择该音源的最高音质
  const source = userInfo.value.supportedSources?.[sourceKey]
  if (source && source.qualitys && source.qualitys.length > 0) {
    userInfo.value.selectQuality = source.qualitys[source.qualitys.length - 1]
  }
}

// 音质滑块变化处理
const onQualityChange = (value: number) => {
  if (
    currentSourceQualities.value.length > 0 &&
    value >= 0 &&
    value < currentSourceQualities.value.length
  ) {
    userInfo.value.selectQuality = currentSourceQualities.value[value]
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
</script>

<template>
  <div class="main-container">
    <div class="header">
      <TitleBarControls title="设置" :show-back="true" />
    </div>
    <div class="settings-container">
      <div class="settings-content">
        <div class="settings-header">
          <h2>设置你的顶部控制栏</h2>
          <p>这里展示了两种不同风格的标题栏控制按钮</p>
        </div>

        <div class="demo-section">
          <h3>风格选择</h3>
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
        </div>

        <div class="demo-section">
          <h3>两种风格对比</h3>
          <div class="comparison-container">
            <div class="style-demo">
              <h4>Windows 风格</h4>
              <div class="mock-titlebar">
                <div class="mock-title">Windows 风格标题栏</div>
                <TitleBarControls control-style="windows" />
              </div>
            </div>

            <div class="style-demo">
              <h4>红绿灯风格 (macOS)</h4>
              <div class="mock-titlebar">
                <div class="mock-title">红绿灯风格标题栏</div>
                <TitleBarControls control-style="traffic-light" />
              </div>
            </div>
          </div>
        </div>
        <div class="demo-section">
          <h3>应用主题色</h3>
          <ThemeSelector />
        </div>
        <div class="demo-section">
          <h3>DeepSeek API 配置</h3>
          <div class="api-config-container">
            <div class="api-config-header">
              <p>配置您的 DeepSeek API Key 以使用 AI 功能</p>
            </div>

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
          <AIFloatBallSettings></AIFloatBallSettings>

        </div>

        <!-- 播放列表管理部分 -->
        <div class="demo-section">
          <h3>播放列表管理</h3>
          <PlaylistSettings />
          <!-- <PlaylistActions></PlaylistActions> -->
        </div>
        <!-- 插件管理部分 -->
        <div class="demo-section">
          <h3>插件管理</h3>
          <div class="plugin-management">
            <p>管理和配置应用插件，扩展音乐播放器功能</p>
            <t-button theme="primary" style="line-height: 1em" @click="goPlugin">
              <TreeRoundDotIcon style="margin-right: 0.2em" /> 打开插件管理
            </t-button>
          </div>
        </div>

        <!-- 音乐源和音质配置 -->
        <div v-if="hasPluginData" class="demo-section music-source-section">
          <h3>
            <i class="iconfont icon-music"></i>
            音乐源配置
          </h3>
          <div class="music-config-container">
            <div class="config-header">
              <div class="plugin-info">
                <span class="plugin-name">当前插件: {{ currentPluginName }}</span>
                <span class="plugin-status">已启用</span>
              </div>
            </div>

            <!-- 音乐源选择 -->
            <div class="source-selection">
              <h4>
                <i class="iconfont icon-source"></i>
                音乐源选择
              </h4>
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
                  <div class="source-check" v-if="userInfo.selectSources === key">
                    <i class="iconfont icon-check"></i>
                  </div>
                </div>
              </div>
            </div>

            <!-- 音质选择 -->
            <div class="quality-selection" v-if="currentSourceQualities.length > 0">
              <h4>
                <i class="iconfont icon-quality"></i>
                音质选择
              </h4>
              <div class="quality-slider-container">
                <!-- <div class="quality-labels">
                  <span
                    v-for="quality in currentSourceQualities"
                    :key="quality"
                    class="quality-label"
                    :class="{ active: userInfo.selectQuality === quality }"
                  >
                    {{ getQualityDisplayName(quality) }}
                  </span>
                </div> -->
                <t-slider
                  v-model="qualitySliderValue"
                  :min="0"
                  :max="currentSourceQualities.length - 1"
                  :step="1"
                  :marks="qualityMarks"
                  :label="qualityMarks[qualitySliderValue]"
                  @change="onQualityChange"
                  class="quality-slider"
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

            <!-- 配置状态 -->
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
        <div v-else class="demo-section plugin-prompt-section">
          <h3>
            <i class="iconfont icon-music"></i>
            音乐源配置
          </h3>
          <div class="plugin-prompt">
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
        <div class="demo-section">
          <div>
            <MusicCache></MusicCache>
          </div>
        </div>
        <div class="demo-section">
          <Versions></Versions>
        </div>

        <div class="demo-section">
          <h3>功能说明</h3>
          <div class="feature-list">
            <div class="feature-item">
              <i class="iconfont icon-shezhi"></i>
              <div>
                <strong>设置按钮</strong>
                <p>位于控制按钮最左侧，用于打开应用设置</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-dibu"></i>
              <div>
                <strong>Mini 模式</strong>
                <p>切换到迷你播放模式，节省桌面空间</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-zuixiaohua"></i>
              <div>
                <strong>最小化</strong>
                <p>将窗口最小化到任务栏</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-zengjia"></i>
              <div>
                <strong>最大化</strong>
                <p>切换窗口最大化/还原状态</p>
              </div>
            </div>

            <div class="feature-item">
              <i class="iconfont icon-a-quxiaoguanbi"></i>
              <div>
                <strong>关闭</strong>
                <p>关闭应用程序</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-container {
  height: 100vh;
  overflow: hidden;
}

.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background-color: #fff;
  padding: 1.5rem;
  position: sticky;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
}

.settings-container {
  width: 100%;
  padding: 2rem;
  overflow-y: scroll;
  max-height: 100vh;
}

.settings-content {
  max-width: 1100px;
  margin: 0 auto;
  background: #fff;
  padding: 2rem;
}

.settings-header {
  margin-bottom: 2rem;

  h2 {
    color: #111827;
    margin-bottom: 0.5rem;
  }

  p {
    color: #6b7280;
  }
}

.demo-section {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;

  h3 {
    color: #111827;
    margin-bottom: 1rem;
  }

  h4 {
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 1rem;
  }
}

.style-buttons {
  display: flex;
  gap: 1rem;
}

.preview-container,
.comparison-container {
  background: #f9fafb;
  padding: 1rem;
  border-radius: 0.375rem;
}

.comparison-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.style-demo {
  background: #fff;
  padding: 1rem;
  border-radius: 0.375rem;
  border: 1px solid #e5e7eb;
}

.mock-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 1rem;
  background: #f6f6f6;
  border-radius: 0.375rem;
  border: 1px solid #d1d5db;
}

.mock-title {
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.375rem;

  .iconfont {
    font-size: 1.25rem;
    color: var(--td-brand-color);
    margin-top: 0.125rem;
  }

  div {
    flex: 1;

    strong {
      display: block;
      color: #111827;
      margin-bottom: 0.25rem;
    }

    p {
      color: #6b7280;
      font-size: 0.875rem;
      margin: 0;
    }
  }
}

// DeepSeek API 配置样式
.api-config-container {
  .api-config-header {
    margin-bottom: 1.5rem;

    p {
      color: #6b7280;
      margin: 0;
    }
  }

  .api-key-section {
    .api-key-input-group {
      margin-bottom: 1rem;

      label {
        display: block;
        font-weight: 500;
        color: #374151;
        margin-bottom: 0.5rem;
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
            background-color: #10b981;
          }

          &.not-configured {
            background-color: #ef4444;
          }
        }

        .status-text {
          font-size: 0.875rem;
          color: #6b7280;
        }
      }
    }

    .api-key-tips {
      background: #f9fafb;
      padding: 1rem;
      border-radius: 0.375rem;
      border: 1px solid #e5e7eb;

      h4 {
        color: #374151;
        margin: 0 0 0.75rem 0;
        font-size: 0.875rem;
        font-weight: 600;
      }

      ul {
        margin: 0;
        padding-left: 1.25rem;

        li {
          color: #6b7280;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;

          &:last-child {
            margin-bottom: 0;
          }

          a {
            color: #3b82f6;
            text-decoration: none;

            &:hover {
              text-decoration: underline;
            }
          }
        }
      }
    }
  }
}

// 音乐源配置样式
.music-source-section {
  color: rgb(0, 0, 0);
  border: none;

  h3 {
    color: rgb(0, 0, 0);
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .iconfont {
      font-size: 1.25rem;
    }
  }
}

.music-config-container {
  .config-header {
    margin-bottom: 2rem;

    .plugin-info {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      backdrop-filter: blur(10px);

      .plugin-name {
        font-weight: 600;
        font-size: 1.1rem;
      }

      .plugin-status {
        background: var(--td-brand-color-5);
        color: var(--td-gray-color-1);
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        font-size: 0.875rem;
        font-weight: 500;
      }
    }
  }

  .source-selection,
  .quality-selection {
    margin-bottom: 2rem;

    h4 {
      color: rgb(0, 0, 0);
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.1rem;

      .iconfont {
        font-size: 1.125rem;
      }
    }
  }

  .source-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .source-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid transparent;
    border-radius: 0.75rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);

    &:hover {
      background: rgba(255, 255, 255, 0.15);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    }

    &.active {
      background: rgba(255, 255, 255, 0.2);
      border-color: var(--td-brand-color-5);
      box-shadow: 0 0 20px var(--td-gray-color-6);
    }

    .source-icon {
      width: 3rem;
      height: 3rem;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;

      .iconfont {
        font-size: 1.5rem;
        color: white;
      }
    }

    .source-info {
      flex: 1;

      .source-name {
        font-weight: 600;
        font-size: 1rem;
        margin-bottom: 0.25rem;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      .source-type {
        font-size: 0.875rem;
        opacity: 0.8;
      }
    }

    .source-check {
      .iconfont {
        font-size: 1.25rem;
        color: #10b981;
      }
    }
  }

  .quality-slider-container {
    background: rgba(255, 255, 255, 0.1);
    padding: 1.5rem;
    border-radius: 0.75rem;
    backdrop-filter: blur(10px);

    .quality-labels {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1rem;

      .quality-label {
        font-size: 0.875rem;
        opacity: 0.7;
        transition: all 0.3s ease;

        &.active {
          opacity: 1;
          font-weight: 600;
          color: #10b981;
        }
      }
    }

    .quality-slider {
      margin-bottom: 1rem;

      :deep(.t-slider__track) {
        background: rgba(255, 255, 255, 0.2);
      }

      :deep(.t-slider__track-active) {
        background: linear-gradient(90deg, var(--td-brand-color-5), var(--td-brand-color-6));
      }

      :deep(.t-slider__button) {
        background: white;
        border: 3px solid var(--td-brand-color-5);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
    }
  }

  .quality-description {
    text-align: center;
    margin-top: 1rem;

    p {
      margin: 0.5rem 0;

      &:first-child {
        font-size: 1.1rem;
        font-weight: 600;
      }

      &.quality-hint {
        font-size: 0.875rem;
        opacity: 0.8;
      }
    }
  }

  .config-status {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 2rem;

    .status-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 0.5rem;
      backdrop-filter: blur(10px);

      .status-label {
        font-weight: 500;
        opacity: 0.8;
      }

      .status-value {
        font-weight: 600;
        color: var(--td-brand-color-6);
      }
    }
  }
}

// 插件提示样式
.plugin-prompt-section {
  h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    .iconfont {
      font-size: 1.25rem;
      color: #6b7280;
    }
  }
}

.plugin-prompt {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 2rem;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
  border-radius: 1rem;
  border: 2px dashed #d1d5db;

  .prompt-icon {
    font-size: 2rem;
    width: 4rem;
    color: #3b82f6;
    height: 4rem;
    background: linear-gradient(135deg, #000000 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .iconfont {
      font-size: 2rem;
      color: white;
    }
  }

  .prompt-content {
    flex: 1;

    h4 {
      color: #111827;
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
    }

    p {
      color: #6b7280;
      margin: 0 0 1.5rem 0;
      line-height: 1.6;
    }
  }
}

// 响应式设计
// @media (max-width: 768px) {
//   .music-config-container {
//     .source-cards {
//       grid-template-columns: 1fr;
//     }

//     .config-status {
//       grid-template-columns: 1fr;
//     }
//   }

//   .plugin-prompt {
//     flex-direction: column;
//     text-align: center;
//     gap: 1.5rem;
//   }
// }

// 动画效果
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

.music-source-section,
.plugin-prompt-section {
  animation: fadeInUp 0.6s ease-out;
}

.source-card {
  animation: fadeInUp 0.6s ease-out;
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
</style>
