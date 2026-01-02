export const QUALITY_ORDER = [
  'master',
  'atmos_plus',
  'atmos',
  'hires',
  'flac24bit',
  'flac',
  '320k',
  '192k',
  '128k'
] as const

export type KnownQuality = (typeof QUALITY_ORDER)[number]
export type QualityInput = KnownQuality | string | { type: string; size?: string }

const DISPLAY_NAME_MAP: Record<string, string> = {
  '128k': '标准',
  '192k': '高品',
  '320k': '超高',
  flac: '无损',
  flac24bit: '超高解析',
  hires: '高清臻音',
  atmos: '全景环绕',
  atmos_plus: '全景增强',
  master: '超清母带'
}

/**
 * 统一获取音质中文显示名称
 */
export function getQualityDisplayName(quality: QualityInput | null | undefined): string {
  if (!quality) return ''
  const type = typeof quality === 'object' ? (quality as any).type : quality
  return DISPLAY_NAME_MAP[type] || String(type || '')
}

/**
 * 比较两个音质优先级（返回负数表示 a 优于 b）
 */
export function compareQuality(aType: string, bType: string): number {
  const ia = QUALITY_ORDER.indexOf(aType as KnownQuality)
  const ib = QUALITY_ORDER.indexOf(bType as KnownQuality)
  const va = ia === -1 ? QUALITY_ORDER.length : ia
  const vb = ib === -1 ? QUALITY_ORDER.length : ib
  return va - vb
}

/**
 * 规范化 types，兼容 string 与 {type,size}
 */
export function normalizeTypes(
  types: Array<string | { type: string; size?: string }> | null | undefined
): string[] {
  if (!types || !Array.isArray(types)) return []
  return types
    .map((t) => (typeof t === 'object' ? (t as any).type : t))
    .filter((t): t is string => Boolean(t))
}

/**
 * 获取数组中最高音质类型
 */
export function getHighestQualityType(
  types: Array<string | { type: string; size?: string }> | null | undefined
): string | null {
  const arr = normalizeTypes(types)
  if (!arr.length) return null
  return arr.sort(compareQuality)[0]
}

/**
 * 构建并按优先级排序的 [{type, size}] 列表
 * 支持传入：
 * - 数组：[{type,size}]
 * - _types 映射：{ [type]: { size } }
 */
export function buildQualityFormats(
  input:
    | Array<{ type: string; size?: string }>
    | Record<string, { size?: string }>
    | null
    | undefined
): Array<{ type: string; size?: string }> {
  if (!input) return []
  let list: Array<{ type: string; size?: string }>
  if (Array.isArray(input)) {
    list = input.map((i) => ({ type: i.type, size: i.size }))
  } else {
    list = Object.keys(input).map((k) => ({ type: k, size: input[k]?.size }))
  }
  return list.sort((a, b) => compareQuality(a.type, b.type))
}

/**
 * 计算最佳匹配音质（降级逻辑）
 * 在可用音质中寻找不高于目标音质的最高音质
 * @param availableTypes 可用音质列表
 * @param targetQuality 目标音质
 * @returns 最佳匹配音质，如果没有匹配则返回 null
 */
export function calculateBestQuality(
  availableTypes: Array<string | { type: string; size?: string }> | null | undefined,
  targetQuality: string
): string | null {
  const normalizedTypes = normalizeTypes(availableTypes)
  if (!normalizedTypes.length) return null

  // 如果包含目标音质，直接返回
  if (normalizedTypes.includes(targetQuality)) return targetQuality

  const targetIndex = QUALITY_ORDER.indexOf(targetQuality as KnownQuality)
  // 如果目标音质未知（不在列表中），则回退到最高可用音质
  if (targetIndex === -1) return getHighestQualityType(normalizedTypes)

  // 筛选出不高于目标音质的选项（索引 >= targetIndex）
  // QUALITY_ORDER 中索引越小音质越高
  const candidates = normalizedTypes.filter((t) => {
    const index = QUALITY_ORDER.indexOf(t as KnownQuality)
    return index !== -1 && index >= targetIndex
  })

  // 如果有候选，返回其中音质最高（索引最小）的
  if (candidates.length > 0) {
    return candidates.sort(compareQuality)[0]
  }

  // 如果所有可用音质都比目标音质高（例如目标是128k，但只有320k），
  // 这种情况下通常应该下载（因为用户的意图通常是“至少这个音质”或者“最好的音质但不要太大”？）
  // 用户需求：“下载hires 可是只有 128k 320k flac 和 master 那么就是下载flac 而不是master 因为master比hires高”
  // 这暗示是向下兼容。
  // 如果只有 Master，而用户选了 128k，是否应该下载 Master？
  // 按照严格的“不高于”逻辑，应该返回 null？或者返回最低的那个？
  // 这里我们假设如果没有更低的，就取现有的最低音质（最接近目标但偏高），或者直接取最高？
  // 通常逻辑是：Available <= Target. Max(Available).
  // If no Available <= Target, then Min(Available) (closest upwards)? or null?
  // 用户例子：Target=HiRes. Avail=[Master, Flac]. Master > HiRes, Flac < HiRes. Choose Flac.
  // 假如 Target=128k. Avail=[320k]. 320k > 128k. No <= 128k.
  // 这种情况下，下载 320k 是合理的（比起不下载）。
  // 所以如果 candidates 为空，说明所有可用音质都高于目标音质。
  // 此时返回可用音质中最低的（最接近目标）？或者最高的？
  // 如果用户为了省流量选 128k，结果下载了 Master (100MB)，可能会生气。
  // 但如果用户选了 Master，只有 128k，肯定下载 128k。
  // 让我们暂时遵循“向下寻找”，如果没有，则“向上寻找最接近的”（即可用音质中最低的）。

  // 重新排序所有可用音质，取索引最大的（音质最低的）
  return normalizedTypes.sort(compareQuality)[normalizedTypes.length - 1]
}
