import { computed, ref, type ComputedRef } from 'vue'

/**
 * 应用窗口后台状态（最小化 / 隐藏到托盘）。
 *
 * 为什么不能只看 document.hidden：窗口“隐藏到托盘”（win.hide()）时
 * document.visibilityState 不会变化，只有最小化才会。因此以主进程推送的
 * 状态为准，document.hidden 仅作兜底合并。
 */
const mainProcessBackground = ref(false)
const documentHidden = ref(typeof document !== 'undefined' ? document.hidden : false)
let initialized = false

// [诊断] 把渲染层收到的状态回声给主进程日志（排查“托盘不降载”用，定位后可移除）。
function reportDebug(source: string): void {
  try {
    const ipc = (window as unknown as {
      electron?: { ipcRenderer?: { send?: (channel: string, data: unknown) => void } }
    }).electron?.ipcRenderer
    ipc?.send?.('app-window-background-ack', {
      source,
      mainProcessBackground: mainProcessBackground.value,
      documentHidden: documentHidden.value
    })
  } catch {}
}

function ensureInitialized(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  document.addEventListener('visibilitychange', () => {
    documentHidden.value = document.hidden
    reportDebug('visibility')
  })

  const api = (window as unknown as { api?: Record<string, any> }).api
  try {
    const pending = api?.getWindowBackgroundState?.()
    if (pending && typeof pending.then === 'function') {
      pending
        .then((value: boolean) => {
          mainProcessBackground.value = !!value
          reportDebug('init-query')
        })
        .catch(() => {})
    }
  } catch {}
  try {
    api?.onWindowBackgroundChange?.((value: boolean) => {
      mainProcessBackground.value = !!value
      reportDebug('signal')
    })
  } catch {}
  reportDebug('init')
}

/**
 * 窗口是否处于后台（最小化 / 隐藏到托盘 / 页面不可见）。
 * 用于暂停高开销渲染：全屏背景渲染器、音频可视化、AMLL 歌词逐帧动画等。
 */
export function useAppBackground(): { isAppBackground: ComputedRef<boolean> } {
  ensureInitialized()
  const isAppBackground = computed(() => mainProcessBackground.value || documentHidden.value)
  return { isAppBackground }
}
