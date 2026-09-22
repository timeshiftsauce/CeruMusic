<script setup lang="ts">
import { NotificationIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { NBadge } from 'naive-ui'
import { useNotificationsStore } from '@renderer/store/Notifications'
const inbox = useNotificationsStore()
function toggle() {
  if (!inbox.account) {
    MessagePlugin.warning('登录后可查看消息')
    return
  }
  inbox.open = !inbox.open
}
</script>
<template>
  <t-button
    class="control-btn settings-btn notification-bell"
    shape="circle"
    theme="default"
    variant="text"
    :aria-label="`消息，${inbox.counts.all} 条未读`"
    title="消息中心"
    @click="toggle"
  >
    <NBadge
      class="notification-badge"
      :value="inbox.counts.all"
      :max="99"
      :show-zero="false"
      :offset="[-3, -2]"
      :theme-overrides="{ fontSize: '9px' }"
      color="var(--td-error-color)"
    >
      <NotificationIcon size="16" />
    </NBadge>
  </t-button>
</template>
<style scoped>
.notification-bell {
  -webkit-app-region: no-drag;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  min-width: 2.25rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  overflow: visible;
}
.notification-bell:hover {
  background: var(--titlebar-btn-hover-bg, var(--td-bg-color-container-hover));
}
.notification-bell:focus-visible {
  outline: 2px solid var(--td-brand-color);
}
.notification-bell :deep(.t-button__text) {
  position: static;
  display: inline-flex;
  align-items: center;
}
.notification-badge :deep(.n-badge-sup) {
  justify-content: center;
  min-width: 14px;
  padding: 0 3px;
  height: 14px;
  line-height: 14px;
  font-weight: 600;
  border: 1px solid var(--td-bg-color-container);
  box-sizing: border-box;
  pointer-events: none;
}
</style>
