<template>
  <Teleport to="body">
    <dialog
      ref="panel"
      class="manager-sheet"
      :class="{ 'is-closing': closing }"
      @cancel.prevent="closePanel"
      aria-labelledby="plugin-settings-heading"
      @close="emit('close')"
      @click="closeOutside"
    >
      <header class="sheet-heading">
        <div>
          <h2 id="plugin-settings-heading">插件管理设置</h2>
          <p>调整本机插件的运行和预览方式。</p>
        </div>
        <button
          type="button"
          class="close-settings"
          autofocus
          aria-label="关闭插件管理设置"
          @click="closePanel"
        >
          <t-icon name="close" />
        </button>
      </header>
      <div class="sheet-body"><PluginDeveloperPanel /><PluginHooksPanel /></div>
    </dialog>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import PluginDeveloperPanel from './PluginDeveloperPanel.vue'
import PluginHooksPanel from './PluginHooksPanel.vue'
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLDialogElement>()
const closing = ref(false)
onMounted(() => panel.value?.showModal())
async function closePanel() {
  const dialog = panel.value
  if (!dialog?.open || closing.value) return
  closing.value = true
  await nextTick()
  await Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished))
  if (dialog.isConnected && dialog.open) dialog.close()
}
function closeOutside(event: MouseEvent) {
  if (event.target !== panel.value || !panel.value) return
  const { left, right, top, bottom } = panel.value.getBoundingClientRect()
  if (
    event.clientX < left ||
    event.clientX > right ||
    event.clientY < top ||
    event.clientY > bottom
  )
    void closePanel()
}
</script>
<style scoped>
.manager-sheet {
  position: fixed;
  inset: 12px 12px 12px auto;
  width: min(410px, calc(100vw - 24px));
  height: calc(100% - 24px);
  max-width: none;
  max-height: none;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 1px solid var(--td-component-stroke);
  border-radius: 14px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  box-shadow: var(--td-shadow-3);
  overflow: hidden;
  -webkit-app-region: no-drag;
}
.manager-sheet[open] {
  display: flex;
  flex-direction: column;
}
.manager-sheet::backdrop {
  background: rgb(16 22 32 / 35%);
}
@media (prefers-reduced-motion: no-preference) {
  .manager-sheet[open] {
    transform: translateX(0);
    opacity: 1;
    transition:
      transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 180ms ease-out;
  }
  .manager-sheet[open]::backdrop {
    opacity: 1;
    transition: opacity 180ms ease-out;
  }
  @starting-style {
    .manager-sheet[open] {
      transform: translateX(calc(100% + 14px));
      opacity: 0;
    }
    .manager-sheet[open]::backdrop {
      opacity: 0;
    }
  }
  .manager-sheet[open].is-closing {
    transform: translateX(calc(100% + 14px));
    opacity: 0;
    transition:
      transform 180ms cubic-bezier(0.4, 0, 0.8, 0.2),
      opacity 150ms ease-in;
  }
  .manager-sheet[open].is-closing::backdrop {
    opacity: 0;
    transition-duration: 150ms;
  }
}
.sheet-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 22px 18px;
  border-bottom: 1px solid var(--td-component-stroke);
}
.sheet-heading h2 {
  font-size: 20px;
  line-height: 28px;
  margin: 0;
}
.sheet-heading p {
  margin: 4px 0 0;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}
.close-settings {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--td-text-color-secondary);
  cursor: pointer;
}
.close-settings:hover {
  background: var(--td-bg-color-secondarycontainer);
}
.close-settings:focus-visible,
.sheet-body :deep(summary:focus-visible) {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
}
.sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 22px 20px;
  overscroll-behavior: contain;
}
.sheet-body :deep(h3) {
  font-size: 15px;
  line-height: 22px;
  margin: 0 0 4px;
}
.sheet-body :deep(section) {
  padding: 16px 0;
}
.sheet-body :deep(section + section) {
  border-top: 1px solid var(--td-component-stroke);
}
.sheet-body :deep(p[role='alert']),
.sheet-body :deep(p[role='status']) {
  margin: 6px 0;
  line-height: 1.6;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.sheet-body :deep(p[role='alert']) {
  color: var(--td-error-color);
}
</style>
