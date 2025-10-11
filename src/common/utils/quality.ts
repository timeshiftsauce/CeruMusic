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
