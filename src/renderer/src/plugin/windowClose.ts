import { desktopBridge } from '@renderer/services/desktopBridge'
import { useSettingsStore } from '@renderer/store/Settings'

/** Shared default for title bar, shortcuts and plugin requests after their operation pipeline. */
export function closeConfiguredWindow(showDialog: () => void = () => {
  window.dispatchEvent(new CustomEvent('ceru-show-close-dialog'))
}): void {
  const settings = useSettingsStore().settings
  if (!settings.hasConfiguredCloseBehavior) {
    showDialog()
    return
  }
  if (settings.closeToTray) desktopBridge.api?.setMiniMode(true)
  else desktopBridge.api?.close()
}
