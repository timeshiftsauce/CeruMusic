<script setup lang="ts">
import { NTooltip } from 'naive-ui'
import { ref, watch } from 'vue'

const props = defineProps<{ reason?: string }>()
const hovered = ref(false)
const focused = ref(false)
const events = {
  mouseenter: () => { hovered.value = true },
  mouseleave: () => { hovered.value = false },
  focus: (event: FocusEvent) => { focused.value = (event.target as HTMLElement).matches(':focus-visible') },
  blur: () => { focused.value = false }
}
watch(() => !!props.reason, () => { hovered.value = focused.value = false })
</script>

<template>
  <NTooltip v-if="reason" trigger="manual" :show="hovered || focused" :style="{ maxWidth: 'min(320px, 90vw)', overflowWrap: 'anywhere' }">
    <template #trigger><slot :events="events" /></template>
    {{ reason }}
  </NTooltip>
  <slot v-else :events="{}" />
</template>
