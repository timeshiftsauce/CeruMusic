import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useAuthStore } from './Auth'
import {
  notificationsAPI,
  type InboxMessage,
  type MessageCategory,
  type UnreadCounts
} from '@renderer/api/notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const account = computed(() => (auth.isAuthenticated ? auth.user?.sub || '' : ''))
  const open = ref(false)
  const category = ref<MessageCategory>('all')
  const items = ref<InboxMessage[]>([])
  // Visual memory for this drawer opening, independent of persisted receipts.
  const sessionNewIds = ref(new Set<string>())
  const counts = ref<UnreadCounts>({ all: 0, notice: 0, interaction: 0, comment: 0 })
  const loading = ref(false)
  const clearing = ref(false)
  const error = ref('')
  const syncError = ref('')
  const nextCursor = ref<string | null>(null)
  const pending = new Map<string, InboxMessage>()
  let generation = 0,
    feedVersion = 0,
    countVersion = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let flushing: Promise<boolean> | null = null

  function scheduleFlush(delay = 800) {
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined
        void flushRead()
      }, delay)
  }

  function markRead(messages: InboxMessage[]) {
    for (const message of messages) {
      if (message.read || pending.has(message.id)) continue
      if (open.value && message.category !== 'notice') sessionNewIds.value.add(message.id)
      message.read = true
      pending.set(message.id, message)
      counts.value.all = Math.max(0, counts.value.all - 1)
      counts.value[message.category] = Math.max(0, counts.value[message.category] - 1)
    }
    countVersion++
    if (pending.size) scheduleFlush()
  }

  async function flushRead(): Promise<boolean> {
    if (flushing) return flushing
    clearTimeout(timer)
    timer = undefined
    if (!account.value || !pending.size) return true
    const session = generation
    const task = (async () => {
      try {
        while (session === generation && pending.size) {
          const ids = [...pending.keys()].slice(0, 100)
          await notificationsAPI.read(ids)
          if (session !== generation) return false
          ids.forEach((id) => pending.delete(id))
          countVersion++
        }
        syncError.value = ''
        return true
      } catch {
        if (session === generation) {
          syncError.value = '已读状态暂未同步，将自动重试'
          scheduleFlush(5000)
        }
        return false
      }
    })()
    flushing = task
    try {
      return await task
    } finally {
      if (flushing === task) flushing = null
    }
  }

  async function refreshCounts() {
    if (!account.value || flushing) return false
    const session = generation,
      version = countVersion
    try {
      const result = await notificationsAPI.counts()
      if (session !== generation || version !== countVersion || flushing) return false
      for (const message of pending.values()) {
        result.all = Math.max(0, result.all - 1)
        result[message.category] = Math.max(0, result[message.category] - 1)
      }
      counts.value = result
      return true
    } catch {
      return false
    }
  }

  async function synchronize(): Promise<boolean> {
    const session = generation
    if (flushing) await flushing
    if (!account.value || session !== generation) return false
    const countsSynced = await refreshCounts()
    if (session !== generation) return false
    if (!open.value) return countsSynced
    if (loading.value || clearing.value) return false
    const version = feedVersion
    const filter = category.value
    // Refresh the loaded window without clearing it or leaving a pagination
    // gap when many notifications arrived offline. Older rows remain pageable.
    const target = Math.max(30, items.value.length)
    const fresh: InboxMessage[] = []
    let cursor: string | null = null
    try {
      do {
        const page = await notificationsAPI.list(filter, cursor || undefined)
        if (session !== generation || version !== feedVersion || !open.value) return false
        fresh.push(...page.items)
        if (cursor && page.nextCursor === cursor) return false
        cursor = page.nextCursor
      } while (cursor && fresh.length < target)
      const alreadyRead = new Set(items.value.filter((item) => item.read).map((item) => item.id))
      const seen = new Set<string>()
      items.value = fresh.filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        if (pending.has(item.id) || alreadyRead.has(item.id)) item.read = true
        return true
      })
      nextCursor.value = cursor
      markRead(items.value.filter((item) => item.category !== 'notice'))
      return countsSynced
    } catch {
      return false
    }
  }

  async function load(reset = false) {
    if (!account.value || (!reset && (loading.value || !nextCursor.value))) return
    const version = ++feedVersion,
      session = generation,
      filter = category.value
    loading.value = true
    error.value = ''
    if (reset) {
      items.value = []
      nextCursor.value = null
    }
    try {
      const result = await notificationsAPI.list(
        filter,
        reset ? undefined : nextCursor.value || undefined
      )
      if (session !== generation || version !== feedVersion) return
      result.items.forEach((item) => {
        if (pending.has(item.id)) item.read = true
      })
      const known = new Set(items.value.map((item) => item.id))
      items.value.push(...result.items.filter((item) => !known.has(item.id)))
      nextCursor.value = result.nextCursor
      // Only this loaded batch is marked; later pages and announcements stay unread.
      if (open.value) markRead(items.value.filter((item) => item.category !== 'notice'))
    } catch {
      if (session === generation && version === feedVersion) error.value = '消息加载失败，请重试'
    } finally {
      if (session === generation && version === feedVersion) loading.value = false
    }
  }

  async function clearRead() {
    if (clearing.value) return false
    clearing.value = true
    const session = generation
    try {
      if (!(await flushRead()) || session !== generation) return false
      await notificationsAPI.clear()
      if (session !== generation) return false
      await load(true)
      await refreshCounts()
      return true
    } catch {
      error.value = '清理失败，请重试'
      return false
    } finally {
      if (session === generation) clearing.value = false
    }
  }

  watch(
    account,
    () => {
      generation++
      feedVersion++
      countVersion++
      clearTimeout(timer)
      timer = undefined
      flushing = null
      pending.clear()
      sessionNewIds.value.clear()
      open.value = false
      items.value = []
      nextCursor.value = null
      loading.value = false
      clearing.value = false
      error.value = ''
      syncError.value = ''
      counts.value = { all: 0, notice: 0, interaction: 0, comment: 0 }
      void refreshCounts()
    },
    { immediate: true }
  )
  watch(open, (value) => {
    if (value) {
      void refreshCounts()
      void load(true)
    } else {
      sessionNewIds.value.clear()
      feedVersion++
      loading.value = false
      void flushRead()
    }
  })
  watch(category, () => {
    if (open.value) void load(true)
  })
  return {
    account,
    open,
    category,
    items,
    sessionNewIds,
    counts,
    loading,
    clearing,
    error,
    syncError,
    nextCursor,
    markRead,
    flushRead,
    refreshCounts,
    synchronize,
    load,
    clearRead
  }
})
