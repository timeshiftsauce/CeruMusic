<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

type ProxyMode = 'direct' | 'system' | 'custom'
type ProxyProtocol = 'http' | 'socks5'

interface ProxyForm {
  mode: ProxyMode
  protocol: ProxyProtocol
  host: string
  port: string
  username: string
  password: string
}

const form = reactive<ProxyForm>({
  mode: 'direct',
  protocol: 'http',
  host: '',
  port: '',
  username: '',
  password: ''
})

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
// 信任系统证书（Node 侧 TLS，兼容抓包代理）
const trustSystemCa = ref(false)
const caSupported = ref(true)
const trusting = ref(false)

// 下拉框的组合值：direct / system / custom:http / custom:socks5
const typeValue = computed<string>({
  get: () => (form.mode === 'custom' ? `custom:${form.protocol}` : form.mode),
  set: (value: string) => {
    if (value === 'system') {
      form.mode = 'system'
      return
    }
    if (value === 'direct') {
      form.mode = 'direct'
      return
    }
    form.mode = 'custom'
    form.protocol = value === 'custom:socks5' ? 'socks5' : 'http'
  }
})

const isCustom = computed(() => form.mode === 'custom')

const typeOptions = [
  { value: 'direct', label: '不使用代理（默认）' },
  { value: 'system', label: '使用系统代理' },
  { value: 'custom:http', label: 'HTTP 代理' },
  { value: 'custom:socks5', label: 'SOCKS5 代理' }
]

const fillForm = (cfg: Partial<ProxyForm>): void => {
  if (!cfg) return
  form.mode = cfg.mode === 'system' || cfg.mode === 'custom' ? cfg.mode : 'direct'
  form.protocol = cfg.protocol === 'socks5' ? 'socks5' : 'http'
  form.host = String(cfg.host ?? '')
  form.port = String(cfg.port ?? '')
  form.username = String(cfg.username ?? '')
  form.password = String(cfg.password ?? '')
}

onMounted(async () => {
  try {
    const cfg = await window.api?.settings?.getNetworkProxy?.()
    if (cfg) fillForm(cfg)
  } catch (error) {
    console.warn('读取网络代理配置失败:', error)
  } finally {
    loading.value = false
  }
  void loadTrustSystemCa()
})

