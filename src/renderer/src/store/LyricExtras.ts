import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * LyricExtras —— 歌词附加功能 store
 *
 * 涵盖两类轻量、与现有播放流程解耦的歌词增强：
 *   1) **每曲歌词偏移**(`offsetMap`): 解决某些音源歌词与音频时间轴不对齐的问题。
 *      正值 = 歌词整体提前(感知上"早出现"),负值 = 歌词整体延后。
 *      effectiveTime = currentTime + offset
 *   2) **歌词复制面板**(`copyOverlayVisible`): 右键歌词触发,展示全文 + 多选复制。
 *
 * 这两件事都不属于 GlobalPlayStatus(那里聚焦"播放/歌词来源/评论"),
 * 也不属于 Settings(那里是全局偏好), 所以单独开一个 store。
 *
 * 仅 `offsetMap` 需要持久化 —— 复制面板可见性是临时 UI 状态。
 *
 * ## 容量与生命周期策略
 *
 * 用户可能逐曲调节,如果不加限制 `offsetMap` 只增不减,会:
 *   - 占用 localStorage 配额(浏览器域名总额 ~5MB,要和 Settings/Auth/queue 等共享)
 *   - 每次写入序列化整个 store,map 越大越慢
 *   - 冷数据无意义(三年前听过的一首单曲的偏移)
 *
 * 因此每个 entry 携带 `updatedAt`,并:
 *   - **MAX_ENTRIES = 200** —— 超过时按"最久未更新"裁掉
 *   - **TTL = 90 天** —— 过期项在下一次读/写时自动惰性清理
 *   - 任何时候可主动调 `pruneOffsets()`
 *
 * 数据结构升级时**兼容旧版**: 旧格式是裸 `number`,首次写入时会被
 * `normalizeMap` 升级为 `{ value, updatedAt }`,不会丢用户已调好的偏移。
 */

interface OffsetEntry {
  value: number
  updatedAt: number
}

type OffsetMapRaw = Record<string, OffsetEntry | number>

const MAX_ENTRIES = 200
const TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 天

/**
 * 把 map 转为只含合法 OffsetEntry 的标准化版本,过滤 TTL 过期 / 值为 0 的项。
 * 不会 mutate 输入。
 */
function normalizeMap(raw: OffsetMapRaw, now: number = Date.now()): Record<string, OffsetEntry> {
  const out: Record<string, OffsetEntry> = {}
  for (const k in raw) {
    const v = raw[k]
    if (v === null || v === undefined) continue
    let entry: OffsetEntry
    if (typeof v === 'number') {
      // 旧格式迁移: 没有时间戳, 视为"刚刚更新"以避免立即被 TTL 清掉
      if (v === 0 || !Number.isFinite(v)) continue
      entry = { value: Math.round(v), updatedAt: now }
    } else {
      if (!v || typeof v.value !== 'number' || v.value === 0) continue
      if (typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt)) {
        entry = { value: Math.round(v.value), updatedAt: now }
      } else if (now - v.updatedAt > TTL_MS) {
        // 过期,丢弃
        continue
      } else {
        entry = { value: Math.round(v.value), updatedAt: v.updatedAt }
      }
    }
    out[k] = entry
  }
  return out
}

/**
 * 当 entry 数超过 MAX_ENTRIES 时,按 updatedAt 降序保留最新 MAX_ENTRIES 条。
 */
function enforceCap(map: Record<string, OffsetEntry>): Record<string, OffsetEntry> {
  const keys = Object.keys(map)
  if (keys.length <= MAX_ENTRIES) return map
  const sorted = keys
    .map((k) => [k, map[k].updatedAt] as const)
    .sort((a, b) => b[1] - a[1]) // 新 -> 旧
    .slice(0, MAX_ENTRIES)
  const out: Record<string, OffsetEntry> = {}
  for (const [k] of sorted) out[k] = map[k]
  return out
}

