<template>
  <!-- 拖拽安装插件：只负责把文件路径交给主进程排队，安装流程仍走现有的
       prepareExternal / commitExternal，与「添加插件 → 本地导入」完全一致。 -->
  <div v-if="dragging" class="plugin-drop-overlay" role="status" aria-live="polite">
    <div class="plugin-drop-card">
      <t-icon name="upload" size="42px" />
      <p class="plugin-drop-title">松开即可安装插件</p>
      <p class="plugin-drop-hint">支持单个或多个 .js 文件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const dragging = ref(false)
// dragenter/dragleave 会在子元素之间连续触发，用计数器判断是否真的离开窗口。
let depth = 0
let queueing = false

function hasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return !!types && Array.from(types).includes('Files')
}

function reset() {
  depth = 0
  dragging.value = false
}

function onDragEnter(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  depth += 1
  dragging.value = true
}

function onDragOver(event: DragEvent) {
  if (!hasFiles(event)) return
  // 阻止 Chromium 默认行为：否则松手会把窗口导航到拖入的 file:// 地址。
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dragging.value = true
}

function onDragLeave(event: DragEvent) {
  if (!hasFiles(event)) return
  depth = Math.max(0, depth - 1)
  if (depth === 0) dragging.value = false
}

function pathOf(file: File): string {
  const webUtils = (window as any).electron?.webUtils
  const resolved = webUtils?.getPathForFile?.(file)
  if (typeof resolved === 'string' && resolved) return resolved
  const legacy = (file as any).path
  return typeof legacy === 'string' ? legacy : ''
}

async function onDrop(event: DragEvent) {
  if (!hasFiles(event)) return
  event.preventDefault()
  reset()
  if (queueing) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  const plugins = files.filter((file) => /\.js$/i.test(file.name))
  if (!plugins.length) {
    MessagePlugin.error('只能添加 .js 插件文件，请拖入插件文件')
    return
  }
  if (plugins.length < files.length)
    MessagePlugin.warning(`已忽略 ${files.length - plugins.length} 个非 .js 文件`)
  queueing = true
  try {
    let pathFailed = false
    for (const file of plugins) {
      const filePath = pathOf(file)
      if (!filePath) {
        pathFailed = true
        continue
      }
      try {
        await window.api.plugins.queueExternalFile(filePath)
      } catch (error: any) {
        MessagePlugin.error(error?.message || `无法添加 ${file.name}`)
      }
    }
    if (pathFailed) MessagePlugin.error('无法读取拖入文件的路径，请改用“添加插件”按钮')
  } finally {
    queueing = false
  }
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  window.addEventListener('dragend', reset)
  window.addEventListener('blur', reset)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('dragend', reset)
  window.removeEventListener('blur', reset)
})
</script>

<style scoped lang="scss">
.plugin-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* 只做视觉提示：不拦截指针，避免影响拖拽过程中的其它交互判定 */
  pointer-events: none;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.plugin-drop-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 48px;
  border: 2px dashed var(--td-brand-color, #03de6d);
  border-radius: 16px;
  color: var(--td-brand-color, #03de6d);
  background: var(--td-bg-color-container, #fff);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
}

.plugin-drop-title {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.plugin-drop-hint {
  margin: 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>
