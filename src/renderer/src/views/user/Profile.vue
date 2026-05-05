<template>
  <div class="profile-container">
    <div class="profile-content">
      <div class="header">
        <h1>编辑个人信息</h1>
      </div>

      <t-form ref="form" :data="formData" reset-type="initial" colon @submit="handleSave">
        <div class="form-container">
          <div class="left-form">
            <t-form-item label="昵称" name="name">
              <t-input v-model="formData.name" placeholder="请输入昵称" />
            </t-form-item>

            <t-form-item label="简介" name="intro">
              <t-textarea
                v-model="formData.intro"
                placeholder="请输入个人简介"
                :maxlength="300"
                :autosize="{ minRows: 5, maxRows: 10 }"
              />
            </t-form-item>

            <t-form-item label="性别" name="gender">
              <t-radio-group v-model="formData.gender">
                <t-radio value="male">男</t-radio>
                <t-radio value="female">女</t-radio>
                <t-radio value="secret">保密</t-radio>
              </t-radio-group>
            </t-form-item>

            <t-form-item label="生日" name="birthday">
              <t-date-picker v-model="formData.birthday" placeholder="选择日期" />
            </t-form-item>

            <t-form-item label="地区" name="region">
              <t-input
                v-model="formData.region"
                placeholder="请输入所在地区 (例如: 福建省 厦门市)"
              />
            </t-form-item>

            <t-form-item>
              <t-space size="small">
                <t-button theme="primary" type="submit" :loading="loading">保存</t-button>
                <t-button theme="default" variant="base" @click="handleCancel">取消</t-button>
              </t-space>
            </t-form-item>
          </div>

          <div class="right-avatar">
            <t-form-item label="头像" name="avatar" label-width="0">
              <div class="avatar-column">
                <div class="avatar-wrapper" @click="handleAvatarClick">
                  <img
                    :src="userAvatar"
                    alt="用户头像"
                    class="avatar-image"
                    style="
                      width: 140px;
                      height: 140px;
                      border-radius: 10000px;
                      aspect-ratio: 1/1;
                      padding: 0;
                      margin: 0;
                    "
                  />
                  <div class="avatar-overlay">
                    <div class="replace-text">替换图片</div>
                  </div>
                </div>
                <!-- 隐藏的文件输入框 -->
                <input
                  ref="fileInput"
                  type="file"
                  accept="image/*"
                  style="display: none"
                  @change="handleFileSelect"
                />
              </div>
            </t-form-item>
          </div>
        </div>
      </t-form>

      <section class="security-section">
        <div class="security-header">
          <h2>账号安全</h2>
          <p class="security-hint">
            以下设置会在系统默认浏览器中跳转到澜音认证服务器（{{
              logtoEndpointHost
            }}）完成，操作过程中你的密码与设备凭据不会经过本应用。
          </p>
        </div>

        <div v-for="group in securityGroups" :key="group.title" class="security-group">
          <div class="security-group-title">{{ group.title }}</div>
          <div class="security-rows">
            <button
              v-for="item in group.items"
              :key="item.path"
              type="button"
              class="security-row"
              @click="openAccountFlow(item)"
            >
              <div class="row-main">
                <div class="row-label">{{ item.label }}</div>
                <div class="row-sub">{{ resolveSub(item) }}</div>
              </div>
              <span class="row-arrow" aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@renderer/store/Auth'
import { MessagePlugin } from 'tdesign-vue-next'
import defaultAvatar from '@renderer/assets/user.webp'
import displayName from '@renderer/utils/auth/displayName'
import logtoConfig from '@renderer/config'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const avatarUploading = ref(false)
const fileInput = ref<HTMLInputElement>()

const formData = reactive({
  name: '',
  intro: '',
  gender: 'secret',
  birthday: '',
  region: ''
})

const userAvatar = computed(() => {
  return authStore.user?.picture || defaultAvatar
})

interface SecurityItem {
  label: string
  path: string
  identifierFrom?: 'email' | 'phone' | 'username'
  fallbackSub?: string
}
interface SecurityGroup {
  title: string
  items: SecurityItem[]
}

