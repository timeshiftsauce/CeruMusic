<template>
  <section aria-labelledby="hook-controls-heading">
    <h3 id="hook-controls-heading">播放与队列</h3>
    <template v-if="state">
      <PluginSettingSwitch
        id="plugin-hooks-paused"
        label="暂停所有插件拦截"
        description="按播放器原有规则执行，不会停用音源插件。"
        :checked="state.paused"
        :disabled="busy || state.invalid"
        @change="(paused) => update({ paused })"
      />
      <PluginSettingSwitch
        id="plugin-hooks-announce"
        label="提示被插件处理的操作"
        description="插件改写或取消操作时，在播放器中显示提示。"
        :checked="state.announce"
        :disabled="busy || state.invalid"
        @change="(announce) => update({ announce })"
      />
      <p v-if="state.invalid" role="alert">
        拦截设置文件无法读取。已暂停所有拦截，原文件未被覆盖。
      </p>
      <div v-for="entry in state.suspended" :key="entry.pluginId + entry.name" class="paused-hook">
        <span>{{ entry.pluginId }}：{{ entry.name }} 因连续出错或超时已暂停</span
        ><t-button
          size="small"
          variant="text"
          :disabled="busy || state.invalid"
          @click="update({ entry, suspend: false })"
          >恢复此拦截</t-button
        >
      </div>
      <PluginHookActivity />
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import PluginSettingSwitch from './PluginSettingSwitch.vue'
import PluginHookActivity from './PluginHookActivity.vue'
import type { HookControls, HookControlChange } from '@common/pluginHookControls'
const state = ref<HookControls>(),
  error = ref(''),
  busy = ref(false)
let unsubscribe: (() => void) | undefined,
  request = 0
async function refresh() {
  const sequence = ++request
  try {
    const snapshot = await desktopBridge.api.plugins.hookControls()
    if (sequence === request) {
      state.value = snapshot
      error.value = ''
    }
  } catch (reason) {
    error.value = String(reason)
  }
}
async function update(change: HookControlChange) {
  if (busy.value) return
  busy.value = true
  try {
    ++request
    state.value = await desktopBridge.api.plugins.hookControls(change)
    error.value = ''
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  unsubscribe = desktopBridge.api.plugins.onHookNames(refresh)
  void refresh()
})
onBeforeUnmount(() => {
  ++request
  unsubscribe?.()
})
</script>
<style scoped>
.paused-hook {
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  margin-top: 8px;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.paused-hook {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
</style>
