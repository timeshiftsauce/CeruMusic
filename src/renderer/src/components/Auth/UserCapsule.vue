<template>
  <div class="user-capsule-container">
    <n-dropdown
      v-if="authStore.isAuthenticated && authStore.user"
      style="-webkit-app-region: none"
      :options="userOpt"
      placement="bottom-start"
      trigger="hover"
      :theme-overrides="dropdownTheme"
      @select="handleMenuSelect"
    >
      <div
        class="user-capsule"
        :style="
          authStore.isAuthenticated
            ? 'background: rgba(125, 125, 125, 0.1);border: 1px solid rgba(125, 125, 125, 0.2);'
            : ''
        "
      >
        <t-avatar
          v-if="authStore.user.picture"
          :image="authStore.user.picture"
          size="small"
          style="margin-right: 4px"
        />
        <t-avatar
          v-else
          size="small"
          style="margin-right: 4px; background: rgba(125, 125, 125, 0.2); color: inherit"
          >{{ displayName.split('')[0] }}</t-avatar
        >
        <span class="user-name">{{ displayName }}</span>
      </div>
    </n-dropdown>
    <div v-else class="user-capsule" @click="handleLogin">
      <t-avatar :image="defaultAvatar" size="small" style="margin-right: 4px" />
      <span class="user-name">未登录</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import defaultAvatar from '@renderer/assets/user.webp'
import { useAuthStore } from '@renderer/store/Auth'
import { PoweroffIcon, UserIcon } from 'tdesign-icons-vue-next'
import { NIcon } from 'naive-ui'
import { h, type Component } from 'vue'

interface Props {
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: 'var(--titlebar-btn-text-color)'
})

const color = computed(() => props.color)

const authStore = useAuthStore()
const router = useRouter()

const renderIcon = (icon: Component) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}
const dropdownTheme = {
  borderRadius: '8px'
}

const userOpt = [
  {
    label: '我的个人信息',
    key: 'myInfo',
    icon: renderIcon(UserIcon)
  },
  {
    type: 'divider',
    key: 'd1'
  },
  {
    label: '注销登录',
    key: 'logout',
    icon: renderIcon(PoweroffIcon)
  }
]
// 账号相关
const handleLogin = () => {
  authStore.login()
}

const handleMenuSelect = (key: string | number) => {
  if (key === 'logout') {
    authStore.logout()
  } else if (key === 'myInfo') {
    router.push('/home/profile')
  }
}

const displayName = computed(() => {
  const u = authStore.user
  return (u?.nickname || u?.name || u?.username || u?.email || '用户') as string
})
</script>
<style scoped lang="scss">
.user-capsule-container {
  .login-btn {
    width: 2.25rem;
    height: 2.25rem;
    min-width: 2.25rem;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    color: v-bind(color);

    &:hover {
      background-color: var(--titlebar-btn-hover-bg);
    }
  }

  .user-capsule {
    display: flex;
    align-items: center;
    gap: 0.25rem;

    padding: 0.15rem 0.6rem 0.15rem calc((2rem - 24px) / 2);
    border-radius: 999px;
    cursor: pointer;
    transition: background-color 0.2s;
    height: 2rem;
    box-sizing: border-box;

    &:hover {
      background: rgba(125, 125, 125, 0.2);
    }

    .user-name {
      font-size: 0.8rem;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      color: v-bind(color);
      line-height: 1;
    }
  }
}
</style>