const logtoEndpoint = (logtoConfig.endpoint || '').replace(/\/$/, '')
const logtoEndpointHost = computed(() => {
  try {
    return new URL(logtoConfig.endpoint || 'https://').host
  } catch {
    return logtoConfig.endpoint || ''
  }
})

const securityGroups: SecurityGroup[] = [
  {
    title: '基本身份',
    items: [
      {
        label: '邮箱',
        path: '/account/email',
        identifierFrom: 'email',
        fallbackSub: '绑定或修改登录邮箱'
      },
      {
        label: '手机号',
        path: '/account/phone',
        identifierFrom: 'phone',
        fallbackSub: '绑定或修改登录手机号'
      },
      {
        label: '用户名',
        path: '/account/username',
        identifierFrom: 'username',
        fallbackSub: '设置或修改登录用户名'
      },
      {
        label: '密码',
        path: '/account/password',
        fallbackSub: '设置或修改登录密码'
      }
    ]
  },
  {
    title: '通行密钥（Passkey）',
    items: [
      {
        label: '添加 Passkey',
        path: '/account/passkey/add',
        fallbackSub: '使用指纹、Face ID 或安全密钥登录'
      },
      {
        label: '管理 Passkey',
        path: '/account/passkey/manage',
        fallbackSub: '查看、重命名或移除已绑定的 Passkey'
      }
    ]
  },
  {
    title: '两步验证',
    items: [
      {
        label: '绑定验证器 App',
        path: '/account/authenticator-app',
        fallbackSub: '使用 Google Authenticator 等 TOTP 应用'
      },
      {
        label: '更换验证器 App',
        path: '/account/authenticator-app/replace',
        fallbackSub: '更换或重新绑定验证器'
      },
      {
        label: '生成备份码',
        path: '/account/backup-codes/generate',
        fallbackSub: '当无法使用验证器时用于登录'
      },
      {
        label: '管理备份码',
        path: '/account/backup-codes/manage',
        fallbackSub: '查看剩余可用的备份码'
      }
    ]
  }
]

function resolveIdentifier(item: SecurityItem): string {
  const u: any = authStore.user
  if (!u || !item.identifierFrom) return ''
  switch (item.identifierFrom) {
    case 'email':
      return u.email || ''
    case 'phone':
      return u.phone_number || ''
    case 'username':
      return u.username || ''
    default:
      return ''
  }
}

function resolveSub(item: SecurityItem): string {
  const id = resolveIdentifier(item)
  return id || item.fallbackSub || ''
}

function openAccountFlow(item: SecurityItem) {
  if (!logtoEndpoint) {
    MessagePlugin.error('未配置认证服务器地址')
    return
  }
  const url = new URL(logtoEndpoint + item.path)
  url.searchParams.set('ui_locales', 'zh-CN')
  url.searchParams.set('show_success', 'true')
  const id = resolveIdentifier(item)
  if (id) url.searchParams.set('identifier', id)
  window.open(url.toString())
}

onActivated(() => {
  if (authStore.user) {
    formData.name = displayName(authStore.user)
    // 假设 custom_data 中存储了这些扩展信息
    const customData = (authStore.user.custom_data as any) || {}
    formData.intro = customData.intro || ''
    formData.gender = customData.gender || 'secret'
    formData.birthday = customData.birthday || ''
    formData.region = customData.region || ''
  }
})

