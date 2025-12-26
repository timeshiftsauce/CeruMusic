import { defineStore } from 'pinia'
import { ref } from 'vue'
import LogtoClient, { UserInfoResponse } from '@logto/browser'
import { MessagePlugin } from 'tdesign-vue-next'

const appId = '2a22nn23flw9nyrwi6jw9'
const endpoint = 'https://auth.shiqianjiang.cn/'
const redirectUri = 'http://127.0.0.1:43110/callback'
const postLogoutRedirectUri = 'http://127.0.0.1:43110/logout-callback'

export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<UserInfoResponse | null>(null)
    const isAuthenticated = ref(false)
    const loading = ref(false)

    const logtoClient = new LogtoClient({
      endpoint,
      appId
    })

    const init = async () => {
      try {
        loading.value = true
        isAuthenticated.value = await logtoClient.isAuthenticated()
        if (isAuthenticated.value) {
          user.value = await logtoClient.fetchUserInfo()
        }
      } catch (error) {
        console.error('Failed to init auth:', error)
      } finally {
        loading.value = false
      }
    }

    const login = async () => {
      try {
        await logtoClient.signIn(redirectUri)
      } catch (error) {
        console.error('Sign in failed:', error)
        // 某些情况下 signIn 会因为页面跳转被拦截而抛出错误，这是正常的
        // 只要 localStorage 中有 logto:signInSession 即可
      }
    }

    const logout = async () => {
      try {
        await logtoClient.signOut(postLogoutRedirectUri)
        user.value = null
        isAuthenticated.value = false
      } catch (error) {
        console.error('Sign out failed:', error)
      }
    }

    const handleCallback = async (callbackUrl: string) => {
      try {
        loading.value = true
        console.log('Handling callback:', callbackUrl)

        // 尝试手动修复可能的 session 丢失问题（仅调试）
        const session = localStorage.getItem('logto:signInSession')
        console.log('Current session in storage:', session)

        await logtoClient.handleSignInCallback(callbackUrl)
        isAuthenticated.value = await logtoClient.isAuthenticated()
        if (isAuthenticated.value) {
          user.value = await logtoClient.fetchUserInfo()
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

    return {
      user,
      isAuthenticated,
      loading,
      init,
      login,
      logout,
      handleCallback
    }
  },
  {
    persist: true
  }
)
