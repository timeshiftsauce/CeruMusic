<template>
  <div class="user-capsule-container">
    <n-dropdown
      v-if="(authStore.isAuthenticated && authStore.user) || pluginAccountItems.length"
      v-model:show="menuShown"
      style="-webkit-app-region: none"
      :options="userOpt"
      placement="bottom-start"
      trigger="hover"
      :theme-overrides="dropdownTheme"
      @select="handleMenuSelect"
      @update:show="(show) => show && refreshPluginAccounts(undefined, true)"
    >
      <div
        class="user-capsule"
        :style="
          authStore.isAuthenticated
            ? 'background: rgba(125, 125, 125, 0.1);border: 1px solid rgba(125, 125, 125, 0.2);'
            : ''
        "
      >
        <t-avatar v-if="authStore.user?.picture" :image="authStore.user.picture" size="small" />
        <t-avatar
          v-else
          size="small"
          style="background: rgba(125, 125, 125, 0.2); color: inherit"
          >{{ Name.split('')[0] }}</t-avatar
        >
        <span class="user-name">{{ authStore.isAuthenticated ? Name : '未登录' }}</span>
      </div>
    </n-dropdown>
    <div v-else class="user-capsule" @click="handleLogin">
      <t-avatar :image="defaultAvatar" size="small" />
      <span class="user-name">未登录</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import defaultAvatar from '@renderer/assets/user.webp'
import { useAuthStore } from '@renderer/store/Auth'
import { PoweroffIcon, UserIcon } from 'tdesign-icons-vue-next'
import { NIcon, type DropdownOption } from 'naive-ui'
import { Avatar, Tag } from 'tdesign-vue-next'
import { MessagePlugin } from '@renderer/plugin/notifications'
import {
  pluginAccountItems,
  pluginAccountSummaries,
  pluginConnections,
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
function loginChoices(item: (typeof pluginAccountItems.value)[number]) {
  const methods = item.loginMethods.filter(
    (method) =>
      method === 'form' || method === 'qrcode' || method === 'oauth' || method === 'browser'
  )
  return methods.map((method) => ({
    key: item.key + ':login:' + method,
    label:
      method === 'qrcode'
        ? '扫码登录'
        : method === 'oauth'
          ? '浏览器授权'
          : method === 'browser'
            ? '网页登录'
            : '表单登录'
  }))
}
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
      item.runtime === 3 && pluginConnections.value[item.key]?.rows.length
        ? [
            ...pluginConnections.value[item.key].rows.map((row) => ({
              key: item.key + (row.expired ? ':renew:' : ':switch:') + row.id,
              label: row.summary.displayName + (row.expired ? ' · 需要重新登录' : ''),
              disabled: !row.expired && row.id === pluginConnections.value[item.key].active
            })),
            ...(item.multiple && loginChoices(item).length
              ? [
                  {
                    key: item.key + ':add',
                    label: '添加账号',
                    ...(loginChoices(item).length > 1 ? { children: loginChoices(item) } : {})
                  }
                ]
              : []),
            { key: item.key + ':logout', label: '退出当前账号', icon: renderIcon(PoweroffIcon) }
          ]
        : item.runtime === 3 && loginChoices(item).length > 1
          ? loginChoices(item)
          : pluginAccountSummaries.value[item.key]?.signedIn && item.logoutAction
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
            {
              image: account?.avatarUrl || defaultAvatar,
              size: '34px',
              shape: 'circle',
              style: 'flex-shrink: 0'
            },
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
                  {
                    size: 'small',
                    theme: 'warning',
                    shape: 'round',
                    variant: 'light',
                    style: 'display: inline-flex; align-items: center; flex-shrink: 0'
                  },
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
  const modern = pluginAccountItems.value.find(
    (item) => item.runtime === 3 && (item.key === key || String(key).startsWith(item.key + ':'))
  )
  if (modern) {
    const command = String(key).slice(modern.key.length + 1)
    if (!command && !loginChoices(modern).length && modern.view) {
      await desktopBridge.api.plugins
        .openSurface(modern.pluginId, modern.view)
        .catch((error) => MessagePlugin.error(error.message))
      return
    }
    const action = command.startsWith('switch:')
      ? 'switch'
      : command === 'logout'
        ? 'logout'
        : 'login'
    try {
      const changed = await desktopBridge.api.plugins.accountChange(
        modern.pluginId,
        modern.id,
        action,
        action === 'switch'
          ? command.slice(7)
          : command.startsWith('renew:')
            ? command.slice(6)
            : undefined,
        command === 'login:qrcode'
          ? 'qrcode'
          : command === 'login:form'
            ? 'form'
            : command === 'login:oauth'
              ? 'oauth'
              : command === 'login:browser'
                ? 'browser'
                : undefined
      )
      if (action === 'switch' && !changed) MessagePlugin.info('插件已取消切换，仍使用原账号')
      await refreshPluginAccounts(modern.pluginId)
    } catch (error: any) {
      MessagePlugin.error(error.message || '账号操作失败')
    }
    return
  }
  const logout = pluginAccountItems.value.find((item) => item.key + ':logout' === key)
  if (logout) {
    if (loggingOut.value) return
    loggingOut.value = logout.key
    try {
      await desktopBridge.api.plugins.accountLogout(logout.pluginId, logout.id)
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
    void desktopBridge.api.plugins
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
  display: flex;
  align-items: center;
}
:global(.n-dropdown-option-body.plugin-account-option .n-dropdown-option-body__label) {
  display: flex;
  align-items: center;
  width: 100%;
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
    gap: 6px;

    padding: 0 8px 0 4px;
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
