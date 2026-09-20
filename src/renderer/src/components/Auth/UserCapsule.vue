<template>
  <div class="user-capsule-container">
    <n-dropdown
      v-model:show="menuShown"
      v-if="(authStore.isAuthenticated && authStore.user) || pluginAccountItems.length"
      style="-webkit-app-region: none"
      :options="userOpt"
      placement="bottom-start"
      trigger="hover"
      :theme-overrides="dropdownTheme"
      @select="handleMenuSelect"
      @update:show="(show) => show && refreshPluginAccounts()"
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
          v-if="authStore.user?.picture"
          :image="authStore.user.picture"
          size="small"
          style="margin-right: 4px"
        />
        <t-avatar
          v-else
          size="small"
          style="margin-right: 4px; background: rgba(125, 125, 125, 0.2); color: inherit"
          >{{ Name.split('')[0] }}</t-avatar
        >
        <span class="user-name">{{ authStore.isAuthenticated ? Name : '未登录' }}</span>
      </div>
    </n-dropdown>
    <div v-else class="user-capsule" @click="handleLogin">
      <t-avatar :image="defaultAvatar" size="small" style="margin-right: 4px" />
      <span class="user-name">未登录</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import defaultAvatar from '@renderer/assets/user.webp'
import { useAuthStore } from '@renderer/store/Auth'
import { PoweroffIcon, UserIcon } from 'tdesign-icons-vue-next'
import { NIcon, type DropdownOption } from 'naive-ui'
import { Avatar, Tag, MessagePlugin } from 'tdesign-vue-next'
import {
  pluginAccountItems,
  pluginAccountSummaries,
  refreshPluginAccounts
} from '@renderer/services/pluginAccounts'
import { h, type Component } from 'vue'
import displayName from '@renderer/utils/auth/displayName'

interface Props {
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: 'var(--titlebar-btn-text-color)'
})

const color = computed(() => props.color)

const authStore = useAuthStore()
const router = useRouter()
const menuShown = ref(false)
const loggingOut = ref('')

const renderIcon = (icon: Component) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}
const dropdownTheme = {
  borderRadius: '8px'
}

const mainAccountOptions: DropdownOption[] = [
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
    icon: renderIcon(PoweroffIcon),
    children: [
      {
        type: 'render',
        key: 'logoutTip',
        render: () =>
          h(
            'div',
            {
              style:
                'padding: 8px 12px 6px; max-width: 240px; font-size: 11px; color: rgba(125,125,125,0.85); line-height: 1.5; white-space: normal;'
            },
            '"退出鉴权中心账号" 将同步退出所有使用鉴权中心登录的应用(包括澜音本身),如仅想切换澜音账号请选第一项。'
          )
      },
      {
        type: 'divider',
        key: 'd2'
      },
      {
        key: 'logoutLocal',
        label: '仅退出当前应用'
      },
      {
        key: 'logoutAll',
        label: '退出鉴权中心账号'
      }
    ]
  }
]
const userOpt = computed<DropdownOption[]>(() => [
  ...(authStore.isAuthenticated
    ? mainAccountOptions
    : [{ label: '登录澜音', key: 'login', icon: renderIcon(UserIcon) }]),
  ...(pluginAccountItems.value.length
    ? [{ type: 'divider' as const, key: 'plugin-accounts-divider' }]
    : []),
  ...pluginAccountItems.value.map((item) => ({
    key: item.key,
    props: { class: 'plugin-account-option' },
    children:
      pluginAccountSummaries.value[item.key]?.signedIn && item.logoutAction
        ? [
            {
              key: item.key + ':logout',
              label: '退出登录',
              disabled: loggingOut.value === item.key,
              icon: renderIcon(PoweroffIcon)
            }
          ]
        : undefined,
    label: () => {
      const account = pluginAccountSummaries.value[item.key]
      return h(
        'div',
        {
          class: 'plugin-account-row',
          'data-plugin-account': item.key,
          onClick: (event: MouseEvent) => {
            if (account?.signedIn && item.logoutAction) {
              event.stopPropagation()
              handleMenuSelect(item.key)
            }
          }
        },
        [
          h(
            Avatar,
            { image: account?.avatarUrl || defaultAvatar, size: '34px', shape: 'circle' },
            { default: () => item.title.slice(0, 1) }
          ),
          h('span', { class: 'plugin-account-details' }, [
            h(
              'span',
              { class: 'plugin-account-name' },
              account?.signedIn ? account.displayName : '未登录'
            ),
            h('small', { class: 'plugin-account-provider' }, item.title)
          ]),
          ...(account?.signedIn && account.badge
            ? [
                h(
                  Tag,
                  { size: 'small', theme: 'warning', shape: 'round', variant: 'light' },
                  { default: () => account.badge }
                )
              ]
            : [])
        ]
      )
    }
  }))
])
// 账号相关
const handleLogin = () => {
  authStore.login()
}

const handleMenuSelect = async (key: string | number) => {
  menuShown.value = false
  const logout = pluginAccountItems.value.find((item) => item.key + ':logout' === key)
  if (logout) {
    if (loggingOut.value) return
    loggingOut.value = logout.key
    try {
      await window.api.plugins.accountLogout(logout.pluginId, logout.id)
      await refreshPluginAccounts(logout.pluginId)
    } catch (error: any) {
      MessagePlugin.error(error.message || '退出登录失败')
    } finally {
      loggingOut.value = ''
    }
    return
  }
  const account = pluginAccountItems.value.find((item) => item.key === key)
  if (account) {
    void window.api.plugins
      .openSurface(account.pluginId, account.view)
      .catch((error) => MessagePlugin.error(error.message || '打开账号失败'))
  } else if (key === 'login') {
    handleLogin()
  } else if (key === 'logoutAll') {
    authStore.logout()
  } else if (key === 'logoutLocal') {
    authStore.outlogin()
  } else if (key === 'myInfo') {
    router.push('/home/profile')
  }
}

const Name = computed(() => {
  const u = authStore.user
  return displayName(u)
})
</script>
<style scoped lang="scss">
:global(.plugin-account-row) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 210px;
  max-width: 280px;
  padding: 7px 0;
  line-height: 1.35;
}
:global(.n-dropdown-option-body.plugin-account-option) {
  height: auto !important;
  min-height: 58px;
}
:global(.plugin-account-details) {
  flex: 1;
  min-width: 0;
}
:global(.plugin-account-name) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
:global(.plugin-account-provider) {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
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
