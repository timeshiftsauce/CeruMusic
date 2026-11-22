<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import {computed,watch} from 'vue'
import {useRouter} from 'vue-router'
import type { LibraryPlaylist } from '@shiqianjiang/ceru-plugin-sdk'
import {activePluginContributions, contributionsLoaded, isPluginPageVisible} from '@renderer/services/pluginState'
import PluginSurface from './PluginSurface.vue'
const props = defineProps<{pluginId: string; pageId: string; embedded?: boolean; playlist?: LibraryPlaylist}>()
const sectionContext = computed(() => props.playlist && { pageId: props.pageId, playlist: props.playlist })
const plugin = computed(() => activePluginContributions.value.find(item => item.pluginId === props.pluginId))
const page = computed(() => plugin.value?.descriptor.pages.find((item: {id:string;when?:{loggedIn?:boolean}}) => item.id === props.pageId && isPluginPageVisible(item)))
const router = useRouter()
watch(page,(current,previous) => {
  const route = router.currentRoute.value
  if (!current && previous && !props.embedded && route.name === 'plugin-page' && route.params.pluginId === props.pluginId && route.params.pageId === props.pageId) void router.replace('/home/local')
})
const showSchema = () => desktopBridge.api.plugins.openSurface(props.pluginId, page.value.view)
const view = computed(() => plugin.value?.descriptor.views.find((item: {id:string}) => item.id === page.value?.view))
</script>
<template>
  <section class="plugin-page" :aria-label="page?.title || '插件页面'">
    <PluginSurface v-if="view && view.kind !== 'schema'" :plugin-id="pluginId" :surface-id="view.id" :embedded="embedded" :heading="page?.mount === 'settings' ? page.title : undefined" :section-context="sectionContext" />
    <t-button v-else-if="view" @click="showSchema">打开{{ page.title }}</t-button>
    <p v-else role="status">{{ contributionsLoaded ? '页面不可用，请检查该插件是否启用。' : '正在加载插件页面…' }}</p>
  </section>
</template>
<style scoped>.plugin-page{height:100%;min-height:240px;width:100%}</style>
