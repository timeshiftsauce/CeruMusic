<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import AIFloatBallSettings from '@renderer/components/Settings/AIFloatBallSettings.vue'
import type { AIProvider, AIConfig } from '@renderer/types/userInfo'

const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)

const providers: Array<{ value: AIProvider; label: string }> = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'siliconflow', label: '硅基流动' },
  { value: 'custom', label: '自定义' }
]

const defaultConfigs: Record<AIProvider, { baseURL: string; model: string }> = {
  deepseek: { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  siliconflow: { baseURL: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  custom: { baseURL: '', model: '' }
}

// 初始化 aiConfig（兼容旧版 deepseekAPIkey）
const initAIConfig = (): AIConfig => {
  const existing = userInfo.value.aiConfig
  if (existing?.provider) {
    return { ...existing }
  }
  // 兼容旧版配置
  if (userInfo.value.deepseekAPIkey) {
    return {
      provider: 'deepseek',
      apiKey: userInfo.value.deepseekAPIkey,
      baseURL: defaultConfigs.deepseek.baseURL,
      model: defaultConfigs.deepseek.model
    }
  }
  return { provider: 'deepseek', apiKey: '', baseURL: '', model: '' }
}

const aiConfig = ref<AIConfig>(initAIConfig())
const isEditing = ref<boolean>(false)

const selectedProvider = computed<AIProvider>({
  get: () => aiConfig.value.provider || 'deepseek',
  set: (val: AIProvider) => {
    aiConfig.value.provider = val
    const defaults = defaultConfigs[val]
    aiConfig.value.baseURL = defaults.baseURL
    aiConfig.value.model = defaults.model
  }
})

const isCustom = computed(() => selectedProvider.value === 'custom')

const isConfigured = computed(() => {
  const cfg = userInfo.value.aiConfig
  if (!cfg?.apiKey) return false
  if (cfg.provider === 'custom' && (!cfg.baseURL || !cfg.model)) return false
  return true
})

const providerLabel = computed(() => {
  return providers.find((p) => p.value === userInfo.value.aiConfig?.provider)?.label || '未配置'
})

const saveConfig = (): void => {
  const cfg: AIConfig = {
    provider: aiConfig.value.provider,
    apiKey: aiConfig.value.apiKey?.trim() || '',
    baseURL: aiConfig.value.baseURL?.trim() || '',
    model: aiConfig.value.model?.trim() || ''
  }
  userInfo.value.aiConfig = cfg
  isEditing.value = false
}

const startEdit = (): void => {
  aiConfig.value = initAIConfig()
  isEditing.value = true
}

const cancelEdit = (): void => {
  aiConfig.value = initAIConfig()
  isEditing.value = false
}

const clearConfig = (): void => {
  aiConfig.value = { provider: 'deepseek', apiKey: '', baseURL: '', model: '' }
  userInfo.value.aiConfig = { provider: 'deepseek', apiKey: '', baseURL: '', model: '' }
  isEditing.value = false
}

// 监听外部变化
watch(
  () => userInfo.value.aiConfig,
  (newVal) => {
    if (newVal && !isEditing.value) {
      aiConfig.value = { ...newVal }
    }
  },
  { deep: true }
)
</script>

<template>
  <div class="settings-section">
    <div id="ai-api-config" class="setting-group">
      <h3>AI 服务配置</h3>
      <p>配置您的 AI 服务以使用 AI 助手功能</p>

      <div class="api-key-section">
        <!-- 查看模式 -->
        <div v-if="!isEditing" class="config-display">
          <div class="config-item">
            <span class="config-label">服务商：</span>
            <span class="config-value">{{ providerLabel }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">API Key：</span>
            <span class="config-value">{{ isConfigured ? '已配置' : '未配置' }}</span>
          </div>
          <div v-if="userInfo.aiConfig?.model" class="config-item">
            <span class="config-label">模型：</span>
            <span class="config-value">{{ userInfo.aiConfig.model }}</span>
          </div>
          <div class="config-actions">
            <t-button theme="primary" @click="startEdit">
              {{ isConfigured ? '编辑' : '配置' }}
            </t-button>
            <t-button v-if="isConfigured" theme="danger" @click="clearConfig"> 清空 </t-button>
          </div>
        </div>

        <!-- 编辑模式 -->
        <div v-else class="config-edit">
          <div class="input-group">
            <label>服务商：</label>
            <t-select v-model="selectedProvider" :options="providers" />
          </div>

          <div class="input-group">
            <label for="ai-api-key">API Key：</label>
            <t-input
              id="ai-api-key"
              v-model="aiConfig.apiKey"
              type="password"
              placeholder="请输入 API Key"
            />
          </div>

          <div v-if="isCustom" class="input-group">
            <label for="ai-base-url">Base URL：</label>
            <t-input
              id="ai-base-url"
              v-model="aiConfig.baseURL"
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div class="input-group">
            <label for="ai-model">模型：</label>
            <t-input
              id="ai-model"
              v-model="aiConfig.model"
              :placeholder="defaultConfigs[selectedProvider].model"
            />
          </div>

          <div class="input-actions">
            <t-button theme="primary" @click="saveConfig">保存</t-button>
            <t-button theme="default" @click="cancelEdit">取消</t-button>
          </div>
        </div>

        <div class="api-key-status">
          <div class="status-indicator">
            <span :class="['status-dot', isConfigured ? 'configured' : 'not-configured']"></span>
            <span class="status-text">
              {{ isConfigured ? 'AI 服务已配置' : 'AI 服务未配置' }}
            </span>
          </div>
        </div>

        <div class="api-key-tips">
          <h4>使用说明：</h4>
          <ul>
            <li>支持 DeepSeek、OpenAI、硅基流动及自定义 OpenAI 兼容接口</li>
            <li>API Key 将安全存储在本地，不会上传到服务器</li>
            <li>配置后即可使用 AI 助手功能</li>
          </ul>
        </div>
      </div>
    </div>

    <div id="ai-floatball" class="setting-group">
      <h3>AI 浮球设置</h3>
      <AIFloatBallSettings />
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

  &:nth-child(1) {
    animation-delay: 0.1s;
  }

  &:nth-child(2) {
    animation-delay: 0.2s;
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

.api-key-section {
  .config-display {
    margin-bottom: 1rem;

    .config-item {
      display: flex;
      align-items: center;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;

      .config-label {
        font-weight: 600;
        color: var(--settings-text-primary);
        min-width: 80px;
      }

      .config-value {
        color: var(--settings-text-secondary);
      }
    }

    .config-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }
  }

  .config-edit {
    margin-bottom: 1rem;

    .input-group {
      margin-bottom: 1rem;

      label {
        display: block;
        font-weight: 600;
        color: var(--settings-text-primary);
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
      }

      .t-input,
      .t-select {
        width: 100%;
      }
    }

    .input-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
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
      }
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
