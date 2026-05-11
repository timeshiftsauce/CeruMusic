/**
 * 一起听系统通知 —— 节流地把聊天 / 待审批事件推到操作系统通知中心
 *
 * 触发条件：仅当窗口不在前台时推送。窗口在前台无论一起听面板是否打开都不打扰
 * （用户可能正在看歌单/设置等其他页面，但既然没切走应用，弹系统通知就是噪音）。
 *
 * 节流策略（类微信）：
 *  - 首条消息：立即弹一次（leading edge）
 *  - 冷却期内（4s）来的后续消息：进入缓冲
 *  - 冷却结束时缓冲非空：合并成 "房间名 · N 条新消息（最近: ...）" 再弹一条
 *  - @你 的消息：绕过节流立即弹，标题前缀 "[@你]"
 *
 * 不在这里做：
 *  - 不直接 import ListenTogether store（会循环依赖）—— 通过 configureNotifier
 *    注入 onActivate 回调（点击通知时调用以打开浮层）
 */

import type { ChatMsg, PendingItem } from './types'

/** 通知冷却窗口（节流粒度，毫秒） */
const COOLDOWN_MS = 4000

/** 缓冲消息上限 —— 超过只展示数量摘要，避免标题过长 */
const BUFFER_LIMIT = 50

/** 单条预览裁剪长度 */
const PREVIEW_MAX = 28

interface NotifierConfig {
  /** 点击通知后触发：把主窗口拉到前台 + 打开一起听浮层 */
  onActivate: () => void
}

let config: NotifierConfig | null = null

/* ---------------- 焦点状态 ---------------- */

let isFocused = true
let initialized = false

function initListeners(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  /* 初始值：document.hasFocus 在 Electron renderer 里可用 */
  isFocused = typeof document !== 'undefined' ? document.hasFocus() : true

  window.addEventListener('focus', () => {
    isFocused = true
  })
  window.addEventListener('blur', () => {
    isFocused = false
  })
  document.addEventListener('visibilitychange', () => {
    /* 窗口被最小化 / 标签隐藏时 visibilityState=hidden，等同于失焦 */
    if (document.visibilityState === 'hidden') isFocused = false
    else if (document.hasFocus()) isFocused = true
  })
}

/* ---------------- 权限 ---------------- */

let permissionPromise: Promise<NotificationPermission> | null = null

async function ensurePermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  if (!permissionPromise) {
    /* 某些平台 requestPermission 可能 reject —— 不 catch 会把 promise 缓存成永久 rejected,
     * 之后 await 全部抛错,白白屏蔽通知。降级为 'denied' 即可静默。 */
    permissionPromise = Notification.requestPermission().catch(
      () => 'denied' as NotificationPermission
    )
  }
  return permissionPromise
}

/* ---------------- 通用底层 ---------------- */

function activate(): void {
  /* 让主进程把窗口拉前台 —— 单走 renderer 的 window.focus() 在以下场景失效:
   *   - 窗口被托盘 hide(closeToTray): focus 无效要先 show
   *   - 窗口最小化: focus 不会还原
   *   - Windows 下窗口被其它应用盖住时 SetForegroundWindow 有限制
   * 主进程的 BrowserWindow.show/restore/focus 系统级权重更高,几乎都能成功。
   * preload 没暴露 api.show 时(老版本)回落到 renderer 自己 focus,起码非
   * hidden 状态下能用。 */
  const w = window as unknown as { api?: { show?: () => void } }
  if (typeof w.api?.show === 'function') {
    try {
      w.api.show()
    } catch {
      /* ignore */
    }
  } else {
    try {
      window.focus()
    } catch {
      /* ignore */
    }
  }
  config?.onActivate?.()
}

async function fireNotification(
  title: string,
  body: string,
  tag: string,
  opts: { requireInteraction?: boolean } = {}
): Promise<void> {
  const perm = await ensurePermission()
  if (perm !== 'granted') return
  try {
    const n = new Notification(title, {
      body,
      tag, // 同 tag 的通知会覆盖前一条，避免堆叠
      silent: false,
      requireInteraction: opts.requireInteraction === true
    })
    n.onclick = () => {
      n.close()
      activate()
    }
  } catch {
    /* 某些环境（Linux 无通知守护进程）会抛错，静默忽略 */
  }
}

/* ---------------- 聊天通知（带节流缓冲） ---------------- */

interface ChatBuffer {
  /** 房间名 —— 取最后一次进入缓冲时的值 */
  roomName: string
  /** 缓冲的消息预览（已格式化的 "昵称: 内容"） */
  items: string[]
}

let chatBuffer: ChatBuffer | null = null
let chatCooldownTimer: ReturnType<typeof setTimeout> | null = null

