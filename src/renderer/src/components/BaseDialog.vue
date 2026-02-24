<template>
  <Teleport to="body">
    <transition name="bd-fade">
      <div v-if="show" class="bd-overlay" @click="onOverlayClick"></div>
    </transition>
    <transition name="bd-pop">
      <div v-if="show" class="bd-wrapper" role="dialog" aria-modal="true" @keydown.esc="onEsc">
        <div class="bd-card" :style="{ width }" v-bind="$attrs" @click.stop>
          <div class="bd-header">
            <div class="bd-title">
              <slot name="header">
                {{ title }}
              </slot>
            </div>
            <button v-if="closeBtn" class="bd-close" @click="close">×</button>
          </div>
          <div class="bd-body">
            <slot />
          </div>
          <div v-if="$slots.action" class="bd-footer">
            <slot name="action" />
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  show: boolean
  title?: string
  width?: string
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
  closeBtn?: boolean
}>()

const emit = defineEmits(['update:show'])

const width = props.width ?? '90vw'
const closeOnOverlay = props.closeOnOverlay ?? true
const closeOnEsc = props.closeOnEsc ?? true
const closeBtn = props.closeBtn ?? true

function close() {
  emit('update:show', false)
}

function onOverlayClick() {
  if (closeOnOverlay) close()
}

function onEsc() {
  if (closeOnEsc) close()
}

function lockScroll(lock: boolean) {
  try {
    if (lock) {
      const prev = document.body.style.overflow
      if (!prev) document.body.setAttribute('data-bd-prev-overflow', '')
      document.body.style.overflow = 'hidden'
    } else {
      const hadPrev = document.body.hasAttribute('data-bd-prev-overflow')
      if (hadPrev) document.body.style.overflow = ''
      document.body.removeAttribute('data-bd-prev-overflow')
    }
  } catch {}
}

watch(
  () => props.show,
  (v) => lockScroll(!!v),
  { immediate: true }
)

onBeforeUnmount(() => lockScroll(false))
</script>

<style scoped lang="scss">
.bd-overlay {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(
      1200px circle at 50% 30%,
      var(--td-mask-active, rgba(0, 0, 0, 0.1)),
      var(--td-mask-disabled, rgba(0, 0, 0, 0.6))
    ),
    var(--td-mask-disabled, rgba(0, 0, 0, 0.6));
  backdrop-filter: saturate(120%) blur(3px);
  z-index: 888;
}
.bd-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  z-index: 999999;
}
.bd-card {
  pointer-events: auto;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #111);
  border-radius: 14px;
  border: 1px solid var(--td-border-level-1-color, var(--td-component-stroke, #eee));
  box-shadow: var(--td-shadow-3, 0 12px 40px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08));
  width: 90vw;
  max-width: 960px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--td-component-stroke, #eee);
}
.bd-title {
  font-weight: 700;
  font-size: 16px;
}
.bd-close {
  appearance: none;
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--td-text-color-secondary, #666);
  cursor: pointer;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.12s ease;
}
.bd-close:hover {
  background: var(--td-bg-color-container-hover, rgba(0, 0, 0, 0.06));
}
.bd-close:active {
  transform: scale(0.96);
}
.bd-close:focus-visible {
  outline: 2px solid var(--td-brand-color, #5e7ce0);
  outline-offset: 2px;
}
.bd-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.bd-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--td-component-stroke, #eee);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.bd-fade-enter-active,
.bd-fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.bd-fade-enter-from,
.bd-fade-leave-to {
  opacity: 0;
}
.bd-pop-enter-active {
  transition:
    transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
    opacity 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform, opacity;
}
.bd-pop-leave-active {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
  will-change: transform, opacity;
}
.bd-pop-enter-from,
.bd-pop-leave-to {
  transform: translateY(10px) scale(0.98);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .bd-fade-enter-active,
  .bd-fade-leave-active,
  .bd-pop-enter-active,
  .bd-pop-leave-active {
    transition: opacity 0.15s linear;
  }
  .bd-pop-enter-from,
  .bd-pop-leave-to {
    transform: none;
  }
}
@media (max-width: 720px) {
  .bd-card {
    width: 96vw;
    max-width: 96vw;
    border-radius: 12px;
  }
}
</style>
