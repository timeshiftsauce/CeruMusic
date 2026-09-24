import type { HotkeyAction } from '@common/types/hotkeys'
import { isMediaKeyAccelerator, resolveMediaKeyFromEventKey } from '@common/hotkeyAccelerators'

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
      // 媒体键先归一成 Electron 加速器名（MediaTrackNext → MediaNextTrack 等），录制器才能在下游拒绝它，
      // 预览也显示系统使用的名字。
      // Media keys are normalised into Electron accelerator names first (MediaTrackNext → MediaNextTrack and so on), so the recorder
      // can reject them downstream and the preview shows the name the system uses.
      const mediaKey = resolveMediaKeyFromEventKey(key)
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
      parts.push(mediaKey || map[key] || key)
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
  /**
   * 按下的键是媒体键时触发：媒体键交给系统媒体会话处理，不能注册为全局快捷键
   * （注册会关闭本应用的 SMTC 发布），录制器因此不捕获它。
   * Raised when a media key is pressed: media keys belong to the system media session and cannot be registered as global shortcuts
   * (doing so disables this app's SMTC publishing), so the recorder never captures them.
   */
  onRejected?: () => void
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
    if (isMediaKeyAccelerator(preview)) {
      options.onRejected?.()
      return
    }
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
