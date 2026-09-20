<script setup lang="ts">
import { nextTick, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { playlistSections } from '@renderer/services/pluginState'
import PluginSurface from './PluginSurface.vue'

const props = withDefaults(defineProps<{ ready?: boolean }>(), { ready: true })
const route = useRoute()
const active = ref(true)
const root = ref<HTMLElement>()
onActivated(() => {
  active.value = true
})
onDeactivated(() => {
  active.value = false
})

watch(
  [
    () => route.query.pluginId,
    () => route.query.sectionId,
    playlistSections,
    active,
    () => props.ready
  ],
  async ([pluginId, sectionId, sections, isActive, ready], _old, onCleanup) => {
    if (!isActive || !ready || typeof pluginId !== 'string' || typeof sectionId !== 'string') return
    const target = sections.find(
      (section) => section.pluginId === pluginId && section.id === sectionId
    )
    if (!target) return
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    await nextTick()
    if (cancelled) return
    const element = Array.from(root.value?.children ?? []).find(
      (child) => (child as HTMLElement).dataset.sectionKey === target.key
    ) as HTMLElement | undefined
    // Only move the playlist page's vertical scroll; route transitions may temporarily
    // translate it, so scrollIntoView could otherwise shift an ancestor horizontally.
    let container = element?.parentElement
    while (container) {
      if (/(auto|scroll)/.test(getComputedStyle(container).overflowY)) {
        container.scrollTop +=
          element!.getBoundingClientRect().top - container.getBoundingClientRect().top - 24
        break
      }
      container = container.parentElement
    }
    element?.focus({ preventScroll: true })
  },
  { immediate: true, flush: 'post' }
)
</script>

<template>
  <div v-if="active && playlistSections.length" ref="root" class="plugin-playlist-sections">
    <section
      v-for="section in playlistSections"
      :key="section.key"
      :data-section-key="section.key"
      :aria-label="section.title"
      tabindex="-1"
      class="plugin-playlist-section"
    >
      <PluginSurface :plugin-id="section.pluginId" :surface-id="section.view" embedded />
    </section>
  </div>
</template>

<style scoped>
.plugin-playlist-section {
  margin-top: 32px;
  scroll-margin-top: 24px;
  outline: none;
}
</style>
