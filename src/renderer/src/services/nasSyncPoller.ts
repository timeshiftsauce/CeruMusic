import { canUseNasSync, getNasSyncLastRevision, nasSyncAPI, setNasSyncLastRevision } from '@renderer/api/nasSync'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { isAppWindowVisible } from '@renderer/utils/appWindowState'

const ACTIVE_INTERVAL_MS = 60_000
const BACKGROUND_INTERVAL_MS = 300_000
const ERROR_BACKOFF_MS = 120_000
const NAS_SYNC_SERVICE_NAME = 'NAS 多端同步'

let timer: number | null = null
let running = false
let stopped = true

type NasSyncEvent = {
  revision?: number
  entityType?: string
  entityId?: string
  action?: string
  payload?: any
  createdAt?: string
  deletedAt?: string | null
}

const clearTimer = () => {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

const getNextInterval = () => {
  const audioStore = ControlAudioStore()
  if (!isAppWindowVisible()) return BACKGROUND_INTERVAL_MS
  if (audioStore.Audio.isPlay) return ACTIVE_INTERVAL_MS
  return ACTIVE_INTERVAL_MS
}

const scheduleNext = (delay = getNextInterval()) => {
  clearTimer()
  if (stopped) return
  timer = window.setTimeout(() => {
    void pollNasSync()
  }, delay)
}

const notifySyncEvents = (events: unknown[], revision: number) => {
  window.dispatchEvent(
    new CustomEvent('ceru-nas-sync-events', {
      detail: { events, revision }
    })
  )
  window.dispatchEvent(new Event('playlist-updated'))
}

const summarizeNasSyncEvent = (event: NasSyncEvent) => {
  const payload = event.payload || {}
  const revisionText = typeof event.revision === 'number' ? `#${event.revision}` : '-'

  if (event.entityType === 'playlist') {
    const playlistName = payload.title || payload.name || event.entityId || '未命名歌单'
    if (event.action === 'delete') {
      return `[同步事件 ${revisionText}] 歌单已删除: ${playlistName}`
    }
    return `[同步事件 ${revisionText}] 歌单已更新: ${playlistName}`
  }

  if (event.entityType === 'playlistSongs') {
    const playlistId = payload.playlistId || event.entityId || '未知歌单'
    if (event.action === 'delete') {
      const removedCount = Array.isArray(payload.songIds) ? payload.songIds.length : 0
      return `[同步事件 ${revisionText}] 歌单歌曲已减少: ${playlistId}，删除 ${removedCount} 首`
    }
    if (event.action === 'upsert') {
      const addedCount = Array.isArray(payload.songs) ? payload.songs.length : 0
      return `[同步事件 ${revisionText}] 歌单歌曲已变更: ${playlistId}，同步 ${addedCount} 首`
    }
  }

  if (event.entityType === 'favorite') {
    if (event.action === 'delete') {
      return `[同步事件 ${revisionText}] 收藏歌单已取消收藏`
    }
    return `[同步事件 ${revisionText}] 收藏歌单已同步`
  }

  return `[同步事件 ${revisionText}] ${event.entityType || 'unknown'}:${event.action || 'unknown'}`
}

const appendNasSyncLogs = async (events: unknown[]) => {
  const plugins = await window.api.plugins.loadAllPlugins().catch(() => [])
  if (!Array.isArray(plugins)) return

  const plugin = plugins.find(
    (item: any) => item?.pluginType === 'service' && item?.serviceRole === 'nas-sync'
  )
  if (!plugin?.pluginId) return

  for (const rawEvent of events) {
    const event = rawEvent as NasSyncEvent
    const message = summarizeNasSyncEvent(event)
    await window.api.plugins
      .appendPluginLog(plugin.pluginId, 'info', NAS_SYNC_SERVICE_NAME, message)
      .catch(() => {})
  }
}

const pollNasSync = async () => {
  if (stopped || running) return
  running = true
  try {
    if (!(await canUseNasSync())) {
      scheduleNext(BACKGROUND_INTERVAL_MS)
      return
    }

    const sinceRevision = getNasSyncLastRevision()
    const result = await nasSyncAPI.sync(sinceRevision)
    if (typeof result.revision === 'number') {
      setNasSyncLastRevision(result.revision)
    }

    if (Array.isArray(result.events) && result.events.length > 0) {
      await appendNasSyncLogs(result.events)
      notifySyncEvents(result.events, result.revision)
    }

    scheduleNext()
  } catch (error) {
    console.warn('[nas-sync] poll failed:', error)
    scheduleNext(ERROR_BACKOFF_MS)
  } finally {
    running = false
  }
}

const reschedule = () => {
  if (stopped) return
  scheduleNext()
}

export const startNasSyncPoller = () => {
  if (!stopped) return
  stopped = false
  window.addEventListener('ceru-window-state-change', reschedule)
  document.addEventListener('visibilitychange', reschedule)
  scheduleNext(5_000)
}

export const stopNasSyncPoller = () => {
  stopped = true
  clearTimer()
  window.removeEventListener('ceru-window-state-change', reschedule)
  document.removeEventListener('visibilitychange', reschedule)
}