export const useLyricExtrasStore = defineStore(
  'lyricExtras',
  () => {
    /**
     * songmid -> { value: ms 偏移, updatedAt: 写入毫秒时间戳 }
     *
     * 注: 持久化反序列化后可能仍含"旧格式"(裸 number),`getOffset`/`setOffset`
     * 内部透明处理,组件无需关心。下一次写入时整张 map 会自动被 normalize 升级。
     */
    const offsetMap = ref<Record<string, OffsetEntry>>({})

    /** 复制面板显隐 */
    const copyOverlayVisible = ref(false)

    const getOffset = (songmid: string | number | null | undefined): number => {
      if (songmid === null || songmid === undefined || songmid === '') return 0
      const key = String(songmid)
      const raw = (offsetMap.value as OffsetMapRaw)[key]
      if (raw === undefined || raw === null) return 0
      if (typeof raw === 'number') return raw || 0
      // TTL 过期视作不存在(惰性清理交给下次写入)
      if (Number.isFinite(raw.updatedAt) && Date.now() - raw.updatedAt > TTL_MS) return 0
      return raw.value || 0
    }

    const setOffset = (songmid: string | number | null | undefined, ms: number): void => {
      if (songmid === null || songmid === undefined || songmid === '') return
      const key = String(songmid)
      // 限制范围在 ±10s,避免误操作把歌词调到不可恢复的境地
      const clamped = Math.max(-10000, Math.min(10000, Math.round(ms)))
      const now = Date.now()
      // 1) 标准化(顺手丢掉裸 number 旧格式 + TTL 过期项)
      const normalized = normalizeMap(offsetMap.value as OffsetMapRaw, now)
      // 2) 写入或删除当前 key
      if (clamped === 0) {
        delete normalized[key]
      } else {
        normalized[key] = { value: clamped, updatedAt: now }
      }
      // 3) 容量上限(把最久未更新的挤出去)
      const capped = enforceCap(normalized)
      // 4) 整体替换 ref —— 保证 reactivity 触发 + persist 插件订阅到变更
      offsetMap.value = capped
    }

    /**
     * 在当前偏移基础上叠加 delta(ms),并夹到 ±10s。
     */
    const bumpOffset = (songmid: string | number | null | undefined, delta: number): void => {
      setOffset(songmid, getOffset(songmid) + delta)
    }

    const resetOffset = (songmid: string | number | null | undefined): void => {
      setOffset(songmid, 0)
    }

    /**
     * 主动清理过期 / 超量项,返回清理掉的条数。
     * 可绑定到设置页"清理歌词偏移缓存"按钮。
     */
    const pruneOffsets = (): number => {
      const before = Object.keys(offsetMap.value).length
      const normalized = normalizeMap(offsetMap.value as OffsetMapRaw)
      const capped = enforceCap(normalized)
      offsetMap.value = capped
      return before - Object.keys(capped).length
    }

    /**
     * 一键清空所有歌词偏移。
     */
    const clearAllOffsets = (): void => {
      offsetMap.value = {}
    }

    const openCopy = (): void => {
      copyOverlayVisible.value = true
    }
    const closeCopy = (): void => {
      copyOverlayVisible.value = false
    }
    const toggleCopy = (): void => {
      copyOverlayVisible.value = !copyOverlayVisible.value
    }

    return {
      offsetMap,
      copyOverlayVisible,
      getOffset,
      setOffset,
      bumpOffset,
      resetOffset,
      pruneOffsets,
      clearAllOffsets,
      openCopy,
      closeCopy,
      toggleCopy
    }
  },
  {
    /**
     * pinia-plugin-persistedstate@4.x 配置:
     *   - 用 `pick` 指定要持久化的字段(在 4.x 中 `paths` 已废弃且被静默忽略)
     *   - `copyOverlayVisible` 是临时 UI 状态,不持久化
     *   - `key` 显式指定,避免与其他 store 冲突
     */
    persist: {
      key: 'ceru-lyric-extras',
      pick: ['offsetMap']
    }
  }
)
