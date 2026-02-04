import { defineStore } from 'pinia'
import { ref } from 'vue'
import LogtoClient, { UserInfoResponse } from '@logto/browser'
import { MessagePlugin } from 'tdesign-vue-next'
import { defaultRequest, Request } from '@renderer/utils/request'
import config from '../config'
import router from '@renderer/router'

const { redirectUri, postLogoutRedirectUri } = config
const ceruRequest = new Request('https://api.ceru.shiqianjiang.cn/api')

export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<UserInfoResponse | null>(null)
    const isAuthenticated = ref(false)
    const loading = ref(false)

    const logtoClient = config.instance as LogtoClient

    const init = async () => {
      try {
        loading.value = true
        await updateUserInfo()
      } catch (error: any) {
        console.error('Failed to init auth:', error)
        if (error.cause.status >= 400 && error.cause.status < 500) {
          MessagePlugin.error('登录过期，请重新登录')
          outlogin()
        } else {
          MessagePlugin.error('初始化认证失败')
        }
      } finally {
        loading.value = false
      }
    }

    const login = async () => {
      try {
        await logtoClient.signIn(redirectUri)
      } catch (error) {
        console.error('Sign in failed:', error)
      }
    }

    const logout = async () => {
      try {
        await logtoClient.signOut(postLogoutRedirectUri)

        user.value = null
        isAuthenticated.value = false
        logtoClient.clearAccessToken()
        logtoClient.clearAllTokens()
      } catch (error) {
        console.error('Sign out failed:', error)
      }
      MessagePlugin.success('退出成功')
    }

    const outlogin = async () => {
      logtoClient?.clearAccessToken()
      logtoClient?.clearAllTokens()
      isAuthenticated.value = false
      if (
        router.currentRoute.value.name !== 'home' &&
        router.currentRoute.value.name !== 'welcome'
      ) {
        router.push({
          name: 'home'
        })
      }
    }

    const handleCallback = async (callbackUrl: string) => {
      try {
        loading.value = true
        console.log('Handling callback:', callbackUrl)

        const session = localStorage.getItem('logto:signInSession')
        console.log('Current session in storage:', session)

        await logtoClient.handleSignInCallback(callbackUrl)
        await updateUserInfo()
        if (isAuthenticated.value) {
          MessagePlugin.success('登录成功')
        } else {
          MessagePlugin.error('登录失败')
        }
      } catch (error) {
        console.error('Callback handling failed:', error)
        MessagePlugin.error('登录回调处理失败')
      } finally {
        loading.value = false
      }
    }

    const updateUserInfo = async () => {
      isAuthenticated.value = await logtoClient.isAuthenticated()
      if (isAuthenticated.value) {
        user.value = await logtoClient.fetchUserInfo()
      } else {
        user.value = null
      }
    }

    const updateProfile = async (data: any) => {
      try {
        const body: any = {}
        const accountBody: any = {}
        // Update profile (name, etc.)
        if (data.name) {
          body.nickname = data.name
          accountBody.name = data.name
        }

        // Update custom data
        const customData = {
          intro: data.intro,
          gender: data.gender,
          birthday: data.birthday,
          region: data.region
        }

        // 如果 customData 中的字段有值，则添加到 body 中
        if (Object.values(customData).some((val) => val !== undefined && val !== '')) {
          accountBody.customData = customData
        }

        // 只有当有需要更新的数据时才发送请求
        if (Object.keys(body).length > 0) {
          await defaultRequest.patch('/api/my-account/profile', body)
          await defaultRequest.patch('/api/my-account', accountBody)
        }

        await updateUserInfo()
      } catch (error) {
        console.error('Update profile failed:', error)
        throw error
      }
    }

    const uploadAvatar = async (file: File) => {
      try {
        // 验证文件类型
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
        if (!allowedTypes.includes(file.type)) {
          throw new Error('只支持 JPG、PNG、GIF 格式的图片')
        }

        // 验证文件大小（2MB限制）
        const maxSize = 2 * 1024 * 1024 // 2MB
        if (file.size > maxSize) {
          throw new Error('图片大小不能超过 2MB')
        }

        // 使用 uploadFile 方法上传头像
        const result = await ceruRequest.uploadFile('/user-info/avatar', file, 'file')

        // 上传成功后更新用户信息
        await updateUserInfo()

        return result
      } catch (error) {
        console.error('Upload avatar failed:', error)
        throw error
      }
    }

    return {
      user,
      isAuthenticated,
      loading,
      init,
      login,
      logout,
      handleCallback,
      updateUserInfo,
      updateProfile,
      uploadAvatar,
      outlogin
    }
  },
  {
    persist: true
  }
)
