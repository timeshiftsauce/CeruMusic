<template>
  <t-dialog
    :visible="!!session"
    :mode="session?.modeless ? 'modeless' : 'modal'"
    :aria-label="session?.title"
    :width="session?.view ? `min(${session.view.presentation.size || 420}px, calc(100vw - 32px))` : '360px'"
    attach="body"
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('cancel')"
  >
    <template #header>
      <div class="qr-title">
        <PluginSidebarIcon v-if="session?.icon" :url="session.icon" class="qr-logo" />
        <span>{{ session?.title }}</span>
      </div>
    </template>
    <div v-if="session?.view" class="qr-custom-content" :style="{height: `${customHeight}px`}">
      <PluginViewSurface :key="session.view.sessionId" :session="session.view" isolated @failed="emit('cancel')" @resize="resizeCustom" />
    </div>
    <div v-else-if="session" class="qr-login">
      <p class="qr-hint">使用对应平台的手机客户端扫码</p>
      <div class="qr-frame">
        <NQrCode
          v-if="session.url"
          :value="session.url"
          :size="208"
          :padding="0"
          color="#111"
          background-color="#fff"
          role="img"
          aria-label="登录二维码"
        />
        <img
          v-else
          :src="session.image"
          alt="登录二维码"
          width="208"
          height="208"
          @error="emit('cancel')"
        />
      </div>
      <small v-if="session.origin" class="qr-origin">{{ session.origin }}</small>
      <p
        class="qr-status"
        :class="{ scanned: session.status === 'scanned' }"
        role="status"
        aria-live="polite"
      >
        <span aria-hidden="true" class="qr-status-dot" />{{
          session.status === 'scanned' ? '已扫码，请在手机上确认' : '等待扫码'
        }}
      </p>
      <t-button class="qr-cancel" variant="outline" @click="emit('cancel')">取消</t-button>
    </div>
  </t-dialog>
</template>
<script setup lang="ts">
import { NQrCode } from 'naive-ui'
import PluginSidebarIcon from './PluginSidebarIcon.vue'
import PluginViewSurface from './PluginViewSurface.vue'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import { ref, watch } from 'vue'
const props = defineProps<{
  session: {
    title: string
    icon?: string
    view?: PluginWebDrawerSession
    image?: string
    url?: string
    origin?: string
    status: string
    modeless?: boolean
  } | null
}>()
const emit = defineEmits<{ cancel: [] }>()
const customHeight=ref(360)
watch(()=>props.session?.view?.sessionId,()=>{customHeight.value=360})
function resizeCustom(height:number) {
  if (Number.isFinite(height) && height>0) customHeight.value=Math.max(180,Math.min(10000,height))
}
</script>
<style scoped>
.qr-custom-content {
  max-height: calc(100vh - 180px);
  min-height: 180px;
  overflow: auto;
  transition: height 220ms ease;
}
.qr-custom-content :deep(.plugin-component-surface),
.qr-custom-content :deep(.component-root) { height: auto; }
@media (prefers-reduced-motion: reduce) {
  .qr-custom-content { transition: none; }
}
.qr-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 26px;
  padding-right: 24px;
}
.qr-logo {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  overflow: hidden;
}
.qr-login {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 8px 0 0;
}
.qr-login p {
  margin: 0;
}
.qr-hint {
  font-size: 13px;
  line-height: 20px;
  color: var(--td-text-color-secondary);
}
.qr-frame {
  flex: none;
  box-sizing: content-box;
  width: 208px;
  height: 208px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 6%);
}
.qr-frame :deep(.n-qr-code) {
  display: block;
  box-sizing: content-box;
}
.qr-frame img {
  display: block;
  width: 208px;
  height: 208px;
  object-fit: contain;
  image-rendering: pixelated;
}
.qr-origin {
  max-width: 100%;
  margin-top: -6px;
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
  color: var(--td-text-color-placeholder);
}
.qr-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
.qr-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--td-text-color-placeholder);
}
.qr-status.scanned {
  color: var(--td-success-color);
}
.qr-status.scanned .qr-status-dot {
  background: currentColor;
}
.qr-cancel {
  align-self: stretch;
  margin-top: 4px;
}
</style>
