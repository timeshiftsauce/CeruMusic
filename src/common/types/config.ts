export interface lyricConfig {
  fontSize: number
  mainColor: string
  shadowColor: string
  // 窗口位置
  x?: number
  y?: number
  width?: number
  height?: number
  isOpen?: boolean
  fontFamily?: string
  fontWeight?: number | string
  position?: 'left' | 'center' | 'right' | 'both'
  alwaysShowPlayInfo?: boolean
  isLock?: boolean
  animation?: boolean
  showYrc?: boolean
  showTran?: boolean
  isDoubleLine?: boolean
  textBackgroundMask?: boolean
  backgroundMaskColor?: string
  unplayedColor?: string
  limitBounds?: boolean
}
