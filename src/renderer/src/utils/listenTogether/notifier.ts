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
import { describeSticker } from './stickers'

/** 通知冷却窗口（节流粒度，毫秒） */
const COOLDOWN_MS = 4000

/** 缓冲消息上限 —— 超过只展示数量摘要，避免标题过长 */
const BUFFER_LIMIT = 50

/** 单条预览裁剪长度 */
const PREVIEW_MAX = 28

interface NotifierConfig {
  /** 点击通知后触发：把主窗口拉到前台 + 打开一起听浮层 */
  onActivate: () => void
  /**
   * 实时读取用户偏好(每次发通知时调一次,所以 store 改了立即生效)
   *
   * 不直接 import store —— 避免 notifier ↔ ListenTogether store 循环依赖。
   * 由 store init 时把 settings store 的 getter 注入进来。
   */
  getPrefs?: () => {
    /** 是否允许系统通知 —— 关闭后所有通知静默 */
    enableSystemNotify: boolean
    /** 是否启用 @ 强提示(绕过节流 + requireInteraction) —— 关闭后 @ 走普通通道 */
    enableMentionStrong: boolean
  }
}

let config: NotifierConfig | null = null

function readPrefs(): { enableSystemNotify: boolean; enableMentionStrong: boolean } {
  /* 未注入 getPrefs 时默认全开 —— 兼容 store init 之前的极早期调用 */
  return config?.getPrefs?.() ?? { enableSystemNotify: true, enableMentionStrong: true }
}

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

/**
 * 用 WebAudio 合成的提示音 —— 不依赖外部音频文件,也不依赖系统通知自带声音
 *
 * 背景:Electron/Chromium 的 Notification 在 Windows 上即使 silent=false,
 * 没有正确注册 AppUserModelId/SetCurrentProcessExplicitAppUserModelID 时
 * 也常常静音。直接在 renderer 用 WebAudio 合成一个轻量的"叮咚"声(两个
 * 短促正弦音),既能跨平台稳定播放,也避免引入 mp3 资源。
 *
 * 音效设计:
 *  - 第一段 880Hz(高 A) → 第二段 1175Hz(更高 D),50ms 间隔,各 120ms
 *  - 衰减曲线用指数衰减,避免末端 "啪" 一声噪点
 *  - 总音量 0.18,在系统中等音量下大约相当于 QQ 的"叮"
 *
 * 为什么不用 <audio src=base64>:
 *  - 短音效用 base64 体积大、解码延迟明显
 *  - WebAudio 是即时合成,首次触发 < 5ms
 *
 * 注意 AudioContext 必须用户交互后才能 resume(浏览器自动播放策略),
 * 这里在 ensureAudioContext 里 best-effort 调 resume,失败就静默——
 * 用户进了房间总会有点击/键盘交互,等首次能播了之后就稳定了。 */
let audioCtx: AudioContext | null = null

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      audioCtx = new Ctx()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    /* resume 是 promise,失败就丢弃;下次再试 */
    void audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function playBeep(): void {
  const ctx = ensureAudioContext()
  if (!ctx) return
  /* 不再区分 @ / 普通 —— 统一一段"叮咚"双音提示,避免普通消息和 mention
   * 用两种音色让用户分心去辨别。强弱差异交给视觉(标题前缀 [@你] + requireInteraction)。
   * sine 波 RMS 较低,峰值 0.75 在中等系统音量下接近 QQ "叮" 的响度。 */
  const baseVol = 0.75
  const now = ctx.currentTime

  const playTone = (freq: number, start: number, duration: number): void => {
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(baseVol, start + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + duration + 0.02)
    } catch {
      /* 个别浏览器/平台合成失败,静默忽略 */
    }
  }

  playTone(880, now, 0.18) // "叮"
  playTone(1175, now + 0.16, 0.22) // "咚"
}

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
  opts: { requireInteraction?: boolean; force?: boolean } = {}
): Promise<void> {
  /* 用户在设置里关闭系统通知 → 直接静默,不申请权限也不弹窗
   * 例外:force=true 表示这是"强提示通道"(目前用于 @你 / 引用我),
   *      此时无视 enableSystemNotify,这是用户最关心的消息,
   *      只受 enableMentionStrong 控制。 */
  if (!opts.force && !readPrefs().enableSystemNotify) return
  const perm = await ensurePermission()
  if (perm !== 'granted') return

  /* 先播提示音 —— 系统通知本身在 Windows 上 silent=false 也经常无声,
   * 用 WebAudio 自己合成一个,保证用户能听到。
   * 普通消息和 @ 共用同一段声音(不再区分),避免用户分心辨别音色。 */
  playBeep()

  try {
    /* 关键:requireInteraction 默认开 —— 这样通知不会立刻滑进 Windows 操作中心,
     * 而是粘在桌面右下角直到用户点击/关闭。
     *
     * 为什么:Chromium Notification 一旦进入"操作中心",从中心点击多数情况下
     * 不会再触发 renderer 的 onclick(Windows 需要 toast XML + AUMID 注册才能保留),
     * 表现为"普通消息通知点不进软件"。强制 requireInteraction 让通知在弹出阶段
     * 保留焦点窗口,onclick 才能稳定生效。
     *
     * 为了避免一直占着屏幕,普通消息我们在 6s 后程序化 close(),
     * 强提示消息(mention)不自动 close,让它一直挂着。 */
    const sticky = opts.requireInteraction === true
    const n = new Notification(title, {
      body,
      tag, // 同 tag 的通知会覆盖前一条，避免堆叠
      silent: false,
      requireInteraction: true
    })
    n.onclick = () => {
      n.close()
      activate()
    }
    if (!sticky) {
      /* 普通通知:6 秒后自动关闭,既保证可点击,又不会留在桌面太久 */
      setTimeout(() => {
        try {
          n.close()
        } catch {
          /* ignore */
        }
      }, 6000)
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
  /* 贴纸消息的 content 是 sticker id(如 "sticker-5"),原样塞进通知不可读 ——
   * 翻译成 "[贴纸] 等你哦" 这种形式,通知里更直观。 */
  let raw = msg.content || ''
  if (msg.type === 'sticker') {
    raw = `[贴纸] ${describeSticker(raw)}`
  }
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

  /* mention(被 @ 或被引用)走"强提示"快通道:
   *  - 用户开启 enableMentionStrong: 绕过 enableSystemNotify(force=true) + 立即弹 + requireInteraction
   *    意图:用户哪怕关掉了普通系统通知,也要收到 @ 和引用通知
   *  - 用户关闭 enableMentionStrong: 整条静默,不再降级为普通通道
   *    意图:用户明确表达"我不想要 @ 提示",就别再骚扰
   * 普通消息: 受 enableSystemNotify 控制(fireNotification 内部判断) */
  if (ctx.mentionedSelf) {
    if (!readPrefs().enableMentionStrong) return
    void fireNotification(`[@你] ${roomName}`, formatChatPreview(msg), 'lt-chat-mention', {
      requireInteraction: true,
      force: true
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
