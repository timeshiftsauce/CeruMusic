<template>
  <PluginComponentSurface v-if="loaded && direct" ref="componentSurface" v-bind="$attrs" :session="session" />
  <PluginWebSurface v-else-if="loaded" ref="webSurface" v-bind="$attrs" :session="session" />
</template>
<script setup lang="ts">
import { computed, shallowRef, ref } from 'vue'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import { strictPluginViews, loadSlotPolicy } from '@renderer/services/pluginSlotPolicy'
import PluginComponentSurface from './PluginComponentSurface.vue'
import PluginWebSurface from './PluginWebSurface.vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ session: PluginWebDrawerSession; isolated?: boolean }>()
const loaded = ref(false)
void loadSlotPolicy().finally(() => { loaded.value = true })
const direct = computed(() => !props.isolated && !!props.session.componentSource && !strictPluginViews.value)
const componentSurface = shallowRef<InstanceType<typeof PluginComponentSurface>>()
const webSurface = shallowRef<InstanceType<typeof PluginWebSurface>>()
defineExpose({
  deliverSpectrum: (data: Float32Array) => (direct.value ? componentSurface.value : webSurface.value)?.deliverSpectrum(data),
  transition: (phase: 'onEnter' | 'onLeave', reason: 'skin' | 'track') => (direct.value ? componentSurface.value : webSurface.value)?.transition(phase, reason) ?? Promise.resolve()
})
</script>