function formatChatPreview(msg: ChatMsg): string {
  const name = msg.from?.nickname || '某人'
  const raw = msg.content || ''
  const truncated = raw.length > PREVIEW_MAX ? raw.slice(0, PREVIEW_MAX) + '…' : raw
  return `${name}: ${truncated}`
}

function flushChatBuffer(): void {
  chatCooldownTimer = null
  const buf = chatBuffer
  chatBuffer = null
  if (!buf || buf.items.length === 0) return
  const count = buf.items.length
  const last = buf.items[count - 1]
  void fireNotification(`${buf.roomName} · ${count} 条新消息`, `最近：${last}`, 'lt-chat')
}

/**
 * 通知一条聊天消息
 *
 * @param msg 服务端广播的 ChatMsg
 * @param roomName 当前房间名（用作通知标题）
 * @param ctx 上下文：是否被 @
 */
export function notifyChat(msg: ChatMsg, roomName: string, ctx: { mentionedSelf: boolean }): void {
  initListeners()

  /* 在前台 → 不打扰(无论一起听面板开没开) */
  if (isFocused) return

  /* @你 的消息走"强提示"快通道：绕过节流 + 立即弹 + requireInteraction */
  if (ctx.mentionedSelf) {
    void fireNotification(`[@你] ${roomName}`, formatChatPreview(msg), 'lt-chat-mention', {
      requireInteraction: true
    })
    return
  }

  const preview = formatChatPreview(msg)

  if (chatCooldownTimer) {
    /* 冷却中 —— 进缓冲 */
    const buf = chatBuffer ?? (chatBuffer = { roomName, items: [] })
    buf.roomName = roomName
    if (buf.items.length < BUFFER_LIMIT) buf.items.push(preview)
    return
  }

  /* 冷却外 —— 立即弹首条，启动冷却 */
  void fireNotification(roomName, preview, 'lt-chat')
  chatBuffer = { roomName, items: [] }
  chatCooldownTimer = setTimeout(flushChatBuffer, COOLDOWN_MS)
}

/* ---------------- 待审批通知（管理员视角） ---------------- */

interface PendingBuffer {
  roomName: string
  items: string[]
}

let pendingBuffer: PendingBuffer | null = null
let pendingCooldownTimer: ReturnType<typeof setTimeout> | null = null

function formatPendingPreview(item: PendingItem): string {
  const who = item.requesterName || '某人'
  const song = item.song?.name || '?'
  return `${who} 点了《${song}》`
}

function flushPendingBuffer(): void {
  pendingCooldownTimer = null
  const buf = pendingBuffer
  pendingBuffer = null
  if (!buf || buf.items.length === 0) return

  const count = buf.items.length
  const title = `${buf.roomName} · ${count} 条待审批`
  const body = `最近：${buf.items[count - 1]}`
  void fireNotification(title, body, 'lt-pending')
}

/**
 * 通知一批"新增"的待审批点歌请求
 *
 * 调用方负责做 reqId 差量比对，这里只关心展示。
 */
export function notifyPending(newItems: PendingItem[], roomName: string): void {
  initListeners()
  if (newItems.length === 0) return
  if (isFocused) return

  /* 多条新增一次性到达：一次性合并通知，不进缓冲 */
  if (newItems.length > 1) {
    const title = `${roomName} · ${newItems.length} 条待审批`
    const body = `最近：${formatPendingPreview(newItems[newItems.length - 1])}`
    void fireNotification(title, body, 'lt-pending')
    return
  }

  const preview = formatPendingPreview(newItems[0])

  if (pendingCooldownTimer) {
    if (!pendingBuffer) pendingBuffer = { roomName, items: [] }
    pendingBuffer.roomName = roomName
    if (pendingBuffer.items.length < BUFFER_LIMIT) pendingBuffer.items.push(preview)
    return
  }

  void fireNotification(`${roomName} · 新点歌请求`, preview, 'lt-pending')
  pendingBuffer = { roomName, items: [] }
  pendingCooldownTimer = setTimeout(flushPendingBuffer, COOLDOWN_MS)
}

/* ---------------- 配置 / 重置 ---------------- */

/**
 * 注入回调 —— 由 store 在初始化时调用一次
 *
 * 必须用注入而不是 import store，否则会和 store -> notifier 形成循环依赖。
 */
export function configureNotifier(cfg: NotifierConfig): void {
  config = cfg
}

/** 离开房间时清理 —— 避免还在缓冲的消息在新房间里被错误归属 */
export function resetNotifierBuffers(): void {
  if (chatCooldownTimer) {
    clearTimeout(chatCooldownTimer)
    chatCooldownTimer = null
  }
  if (pendingCooldownTimer) {
    clearTimeout(pendingCooldownTimer)
    pendingCooldownTimer = null
  }
  chatBuffer = null
  pendingBuffer = null
}
