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
/** 主位移弹簧：轻微过冲 + 缓慢收敛，手感更水灵 Q 弹 */
const SPRING = 'elastic.out(1, 0.75)'
/** 胶囊变形回弹更绵软 */
const SPRING_PILL = 'elastic.out(1, 0.5)'
let motion: gsap.core.Timeline | null = null

function move(previousIndex?: number, previousCount = props.count) {
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
  const previousVisible = Math.min(10, previousCount)
  const previousStart = Math.max(0, Math.min(previousIndex - 4, previousCount - previousVisible))
  motion = gsap.timeline()

  if (start.value !== previousStart) {
    // 超过 10 篇后窗口滑动：让点列从偏移处滚回一格（胶囊锚定不动），
    // 视觉上像"点从胶囊下滚过"，而不是整个指示器一起平移。
    if (direction === 0) {
      // 列表增长导致的窗口重定位：胶囊平滑挪到新槽位，点列直接换页。
      motion.set(track.value, { y: 0 }, 0)
      motion.to(current.value, { y, duration: 0.5, ease: 'power2.out' }, 0)
    } else {
      motion.fromTo(track.value, { y: direction * STEP }, { y: 0, duration: 0.55, ease: SPRING }, 0)
      // 胶囊保持锚定：仅在动画被打断时补齐回当前槽位，不做跟随位移。
      motion.to(current.value, { y, duration: 0.25, ease: 'power2.out' }, 0)
    }
    // 胶囊被流过的点"撑"一下再弹回，作为捕获新点的反馈。
    motion.to(pill.value, { scaleX: 0.8, scaleY: 1.35, duration: 0.16, ease: 'sine.in' }, 0)
    motion.to(pill.value, { scaleX: 1.14, scaleY: 0.89, duration: 0.18, ease: 'sine.out' }, 0.16)
    motion.to(pill.value, { scaleX: 1, scaleY: 1, duration: 0.5, ease: SPRING_PILL }, 0.34)
    return
  }

  // 窗口内移动：胶囊先顺着方向拉长，再略微压扁，最后弹回胶囊形状。
  const fromY = Number(gsap.getProperty(current.value, 'y'))
  motion.to(
    current.value,
    { y: (fromY + y) / 2 + direction * 4, duration: 0.15, ease: 'sine.in' },
    0
  )
  motion.to(pill.value, { scaleX: 0.8, scaleY: 1.35, duration: 0.16, ease: 'sine.in' }, 0)
  motion.to(current.value, { y, duration: 0.55, ease: SPRING }, 0.15)
  motion.to(pill.value, { scaleX: 1.14, scaleY: 0.89, duration: 0.18, ease: 'sine.out' }, 0.16)
  motion.to(pill.value, { scaleX: 1, scaleY: 1, duration: 0.5, ease: SPRING_PILL }, 0.34)
}

onMounted(() => move())
watch([() => props.index, () => props.count], (_next, previous) => move(previous[0], previous[1]), {
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
  /* 窗口滑动时点列整体位移，裁掉滚出容器的点 */
  overflow: hidden;
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
