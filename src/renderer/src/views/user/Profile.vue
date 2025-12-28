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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onActivated, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@renderer/store/Auth'
import { MessagePlugin } from 'tdesign-vue-next'
import defaultAvatar from '@renderer/assets/user.webp'

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

onActivated(() => {
  if (authStore.user) {
    const { name, username, custom_data } = authStore.user
    formData.name = name || username || ''
    // 假设 custom_data 中存储了这些扩展信息
    const customData = (custom_data as any) || {}
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
  color: var(--text-color-primary, #000);
}

.profile-content {
  flex: 1;
  padding: 2rem 4rem;
  overflow-y: auto;

  .header {
    margin-bottom: 2rem;
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--text-color-primary);
    }
  }
}

.form-container {
  display: flex;
  gap: 4rem;
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
</style>