const handleAvatarClick = () => {
  fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    MessagePlugin.error('请选择图片文件')
    return
  }

  // 验证文件大小（3MB）
  if (file.size > 3 * 1024 * 1024) {
    MessagePlugin.error('图片大小不能超过3MB')
    return
  }

  // 验证图片安全内容（鉴黄）
  try {
    MessagePlugin.loading({ content: '正在检测图片安全...', duration: 0 })
    const { checkImageIsSafe } = await import('@renderer/utils/nsfwCheck')
    const isSafe = await checkImageIsSafe(file)
    MessagePlugin.closeAll()

    if (!isSafe) {
      MessagePlugin.error('图片包含违规内容，请更换其他图片')
      return
    }
  } catch (error: any) {
    MessagePlugin.closeAll()
    console.error('NSFW Check Error:', error)
    MessagePlugin.error('图片安全检测失败，请检查网络或稍后重试')
    return
  }

  try {
    avatarUploading.value = true
    await authStore.uploadAvatar(file)
    MessagePlugin.success('头像上传成功')
  } catch (error: any) {
    console.error('头像上传失败:', error)
    MessagePlugin.error(error.message || '头像上传失败')
  } finally {
    avatarUploading.value = false
    // 清空文件输入框
    target.value = ''
  }
}

const handleSave = async (context: any) => {
  const { validateResult, firstError } = context
  if (validateResult === true) {
    loading.value = true
    try {
      // 调用 store 的 updateProfile 方法更新用户信息
      await authStore.updateProfile(formData)

      MessagePlugin.success('保存成功')
      router.back()
    } catch (error) {
      MessagePlugin.error('保存失败')
      console.error(error)
    } finally {
      loading.value = false
    }
  } else {
    console.log('Errors: ', validateResult)
    MessagePlugin.warning(firstError)
  }
}

const handleCancel = () => {
  router.back()
}
</script>

<style scoped lang="scss">
.profile-container {
  height: 100%;
  display: flex;
  justify-content: center;
  flex-direction: column;
  background-color: transparent;
  color: var(--td-text-color-primary, #000);
}

.profile-content {
  flex: 1;
  padding: 2rem 4rem;
  overflow-y: auto;
  container-type: inline-size;

  .header {
    margin-bottom: 2rem;
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }
  }
}

.form-container {
  display: flex;
  gap: 4rem;
  width: 100%;
  // justify-content: center;
  .left-form {
    flex: 1;
    max-width: 1000px;
  }

  .right-avatar {
    width: 400px;
    padding-top: 1rem;

    .avatar-column {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .avatar-wrapper {
      position: relative;
      display: inline-block;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 140px;
      height: 140px;

      &:hover {
        transform: scale(1.05);

        .avatar-overlay {
          opacity: 1;
        }
      }

      .avatar-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        aspect-ratio: 1/1;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
        border-radius: 50%;
        z-index: 10;

        .replace-text {
          color: white;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }
      }

      :deep(.t-avatar) {
        border-radius: 50% !important;
        overflow: hidden;
        display: block;
      }
    }
  }
}

@container (max-width: 700px) {
  .form-container {
    flex-direction: column !important;
    gap: 1.5rem;
    align-items: center;

    .right-avatar {
      width: 100%;
      padding-top: 0;
      order: -1;
      display: flex;
      justify-content: center;
    }

    .left-form {
      width: 100%;
      max-width: 100%;
    }
  }
}

.security-section {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.08));
}

.security-header {
  margin-bottom: 1.25rem;

  h2 {
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--td-text-color-primary);
    margin: 0 0 6px;
  }
}

.security-hint {
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.55));
  margin: 0;
}

.security-group {
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }
}

.security-group-title {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.55));
  margin: 0 0 8px;
  padding-left: 4px;
  text-transform: uppercase;
}

.security-rows {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.08));
  background: var(--td-bg-color-container, transparent);
}

.security-row {
  appearance: none;
  border: none;
  background: transparent;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  color: inherit;
  border-bottom: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.06));
  transition: background-color 0.18s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--td-bg-color-container-hover, rgba(0, 0, 0, 0.04));
  }

  &:active {
    background: var(--td-bg-color-container-active, rgba(0, 0, 0, 0.06));
  }
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  line-height: 1.4;
}

.row-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.55));
  line-height: 1.5;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-arrow {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--td-text-color-placeholder, rgba(0, 0, 0, 0.35));
  transition: transform 0.2s ease;
}

.security-row:hover .row-arrow {
  transform: translate(2px, -2px);
  color: var(--td-brand-color, #006eff);
}
</style>
