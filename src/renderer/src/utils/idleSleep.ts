/**
 * 页面闲置休眠机制
 * 连续 IDLE_MS 毫秒无用户交互（鼠标、键盘、滚动、触控）后，
 * 标记为闲置状态，供各动画循环检查并暂停渲染/计算。
 * 检测到任意交互行为后立即唤醒。
 */
const IDLE_MS = 15000

let _isIdle = false
let _idleTimeout: ReturnType<typeof setTimeout> | null = null

/** 内部重置闲置计时器（有交互时调用） */
function _resetIdle(): void {
  const wasIdle = _isIdle
  _isIdle = false
  // 从休眠中唤醒，通知各组件
  if (wasIdle) {
    window.dispatchEvent(new CustomEvent('ceru-wake'))
  }
  if (_idleTimeout !== null) clearTimeout(_idleTimeout)
  _idleTimeout = setTimeout(() => {
    _isIdle = true
    // 进入休眠，通知各组件
    window.dispatchEvent(new CustomEvent('ceru-sleep'))
  }, IDLE_MS)
}

/** 绑定的事件列表 */
const _IDLE_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel'
] as const

/** 保存的 reset 引用，用于卸载时 removeEventListener */
let _boundReset: (() => void) | null = null

/**
 * 查询当前页面是否处于闲置休眠状态
 */
export function isPageIdle(): boolean {
  return _isIdle
}

/**
 * 初始化闲置休眠监听。
 * 通常在 App.vue 的 onMounted 中调用。
 */
export function initIdleSleep(): void {
  if (_boundReset) return // 防止重复初始化
  _boundReset = _resetIdle
  for (const evt of _IDLE_EVENTS) {
    window.addEventListener(evt, _boundReset, { passive: true })
  }
  _resetIdle()
}

/**
 * 销毁闲置休眠监听，清除定时器。
 * 通常在 App.vue 的 onUnmounted 中调用。
 */
export function destroyIdleSleep(): void {
  if (_idleTimeout !== null) {
    clearTimeout(_idleTimeout)
    _idleTimeout = null
  }
  if (_boundReset) {
    for (const evt of _IDLE_EVENTS) {
      window.removeEventListener(evt, _boundReset)
    }
    _boundReset = null
  }
  _isIdle = false
}