<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import gsap from 'gsap'

const props = defineProps<{ index: number; count: number; disabled?: boolean }>()
const emit = defineEmits<{ select: [index: number] }>()
const visibleCount = computed(() => Math.min(10, props.count))
const start = computed(() =>
  Math.max(0, Math.min(props.index - 4, props.count - visibleCount.value))
)
const activeSlot = computed(() => Math.max(0, props.index - start.value))
const track = ref<HTMLElement | null>(null)
const current = ref<HTMLElement | null>(null)
const pill = ref<HTMLElement | null>(null)
const STEP = 22
let motion: gsap.core.Timeline | null = null

function move(previousIndex?: number) {
  if (!current.value || !pill.value || !track.value) return
  motion?.kill()
  const y = activeSlot.value * STEP
  if (
    previousIndex === undefined ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    gsap.set(current.value, { y })
    gsap.set(pill.value, { scaleX: 1, scaleY: 1 })
    gsap.set(track.value, { y: 0 })
    return
  }

  const direction = Math.sign(props.index - previousIndex)
  const fromY = Number(gsap.getProperty(current.value, 'y'))
  motion = gsap.timeline()
  // 先顺着方向拉长，再略微压扁，最后弹回胶囊形状。
  motion.to(
    current.value,
    { y: (fromY + y) / 2 + direction * 3, duration: 0.14, ease: 'power2.in' },
    0
  )
  motion.to(pill.value, { scaleX: 0.78, scaleY: 1.4, duration: 0.14, ease: 'power2.in' }, 0)
  motion.to(current.value, { y, duration: 0.48, ease: 'elastic.out(1, 0.65)' }, 0.14)
  motion.to(pill.value, { scaleX: 1.16, scaleY: 0.88, duration: 0.15, ease: 'power2.out' }, 0.14)
  motion.to(pill.value, { scaleX: 1, scaleY: 1, duration: 0.42, ease: 'elastic.out(1, 0.5)' }, 0.29)
  if (start.value !== Math.max(0, Math.min(previousIndex - 4, props.count - visibleCount.value))) {
    motion.fromTo(
      track.value,
      { y: direction * 6 },
      { y: 0, duration: 0.42, ease: 'power3.out' },
      0
    )
  }
}

onMounted(() => move())
watch([() => props.index, () => props.count], (_next, previous) => move(previous[0]), {
  flush: 'post'
})
onUnmounted(() => motion?.kill())
</script>

<template>
  <Teleport to="body">
    <nav
      v-if="count > 1"
      class="note-position"
      :aria-label="`第 ${index + 1} 篇，共 ${count} 篇笔记`"
    >
      <div ref="track" class="position-track">
        <button
          v-for="slot in visibleCount"
          :key="slot"
          class="position-dot"
          type="button"
          :aria-label="`跳到第 ${start + slot} 篇笔记`"
          :aria-current="slot - 1 === activeSlot ? 'step' : undefined"
          :disabled="disabled || slot - 1 === activeSlot"
          @click="emit('select', start + slot - 1)"
          :class="{
            active: slot - 1 === activeSlot,
            edge:
              (slot === 1 && start > 0) || (slot === visibleCount && start + visibleCount < count)
          }"
        />
      </div>
      <span ref="current" class="position-current" aria-hidden="true">
        <span ref="pill" class="position-pill" />
      </span>
    </nav>
  </Teleport>
</template>

<style scoped>
.note-position {
  position: fixed;
  z-index: 2002;
  right: calc((100vw - min(1100px, 92vw)) / 4 - 11px);
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  pointer-events: none;
  -webkit-app-region: no-drag;
}
.position-track {
  display: flex;
  flex-direction: column;
}
.position-dot {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  pointer-events: auto;
  cursor: pointer;
}
.position-dot:disabled {
  cursor: default;
}
.position-dot:focus-visible {
  outline: 2px solid var(--td-brand-color, #fff);
  outline-offset: 1px;
}
.position-dot:not(:disabled):hover::before {
  opacity: 0.9;
  transform: scale(1.18);
}
.position-dot::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--td-brand-color, #fff);
  opacity: 0.5;
  transition:
    opacity 200ms ease,
    transform 300ms cubic-bezier(0.2, 1.5, 0.4, 1);
}
.position-dot.edge::before {
  transform: scale(0.7);
  opacity: 0.3;
}
.position-dot.active::before {
  opacity: 0;
}
.position-current {
  position: absolute;
  top: -2px;
  left: 7.5px;
  width: 7px;
  height: 26px;
}
.position-pill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: var(--td-brand-color, #fff);
  box-shadow: inset 1px 0 1px rgba(255, 255, 255, 0.35);
  transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
  .position-dot::before {
    transition: none;
  }
}
</style>
