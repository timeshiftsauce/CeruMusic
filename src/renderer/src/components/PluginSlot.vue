<script setup lang="ts">
import { computed, ref, onActivated, onDeactivated, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@renderer/store'
import { activePluginContributions } from '@renderer/services/pluginState'
import { strictPluginViews, loadSlotPolicy, pausedSlotPlugins } from '@renderer/services/pluginSlotPolicy'
import PluginSurface from './PluginSurface.vue'
const props = defineProps<{name:string}>()
const route = useRoute(), auth = useAuthStore(), visible = ref(true)
onMounted(loadSlotPolicy)
onActivated(() => {visible.value = true})
onDeactivated(() => {visible.value = false})
const slots = computed(() => !visible.value || strictPluginViews.value ? [] : activePluginContributions.value.flatMap(({pluginId,descriptor}) => {
  if (descriptor.runtime !== 3 || pausedSlotPlugins.value.has(pluginId)) return []
  return descriptor.slots.filter((item:any) => item.slot === props.name && ['append','prepend'].includes(item.mode) && (!item.when?.route || item.when.route === route.path) && (item.when?.loggedIn === undefined || auth.isAuthenticated === item.when.loggedIn) && descriptor.views.some((view:any) => view.id === item.view && view.kind === 'component')).map((item:any) => ({...item,pluginId}))
}).sort((left,right) => Number(left.mode !== 'prepend') - Number(right.mode !== 'prepend') || (left.order ?? 0) - (right.order ?? 0)))
</script>
<template><div v-for="item in slots" :key="JSON.stringify([item.pluginId,item.id])" class="plugin-slot" :data-plugin-slot="name"><PluginSurface :plugin-id="item.pluginId" :surface-id="item.view" :slot-name="name" /></div></template>
<style scoped>.plugin-slot{height:42px;width:144px;max-width:100%;overflow:hidden}</style>
