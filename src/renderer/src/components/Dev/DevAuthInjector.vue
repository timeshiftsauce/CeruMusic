<script setup lang="ts">
/**
 * 开发期登录回调注入器 —— 仅在 dev 模式可见
 *
 * 解决问题：本地装了生产版 CeruMusic 时，cerumusic:// deeplink 会被生产版抢走，
 * 导致 dev:second 实例（用于一起听等多人功能调试）收不到 OAuth 回调。
 *
 * 工作流：
 *   1. 在第二实例正常点"登录"按钮，浏览器跳到 Logto
 *   2. 登录账号 B 完成后，浏览器尝试跳 cerumusic://callback?code=xxx&state=yyy
 *   3. 由于协议被生产版接管，浏览器要么打开生产版要么报错
 *      —— 关键：这个 URL 在浏览器**地址栏 / 重定向历史里能看到**
 *   4. 复制完整的 cerumusic://callback?... URL
 *   5. 粘贴到本组件输入框 → 调 auth.handleCallback(url) → 第二实例直接登录态
 *
 * 仅 dev 模式渲染（NODE_ENV !== 'development' 时不挂载任何 DOM）。
 * 生产构建时 import.meta.env.DEV 是 false，整个组件树会被 tree-shake 掉。
 */
import { ref, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { CodeIcon, CloseIcon } from 'tdesign-icons-vue-next'
import { useAuthStore } from '@renderer/store'

const auth = useAuthStore()

/** 仅 dev 显示 —— Vite 注入 import.meta.env.DEV，生产构建为 false */
const isDev = computed(() => import.meta.env.DEV)

/** 浮窗展开状态 */
const expanded = ref(false)

/** 用户粘贴的 callback URL */
const callbackUrl = ref('')

/** 提交中防重 */
const submitting = ref(false)

/** 输入有效性：必须以 cerumusic://callback 开头且包含 code 参数 */
const isValid = computed(() => {
  const u = callbackUrl.value.trim()
  if (!u.startsWith('cerumusic://')) return false
  // logto callback 必带 code 或 error 参数
  return /[?&](code|error)=/.test(u)
})

/* 自动从剪贴板检测 cerumusic:// URL —— 用户复制后打开浮窗就自动填上 */
async function detectFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard?.readText()
    if (!text) return
    const m = text.match(/cerumusic:\/\/[^\s]+/)
    if (m && !callbackUrl.value) {
      callbackUrl.value = m[0]
    }
  } catch {
    // 剪贴板读取失败（无权限）静默忽略
  }
}

function toggle(): void {
  expanded.value = !expanded.value
  if (expanded.value) void detectFromClipboard()
}

async function submit(): Promise<void> {
  if (!isValid.value || submitting.value) return
  submitting.value = true
  try {
    await auth.handleCallback(callbackUrl.value.trim())
    callbackUrl.value = ''
    expanded.value = false
    MessagePlugin.success('已注入登录回调，请等待登录态刷新')
  } catch (e: any) {
    console.error('[dev] handleCallback failed', e)
    MessagePlugin.error(e?.message || '注入失败，URL 可能已过期，请重新登录')
  } finally {
    submitting.value = false
  }
}

function paste(): void {
  void navigator.clipboard
    ?.readText()
    .then((t) => {
      if (t) callbackUrl.value = t.trim()
    })
    .catch(() => MessagePlugin.warning('剪贴板权限被拒绝，请手动粘贴'))
}
</script>

<template>
  <div v-if="isDev" class="dev-auth-injector" :class="{ expanded }">
    <button
      v-if="!expanded"
      class="trigger"
      title="Dev：注入登录回调（仅开发模式可见）"
      @click="toggle"
    >
      <CodeIcon size="16" />
      <span>Dev Auth</span>
    </button>

    <div v-else class="panel">
      <header>
        <span class="title">Dev: 注入登录回调</span>
        <button class="close" @click="toggle"><CloseIcon size="14" /></button>
      </header>

      <p class="hint">
        粘贴浏览器中拦截到的
        <code>cerumusic://callback?code=...</code>
        URL，这里直接调 <code>handleSignInCallback</code> 完成登录，绕开协议处理器全局注册问题。
      </p>

      <t-textarea
        v-model="callbackUrl"
        :autosize="{ minRows: 3, maxRows: 6 }"
        placeholder="cerumusic://callback?code=...&state=..."
      />

      <div class="actions">
        <t-button size="small" variant="outline" @click="paste">从剪贴板粘贴</t-button>
        <t-button
          size="small"
          theme="primary"
          :disabled="!isValid"
          :loading="submitting"
          @click="submit"
        >
          注入登录
        </t-button>
      </div>

      <p class="hint sub">
        当前用户状态：{{ auth.isAuthenticated ? '已登录' : '未登录' }}
      </p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dev-auth-injector {
  position: fixed;
  right: 16px;
  bottom: 96px; /* 避开 PlayMusic 底栏 */
  z-index: 999;
  font-size: 12px;
  user-select: none;
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  background: rgba(255, 100, 60, 0.85);
  color: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 100, 60, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(255, 100, 60, 0.45);
  }
}

.panel {
  width: 340px;
  background: var(--td-bg-color-container, #fff);
  border: 1px solid rgba(255, 100, 60, 0.4);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    .title {
      font-weight: 600;
      color: rgb(255, 100, 60);
    }
    .close {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--td-text-color-secondary);
      padding: 4px;
      border-radius: 4px;

      &:hover {
        background: rgba(0, 0, 0, 0.06);
      }
    }
  }

  .hint {
    margin: 0 0 8px;
    color: var(--td-text-color-secondary);
    line-height: 1.5;

    code {
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.05);
      font-size: 11px;
    }

    &.sub {
      margin-top: 8px;
      margin-bottom: 0;
      font-size: 11px;
      opacity: 0.7;
    }
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 8px;
  }
}
</style>
