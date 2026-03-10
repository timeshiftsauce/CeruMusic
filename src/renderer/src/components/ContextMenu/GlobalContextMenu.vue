<template>
  <ContextMenu v-model:visible="visible" :position="position" :items="items" @close="handleClose" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import ContextMenu from './ContextMenu.vue'
import { ContextMenuItem, ContextMenuPosition } from './types'
import { CutIcon, CopyIcon, PasteIcon, CheckDoubleIcon } from 'tdesign-icons-vue-next'

const visible = ref(false)
const position = ref<ContextMenuPosition>({ x: 0, y: 0 })
const items = ref<ContextMenuItem[]>([])
let targetElement: HTMLElement | null = null

const handleClose = () => {
  visible.value = false
  targetElement = null
}

const restoreFocus = () => {
  if (targetElement) {
    targetElement.focus()
  }
}

const handleContextMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  // Check if the target is an input field or contenteditable
  const isInput =
    target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  // If it's an input field, show our custom menu
  if (isInput && !target.getAttribute('disabled')) {
    e.preventDefault()
    targetElement = target

    // Cast to input element to access value and selection properties
    const inputElement = target as HTMLInputElement | HTMLTextAreaElement
    const isReadonly = target.getAttribute('readonly') !== null

    // Get selection text
    let selection = ''
    if (window.getSelection()?.toString()) {
      selection = window.getSelection()!.toString()
    } else if (
      inputElement.value &&
      typeof inputElement.selectionStart === 'number' &&
      typeof inputElement.selectionEnd === 'number'
    ) {
      selection = inputElement.value.substring(
        inputElement.selectionStart,
        inputElement.selectionEnd
      )
    }

    const hasSelection = selection.length > 0

    items.value = [
      {
        id: 'cut',
        label: '剪切',
        icon: CutIcon,
        disabled: isReadonly || !hasSelection,
        onClick: () => {
          restoreFocus()
          document.execCommand('cut')
        }
      },
      {
        id: 'copy',
        label: '复制',
        icon: CopyIcon,
        disabled: !hasSelection,
        onClick: () => {
          restoreFocus()
          document.execCommand('copy')
        }
      },
      {
        id: 'paste',
        label: '粘贴',
        icon: PasteIcon,
        disabled: isReadonly,
        onClick: async () => {
          restoreFocus()
          try {
            const text = await navigator.clipboard.readText()
            if (text) {
              if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                const input = target as HTMLInputElement | HTMLTextAreaElement

                // Focus first
                input.focus()

                // Try execCommand first
                const success = document.execCommand('insertText', false, text)

                if (!success) {
                  // Fallback to manual insertion
                  const start = input.selectionStart || 0
                  const end = input.selectionEnd || 0
                  const val = input.value
                  input.value = val.slice(0, start) + text + val.slice(end)
                  input.selectionStart = input.selectionEnd = start + text.length
                  input.dispatchEvent(new Event('input', { bubbles: true }))
                }
              } else {
                document.execCommand('paste')
              }
            }
          } catch (err) {
            console.error('Failed to paste:', err)
          }
        }
      },
      {
        id: 'separator',
        separator: true
      },
      {
        id: 'select-all',
        label: '全选',
        icon: CheckDoubleIcon,
        onClick: () => {
          restoreFocus()
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            ;(target as HTMLInputElement).select()
          } else {
            document.execCommand('selectAll')
          }
        }
      }
    ]

    position.value = { x: e.clientX, y: e.clientY }
    visible.value = true
  }
}

onMounted(() => {
  window.addEventListener('contextmenu', handleContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('contextmenu', handleContextMenu)
})
</script>
