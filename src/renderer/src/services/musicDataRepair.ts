import { h } from 'vue'
import { DialogPlugin, Checkbox, Button } from 'tdesign-vue-next'
import {
  MUSIC_STORAGE_KEYS,
  MUSIC_SHADOW_PREFIX,
  repairBrowserMusicData
} from '@common/musicDataMigration'
import { setMusicDataPersistence } from './musicDataPersistence'

const allKeys = [
  ...MUSIC_STORAGE_KEYS,
  ...MUSIC_STORAGE_KEYS.map((key) => MUSIC_SHADOW_PREFIX + key),
  'ceru-music-data-version'
]
const snapshot = () => Object.fromEntries(allKeys.map((key) => [key, localStorage.getItem(key)]))
const restore = (values: Record<string, string | null>) => {
  for (const [key, value] of Object.entries(values))
    value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
}

let baseline: { raw: Record<string, string | null>; inspection: any } | undefined
export async function inspectMusicDataAtStartup() {
  const raw = snapshot()
  try {
    baseline = { raw, inspection: await window.api.musicDataRepair.inspect() }
  } catch (error) {
    // Keep writes blocked, but allow welcome and the application shell to render.
    console.error('音乐数据检查失败，将在欢迎页结束后报告:', error)
  }
}

export async function coordinateMusicDataRepair(force = false): Promise<boolean> {
  const api = window.api.musicDataRepair
  setMusicDataPersistence(false)
  let resumeWrites = false
  let rehydrate = false
  try {
    let inspection = await api.inspect()
    if (inspection.pending) {
      const original = await api.rollback()
      if (original) {
        restore(original)
        await api.rollbackComplete()
        rehydrate = true
      }
      inspection = await api.inspect()
    }
    const original = snapshot()
    const detection = !force && baseline ? baseline : { raw: original, inspection }
    const hasData =
      MUSIC_STORAGE_KEYS.some((key) => detection.raw[key] != null) ||
      detection.inspection.playlists > 0 ||
      detection.inspection.legacyDirectories.length > 0
    const needsRepair = original['ceru-music-data-version'] !== '2' || inspection.needsRepair
    if (!force && !needsRepair) {
      resumeWrites = true
      return rehydrate
    }
    if (!hasData) {
      // A fresh profile needs no user-data migration or dialog.
      localStorage.setItem('ceru-music-data-version', '2')
      resumeWrites = true
      return rehydrate
    }
    const count = (key: string) => {
      try {
        const value = JSON.parse(original[MUSIC_SHADOW_PREFIX + key] ?? original[key] ?? '[]')
        return Array.isArray(value) ? value.length : 0
      } catch {
        return 0
      }
    }
    let savedHistory = 0
    try {
      savedHistory =
        JSON.parse(
          original[MUSIC_SHADOW_PREFIX + 'globalPlayStatus'] ?? original.globalPlayStatus ?? '{}'
        ).history?.length || 0
    } catch {
      /* The migration reports malformed records. */
    }
    const choice = await promptRepair({
      snapshot: original.globalPlayStatus ? 1 : 0,
      queue: count('songList'),
      history: savedHistory + count('ceru-plugin-playback-history-v1'),
      playlists: inspection.playlists,
      recoveryCandidates: inspection.recoveryCandidates || []
    })
    if (!choice.accepted) {
      resumeWrites = true
      return rehydrate
    }
    let result: any
    let committed = false
    try {
      result = await api.begin(original, choice.restoreMissing)
      const repaired = repairBrowserMusicData(original, result.songs)
      restore(repaired.values)
      for (const key of MUSIC_STORAGE_KEYS) localStorage.removeItem(MUSIC_SHADOW_PREFIX + key)
      localStorage.removeItem('ceru-plugin-playback-history-v1')
      localStorage.setItem('ceru-music-data-version', '2')
      // Read back before committing the cross-store journal.
      for (const [key, value] of Object.entries(repaired.values)) {
        if (localStorage.getItem(key) !== value) throw new Error('音乐数据写入校验失败')
      }
      await api.finish()
      committed = true
      resumeWrites = true
      await showRepairResult({
        ...result,
        songs: undefined,
        fixed: result.fixed + repaired.fixed,
        issues: [...result.issues, ...repaired.issues]
      })
      return true
    } catch (error) {
      if (committed) throw error
      const rollback = await api.rollback()
      restore(rollback ?? original)
      await api.rollbackComplete()
      resumeWrites = true
      await showRepairResult({ error: String(error), directory: result?.directory })
      return rehydrate
    }
  } finally {
    setMusicDataPersistence(resumeWrites)
  }
}

export async function openMusicDataRepair(): Promise<void> {
  // Start at the bootstrap gate, before components can overwrite a repaired snapshot.
  sessionStorage.setItem('ceru-open-music-repair', '1')
  location.reload()
}

function promptRepair(counts: any): Promise<{ accepted: boolean; restoreMissing: boolean }> {
  return new Promise((resolve) => {
    let restoreMissing = false
    const dialog = DialogPlugin.confirm({
      header: '发现旧版音乐数据，是否备份并修复？',
      body: () =>
        h('div', [
          h(
            'p',
            `当前歌曲快照：${counts.snapshot}；播放队列：${counts.queue} 首；历史：${counts.history} 首；歌单：${counts.playlists} 个。`
          ),
          h('p', '修复保留歌曲、顺序和云端关联，只处理本地数据。原始数据将完整备份。'),
          ...(counts.recoveryCandidates.length
            ? [
                h(
                  'p',
                  `旧备份另有 ${counts.recoveryCandidates.length} 首可能缺失的歌曲，默认不恢复：`
                ),
                h(
                  'div',
                  { style: 'max-height:160px;overflow:auto' },
                  counts.recoveryCandidates.map((song: any) =>
                    h(
                      'p',
                      `${song.playlist}：${song.name || '未知歌曲'} — ${song.singer || '未知歌手'}`
                    )
                  )
                ),
                h(
                  Checkbox,
                  {
                    onChange: (checked: any) => {
                      restoreMissing = !!checked
                    }
                  },
                  () => '恢复以上歌曲（可能包含主动删除的歌曲）'
                )
              ]
            : [])
        ]),
      confirmBtn: '立即修复',
      cancelBtn: '稍后',
      closeOnOverlayClick: false,
      onConfirm: () => {
        dialog.destroy()
        resolve({ accepted: true, restoreMissing })
      },
      onClose: () => {
        dialog.destroy()
        resolve({ accepted: false, restoreMissing: false })
      }
    })
  })
}
function showRepairResult(result: any): Promise<void> {
  return new Promise((resolve) => {
    const dialog = DialogPlugin.alert({
      header: result.error ? '修复未完成，原数据已保留' : '本地音乐数据修复完成',
      body: () =>
        h('div', [
          h('p', result.error ? String(result.error) : `已处理 ${result.fixed} 条歌曲记录。`),
          ...(result.issues || []).map((issue: string) => h('p', issue)),
          ...(result.directory
            ? [
                h('p', `备份位置：${result.directory}`),
                h(
                  Button,
                  { variant: 'outline', onClick: () => window.api.musicDataRepair.openBackup() },
                  () => '打开备份目录'
                )
              ]
            : [])
        ]),
      confirmBtn: '完成',
      closeOnOverlayClick: false,
      onConfirm: () => {
        dialog.destroy()
        resolve()
      },
      onClose: () => {
        dialog.destroy()
        resolve()
      }
    })
  })
}
