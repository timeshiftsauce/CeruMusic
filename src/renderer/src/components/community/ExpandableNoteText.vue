<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { NoteText } from './noteText'

const props = withDefaults(defineProps<{ text: string; lines?: number }>(), { lines: 10 })

const contentEl = ref<HTMLElement | null>(null)
const canExpand = ref(false)
const expanded = ref(false)
const collapsedHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

async function measureContent() {
  await nextTick()
  const el = contentEl.value
  if (!el) return
  const lineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight)
  if (!Number.isFinite(lineHeight)) return
  collapsedHeight.value = lineHeight * props.lines
  canExpand.value = el.scrollHeight > collapsedHeight.value + 1
  if (!canExpand.value) expanded.value = false
}

watch(
  () => [props.text, props.lines],
  () => {
    expanded.value = false
    void measureContent()
  },
  { flush: 'post' }
)

onMounted(() => {
  void measureContent()
  if (typeof ResizeObserver !== 'undefined' && contentEl.value) {
    resizeObserver = new ResizeObserver(() => void measureContent())
    resizeObserver.observe(contentEl.value)
  }
})

onUnmounted(() => resizeObserver?.disconnect())
</script>

<template>
  <div class="expandable-note">
    <div
      ref="contentEl"
      class="expandable-note-text"
      :class="{ collapsed: canExpand && !expanded }"
      :style="{ maxHeight: canExpand && !expanded ? `${collapsedHeight}px` : undefined }"
    >
      <NoteText :text="text" />
    </div>
    <button
      v-if="canExpand"
      class="expand-note-text"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? '收起' : '展开' }}
    </button>
  </div>
</template>

<style scoped>
.expandable-note-text {
  overflow-wrap: anywhere;
}

.expandable-note-text.collapsed {
  overflow: hidden;
}

.expand-note-text {
  display: block;
  margin-top: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--td-brand-color, #ff2442);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
</style>
