import { readonly, ref } from 'vue'

export interface AppWindowState {
  visible: boolean
  focused: boolean
  minimized: boolean
  hidden: boolean
  fullscreen: boolean
}

const fallbackState = (): AppWindowState => ({
  visible: !document.hidden,
  focused: typeof document.hasFocus === 'function' ? document.hasFocus() : true,
  minimized: false,
  hidden: document.hidden,
  fullscreen: false
})

const state = ref<AppWindowState>(fallbackState())
let unsubscribeMainState: (() => void) | null = null
let visibilityFallbackHandler: (() => void) | null = null

const applyState = (next: Partial<AppWindowState>) => {
  const previousVisible = isAppWindowVisible()
  const hidden = next.hidden ?? (next.visible === false ? true : state.value.hidden)
  state.value = {
    ...state.value,
    ...next,
    hidden
  }
  window.dispatchEvent(new CustomEvent('ceru-window-state-change', { detail: state.value }))
  const currentVisible = isAppWindowVisible()
  if (previousVisible !== currentVisible) {
    window.dispatchEvent(new CustomEvent(currentVisible ? 'ceru-wake' : 'ceru-sleep'))
  }
}

export const appWindowState = readonly(state)

export const isAppWindowVisible = (): boolean => {
  const current = state.value
  return current.visible && !current.hidden && !current.minimized && !document.hidden
}

export const isAppWindowActive = (): boolean => {
  return isAppWindowVisible() && state.value.focused
}

export const initAppWindowState = async (): Promise<void> => {
  if (unsubscribeMainState) return

  visibilityFallbackHandler = () => {
    applyState({ hidden: document.hidden, visible: !document.hidden })
  }
  document.addEventListener('visibilitychange', visibilityFallbackHandler)

  const appApi = (window as any).api?.app
  if (appApi?.onWindowStateChanged) {
    unsubscribeMainState = appApi.onWindowStateChanged((next: AppWindowState) => applyState(next))
  }
  if (appApi?.getWindowState) {
    try {
      const next = await appApi.getWindowState()
      if (next) applyState(next)
    } catch {}
  }
}

export const destroyAppWindowState = (): void => {
  unsubscribeMainState?.()
  unsubscribeMainState = null
  if (visibilityFallbackHandler) {
    document.removeEventListener('visibilitychange', visibilityFallbackHandler)
    visibilityFallbackHandler = null
  }
}