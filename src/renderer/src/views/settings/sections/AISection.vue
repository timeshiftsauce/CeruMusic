<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import AIFloatBallSettings from '@renderer/components/Settings/AIFloatBallSettings.vue'

const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)

// DeepSeek API Key Configuration
const deepseekAPIkey = ref<string>(userInfo.value.deepseekAPIkey || '')
const isEditingAPIKey = ref<boolean>(false)

const saveAPIKey = (): void => {
  userInfo.value.deepseekAPIkey = deepseekAPIkey.value.trim()
  isEditingAPIKey.value = false
  console.log('DeepSeek API Key 已保存')
}

const startEditAPIKey = (): void => {
  isEditingAPIKey.value = true
}

const cancelEditAPIKey = (): void => {
  deepseekAPIkey.value = userInfo.value.deepseekAPIkey || ''
  isEditingAPIKey.value = false
}

const clearAPIKey = (): void => {
  deepseekAPIkey.value = ''
  userInfo.value.deepseekAPIkey = ''
  isEditingAPIKey.value = false
  console.log('DeepSeek API Key 已清空')
}
</script>

<template>
  <div class="settings-section">
    <div id="ai-api-config" class="setting-group">
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
              :placeholder="isEditingAPIKey ? '请输入您的 DeepSeek API Key' : '未配置 API Key'"
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
              :class="['status-dot', userInfo.deepseekAPIkey ? 'configured' : 'not-configured']"
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

        .t-button {
          transition: all 0.2s ease;
          &:hover {
            transform: translateY(-1px);
          }
        }
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
