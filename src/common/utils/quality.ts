import { compareQualities, selectQuality } from '@shiqianjiang/ceru-plugin-sdk/quality'
export type QualityInput = string | { type: string; size?: string }

export function formatQualitySize(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return ''
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3)
  return `${Number((bytes / 1024 ** unit).toFixed(2))} ${['B', 'KB', 'MB', 'GB'][unit]}`
}

const DISPLAY_NAME_MAP: Record<string, string> = {
  low: '标准',
  standard: '高品质',
  high: '超高品质',
  lossless: '无损',
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
export function compareQuality(a: string, b: string, order: readonly string[] = []): number {
  return -(compareQualities(order, a, b) ?? 0)
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
  return arr.at(-1) ?? null
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
    list = input.map((i) => (typeof i === 'string' ? { type: i } : { type: i.type, size: i.size }))
  } else {
    list = Object.keys(input).map((k) => ({ type: k, size: input[k]?.size }))
  }
  return list
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
  targetQuality: string,
  order: readonly string[] = normalizeTypes(availableTypes)
): string | null {
  const available = normalizeTypes(availableTypes)
  return selectQuality(order, available.length ? available : order, targetQuality) ?? null
}
