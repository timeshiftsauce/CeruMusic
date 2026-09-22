/** Only serializable, already calculated cover colors; never persist a Blob URL. */
export interface MusicCoverDetail {
  ColorObject: { r: number; g: number; b: number }
  useBlackText: boolean
  mainColor?: string
  lightMainColor?: string
  contrastColor?: string
  textColor?: string
  hoverColor?: string
  playBg?: string
  playBgHover?: string
}

export function savedCoverDetail(value: unknown): MusicCoverDetail | undefined {
  if (!value || typeof value !== 'object') return undefined
  const detail = value as MusicCoverDetail
  const color = detail.ColorObject
  if (
    !color ||
    ![color.r, color.g, color.b].every(
      (channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255
    ) ||
    typeof detail.useBlackText !== 'boolean'
  )
    return undefined
  const result: MusicCoverDetail = { ColorObject: { ...color }, useBlackText: detail.useBlackText }
  for (const key of [
    'mainColor',
    'lightMainColor',
    'contrastColor',
    'textColor',
    'hoverColor',
    'playBg',
    'playBgHover'
  ] as const) {
    if (typeof detail[key] === 'string' && detail[key].length <= 120) result[key] = detail[key]
  }
  return result
}
