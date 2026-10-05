/**
 * 缓存淘汰打分：LFU + LRU 混合。
 *
 * 纯 LRU 的缺陷：刚点开一次的老歌会排在「听了 20 次但上周听的歌」后面，
 * 把真正的常听曲目挤掉。加入命中次数后可显著降低高频歌曲被误删的概率。
 *
 * 音频文件缓存（JSON 索引）与歌词/封面缓存（SQLite）共用这套规则，
 * 保证两类缓存的淘汰口径一致。
 */

/** 使用频率权重：越大越看重「听得多」 */
export const FREQ_WEIGHT = 0.6
/** 最近访问权重：越大越看重「最近听过」 */
export const RECENCY_WEIGHT = 0.4

export interface EvictionInput {
  /** 命中次数 */
  hits: number
  /** 最后访问时间（毫秒时间戳） */
  lastAccess: number
}

/**
 * 为一组候选条目计算淘汰分数，**分数越低越先被淘汰**。
 *
 * score = FREQ_WEIGHT * normalizedHits + RECENCY_WEIGHT * normalizedRecency
 *
 * 两项各自归一化到 [0,1] 后再相加 —— 命中次数是无上限计数、时间是
 * 毫秒时间戳，量纲完全不同，不归一化无法比较。
 */
export function computeEvictionScores<T extends EvictionInput>(
  items: readonly T[]
): Map<T, number> {
  const scores = new Map<T, number>()
  if (!items.length) return scores

  let maxHits = 0
  let minTime = Infinity
  let maxTime = -Infinity
  for (const item of items) {
    if (item.hits > maxHits) maxHits = item.hits
    if (item.lastAccess < minTime) minTime = item.lastAccess
    if (item.lastAccess > maxTime) maxTime = item.lastAccess
  }

  const timeSpan = maxTime - minTime
  for (const item of items) {
    // 所有条目都没被命中过时，频率维度退化为 0，等效纯 LRU
    const freqScore = maxHits > 0 ? item.hits / maxHits : 0
    const recencyScore = timeSpan > 0 ? (item.lastAccess - minTime) / timeSpan : 1
    scores.set(item, FREQ_WEIGHT * freqScore + RECENCY_WEIGHT * recencyScore)
  }
  return scores
}

/** 按淘汰分数升序排列（最先被淘汰的在前） */
export function sortByEvictionPriority<T extends EvictionInput>(items: readonly T[]): T[] {
  const scores = computeEvictionScores(items)
  return [...items].sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0))
}
