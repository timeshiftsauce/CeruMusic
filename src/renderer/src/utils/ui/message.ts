import { MessagePlugin } from 'tdesign-vue-next'
import type { MessageInfoOptions, MessageInstance } from 'tdesign-vue-next'

type MessageLevel = 'info' | 'success' | 'warning' | 'error' | 'question' | 'loading'
type MessageMethod = typeof MessagePlugin.info

const DEFAULT_DURATION: Record<MessageLevel, number> = {
  info: 1800,
  success: 1800,
  warning: 1800,
  error: 2200,
  question: 1800,
  loading: 0
}

let installed = false

function isMessageOptions(value: unknown): value is MessageInfoOptions {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeMessage(
  level: MessageLevel,
  message: string | MessageInfoOptions,
  duration?: number
): string | MessageInfoOptions {
  if (level === 'loading') return message

  const finalDuration = duration ?? (isMessageOptions(message) ? message.duration : undefined)
  const base = isMessageOptions(message) ? message : { content: message }

  return {
    ...base,
    closeBtn: base.closeBtn ?? true,
    duration: finalDuration ?? DEFAULT_DURATION[level]
  }
}

function closeOnClick(messagePromise: Promise<MessageInstance>): void {
  messagePromise.then((instance) => {
    const el = instance?.$el as HTMLElement | undefined
    if (!el) return
    el.style.cursor = 'pointer'
    el.addEventListener('click', () => instance.close(), { once: true })
  })
}

function patchLevel(level: MessageLevel): void {
  const original = MessagePlugin[level] as MessageMethod
  ;(MessagePlugin as any)[level] = (
    message: string | MessageInfoOptions,
    duration?: number,
    context?: any
  ) => {
    const promise = original(normalizeMessage(level, message, duration), duration, context)
    if (level !== 'loading') closeOnClick(promise)
    return promise
  }
}

export function installMessageBehavior(): void {
  if (installed) return
  installed = true
  ;(['info', 'success', 'warning', 'error', 'question', 'loading'] as MessageLevel[]).forEach(patchLevel)
}