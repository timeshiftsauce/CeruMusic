export const SOURCE_LABELS: Record<string, string> = {
  wy: '网易',
  kg: '酷狗',
  tx: 'QQ',
  kw: '酷我',
  mg: '咪咕',
  bd: '波点',
  git: 'GitCode',
  local: '本地',
  share: '分享',
  all: '聚合'
}

export const sourceLabel = (s?: string | null): string => {
  if (!s) return ''
  return SOURCE_LABELS[s] || s
}
