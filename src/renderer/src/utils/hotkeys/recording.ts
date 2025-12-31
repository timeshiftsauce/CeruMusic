import type { HotkeyAction } from '@common/types/hotkeys'

export type RecordingState = {
  visible: boolean
  action: HotkeyAction | null
  preview: string
}

const isOnlyModifier = (key: string) => {
  return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta'
}

const normalizeKeyPart = (e: KeyboardEvent): string => {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  const key = e.key
  if (!isOnlyModifier(key)) {
    if (key.length === 1) {
      parts.push(key.toUpperCase())
    } else {
      const map: Record<string, string> = {
        ' ': 'Space',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        Escape: 'Esc',
        Enter: 'Enter',
        Tab: 'Tab',
        Backspace: 'Backspace',
        Delete: 'Delete',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        Insert: 'Insert'
      }
      parts.push(map[key] || key)
    }
  }
  return parts.join('+')
}

export function acceleratorToDisplay(acc: string): string {
  const v = (acc || '').trim()
  if (!v) return '未设置'
  return v.replaceAll('CommandOrControl', 'Ctrl')
}

export function isCompleteAccelerator(acc: string): boolean {
  if (!acc) return false
  const segs = acc.split('+').filter(Boolean)
  if (segs.length === 0) return false
  const last = segs[segs.length - 1]
  if (last === 'Alt' || last === 'Shift' || last === 'CommandOrControl') return false
  return true
}

export function createHotkeyRecorder(options: {
  onPreviewChange: (preview: string) => void
  onCapture: (acc: string) => void
  onCancel: () => void
}) {
  const onKeyDown = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      options.onCancel()
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      options.onCapture('')
      return
    }

    const preview = normalizeKeyPart(e)
    options.onPreviewChange(preview)
    if (isCompleteAccelerator(preview)) {
      options.onCapture(preview)
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    const preview = normalizeKeyPart(e)
    options.onPreviewChange(preview)
  }

  const mount = () => {
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
  }
  const unmount = () => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
  }

  return { mount, unmount }
}