const testProxy = async (): Promise<void> => {
  testing.value = true
  try {
    const result = await window.api.settings.testNetworkProxy({ ...form })
    if (result?.ok) {
      MessagePlugin.success(
        `${result.message}${result.elapsedMs ? `（耗时 ${result.elapsedMs}ms）` : ''}`
      )
    } else {
      MessagePlugin.error(result?.message || '连接测试失败')
    }
  } catch (error) {
    MessagePlugin.error(`连接测试失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    testing.value = false
  }
}

const saveProxy = async (): Promise<void> => {
  saving.value = true
  try {
    const result = await window.api.settings.setNetworkProxy({ ...form })
    if (result?.success) {
      fillForm(result.config)
      MessagePlugin.success('代理设置已保存，立即生效')
    } else {
      MessagePlugin.error(result?.error || '保存失败')
    }
  } catch (error) {
    MessagePlugin.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    saving.value = false
  }
}

const loadTrustSystemCa = async (): Promise<void> => {
  try {
    const info = await window.api?.settings?.getTrustSystemCertificates?.()
    if (info) {
      trustSystemCa.value = !!info.enabled
      caSupported.value = info.supported !== false
    }
  } catch (error) {
    console.warn('读取系统证书信任设置失败:', error)
  }
}

const onTrustSystemCaChange = async (value: boolean | string | number): Promise<void> => {
  const enabled = value === true
  trusting.value = true
  try {
    const result = await window.api.settings.setTrustSystemCertificates(enabled)
    if (!result?.success || result.applied === false) {
      trustSystemCa.value = !enabled
      if (result && result.applied === false) caSupported.value = false
      MessagePlugin.error('当前运行环境不支持“信任系统证书”')
    } else {
      MessagePlugin.success(
        enabled
          ? '已开启：Node 侧请求将信任系统证书库（对已建立的连接除外）'
          : '已关闭：Node 侧请求恢复仅信任内置证书'
      )
    }
  } catch (error) {
    trustSystemCa.value = !enabled
    MessagePlugin.error(`应用失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    trusting.value = false
  }
}
</script>

<template>
  <div class="settings-section">
    <t-card title="网络代理" class="setting-card" hover-shadow>
      <div id="network-proxy" class="setting-group-item">
        <div class="setting-label">
          <h4>代理模式</h4>
          <p>
            控制音频播放、封面图片等网络请求是否经过代理。默认不使用代理（直连），
            可避免系统代理（如网络加速器）导致部分歌曲或封面概率性加载失败。
          </p>
        </div>

        <div class="proxy-form">
          <div class="form-row">
            <span class="form-label">代理类型</span>
            <t-select
              v-model="typeValue"
              :options="typeOptions"
              class="form-control"
              :disabled="loading"
            />
          </div>

          <template v-if="isCustom && !loading">
            <div class="form-row">
              <span class="form-label">代理地址</span>
              <t-input v-model="form.host" class="form-control" placeholder="例如 127.0.0.1" />
            </div>
            <div class="form-row">
              <span class="form-label">端口</span>
              <t-input v-model="form.port" class="form-control" placeholder="例如 7890" />
            </div>
            <div class="form-row">
              <span class="form-label">用户名（可选）</span>
              <t-input v-model="form.username" class="form-control" placeholder="代理认证用户名" />
            </div>
            <div class="form-row">
              <span class="form-label">密码（可选）</span>
              <t-input
                v-model="form.password"
                class="form-control"
                type="password"
                placeholder="代理认证密码"
              />
            </div>
          </template>

          <div class="form-actions">
            <t-button theme="default" :loading="testing" :disabled="loading" @click="testProxy">
              测试
            </t-button>
            <t-button theme="primary" :loading="saving" :disabled="loading" @click="saveProxy">
              保存代理
            </t-button>
          </div>

          <p class="form-hint">
            保存后立即生效（已建立的连接除外）。所有网络请求都会遵循此设置：
            音频播放、封面图片、音源插件接口、缓存下载与软件更新。
          </p>
        </div>
      </div>

      <!-- 信任系统证书：Node 侧 TLS 兼容抓包代理 -->
      <div id="network-trust-ca" class="setting-group-item trust-ca-item">
        <div class="setting-label">
          <h4>信任系统证书</h4>
          <p>
            让音源插件、下载与更新等请求（Node 侧）信任 Windows 系统证书库中的根证书，
            用于兼容 Reqable / Charles 等抓包工具或企业代理的 HTTPS 解密。默认关闭。
          </p>
        </div>

        <div class="trust-ca-row">
          <t-switch
            v-model="trustSystemCa"
            :loading="trusting"
            :disabled="loading || !caSupported"
            @change="onTrustSystemCaChange"
          />
          <span class="trust-ca-state">{{ trustSystemCa ? '已开启' : '未开启（默认）' }}</span>
        </div>

        <div v-if="trustSystemCa" class="risk-alert">
          ⚠️ 风险提示：开启后，系统证书库中的全部根证书都会被信任。若你安装过抓包工具
          （Reqable、Charles、Fiddler 等）或公司代理的证书，其签发的“中间人”证书也将被信任，
          途经应用的网络流量存在被解密的风险。仅在代理抓包导致插件请求报「证书验证失败」时才建议开启。
        </div>
        <p v-if="!caSupported" class="form-hint unsupported-hint">
          当前运行环境不支持该能力（需要 Node 22.15+），开关已禁用。
        </p>
      </div>
    </t-card>
  </div>
</template>

<style lang="scss" scoped>
.settings-section {
  animation: fadeInUp 0.4s ease-out;
  animation-fill-mode: both;
}

.setting-group-item {
  margin-bottom: 12px;
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
    line-height: 1.6;
    color: var(--td-text-color-placeholder);
  }
}

.proxy-form {
  max-width: 420px;

  .form-row {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;

    .form-label {
      flex-shrink: 0;
      width: 110px;
      font-size: 13px;
      color: var(--td-text-color-secondary);
    }

    .form-control {
      flex: 1;
      min-width: 0;
    }
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-top: 18px;
  }

  .form-hint {
    margin: 12px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--td-text-color-placeholder);
  }
}

.trust-ca-item {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.06));

  .trust-ca-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .trust-ca-state {
    font-size: 13px;
    color: var(--td-text-color-secondary);
  }

  .risk-alert {
    margin-top: 12px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.7;
    color: #b25e09;
    background: rgba(237, 158, 14, 0.12);
    border: 1px solid rgba(237, 158, 14, 0.35);
    border-radius: 6px;
  }

  .unsupported-hint {
    color: var(--td-error-color, #d54941);
  }
}
</style>
