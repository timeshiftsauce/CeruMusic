import QRCode from 'qrcode'
import { extractDominantColor, type Color } from '@renderer/utils/color/colorExtractor'
import brandLogoSrc from '@renderer/assets/logo.png'

// ============= Types =============

export type SongPosterTemplate = 'classic' | 'music-card' | 'polaroid' | 'lyric' | 'minimal'
export type PlaylistPosterTemplate = 'classic' | 'music-card' | 'polaroid' | 'minimal'
export type PosterTemplate = SongPosterTemplate | PlaylistPosterTemplate

export interface SongPosterData {
  type: 'song'
  template?: SongPosterTemplate
  title: string
  subtitle: string
  album?: string
  cover: string
  shareUrl: string
  expiryText?: string
  brandLine?: string
  lyricText?: string
}

export interface PlaylistPosterData {
  type: 'playlist'
  template?: PlaylistPosterTemplate
  title: string
  subtitle: string
  cover: string
  shareUrl: string
  songCount?: number
  expiryText?: string
  brandLine?: string
}

export type PosterData = SongPosterData | PlaylistPosterData

export interface PosterTemplateOption {
  id: PosterTemplate
  label: string
  description: string
}

const DEFAULT_BRAND = '澜音 CeruMusic'
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", system-ui, sans-serif'
const MONO_FAMILY = '"SF Mono", Consolas, "Courier New", monospace'

// ============= Common Helpers =============

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

function rgbToCss(c: Color, alpha = 1): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

function shiftColor(c: Color, factor: number): Color {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return { r: clamp(c.r * factor), g: clamp(c.g * factor), b: clamp(c.b * factor) }
}

function relativeLuminance(c: Color): number {
  const norm = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * norm(c.r) + 0.7152 * norm(c.g) + 0.0722 * norm(c.b)
}

function pickTextColors(bg: Color): {
  primary: string
  secondary: string
  tertiary: string
  isDark: boolean
} {
  const useLightText = relativeLuminance(bg) < 0.55
  if (useLightText) {
    return {
      primary: 'rgba(255, 255, 255, 0.96)',
      secondary: 'rgba(255, 255, 255, 0.82)',
      tertiary: 'rgba(255, 255, 255, 0.6)',
      isDark: true
    }
  }
  return {
    primary: 'rgba(20, 20, 25, 0.94)',
    secondary: 'rgba(20, 20, 25, 0.74)',
    tertiary: 'rgba(20, 20, 25, 0.54)',
    isDark: false
  }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function fitDrawImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  mode: 'cover' | 'contain' = 'cover'
): void {
  const aspect = img.width / img.height
  const target = w / h
  let dw = w
  let dh = h
  let dx = x
  let dy = y
  if (mode === 'cover') {
    if (aspect > target) {
      dw = h * aspect
      dx = x - (dw - w) / 2
    } else if (aspect < target) {
      dh = w / aspect
      dy = y - (dh - h) / 2
    }
  } else {
    if (aspect > target) {
      dh = w / aspect
      dy = y + (h - dh) / 2
    } else if (aspect < target) {
      dw = h * aspect
      dx = x + (w - dw) / 2
    }
  }
  ctx.drawImage(img, dx, dy, dw, dh)
}

function drawTextWithEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  if (!text) return
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y)
    return
  }
  const ellipsis = '…'
  let lo = 0
  let hi = text.length
  let best = ''
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const candidate = text.slice(0, mid) + ellipsis
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  ctx.fillText(best || ellipsis, x, y)
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  if (!text || maxLines <= 0) return []
  const chars = Array.from(text)
  const lines: string[] = []
  let current = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = current + ch
    if (ctx.measureText(next).width > maxWidth) {
      if (current) lines.push(current)
      current = ch
      if (lines.length >= maxLines) {
        const remaining = chars.slice(i + 1).join('')
        if (remaining || ctx.measureText(current).width > maxWidth) {
          let last = lines[lines.length - 1]
          while (ctx.measureText(last + '…').width > maxWidth && last.length > 1) {
            last = last.slice(0, -1)
          }
          lines[lines.length - 1] = last + '…'
        }
        return lines
      }
    } else {
      current = next
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines
}

async function renderQrCanvas(
  text: string,
  size: number,
  dark = '#111317',
  light = '#ffffff'
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark, light }
  })
  return canvas
}

async function loadCoverOrNull(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(src)
  } catch {
    return null
  }
}

const brandLogoPromise = loadCoverOrNull(brandLogoSrc)

async function drawBrandLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius = Math.max(6, Math.round(size * 0.22))
): Promise<void> {
  const logo = await brandLogoPromise
  if (!logo) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `700 ${Math.max(12, Math.round(size * 0.9))}px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', x + size / 2, y + size / 2)
    ctx.restore()
    return
  }

  ctx.save()
  roundedRectPath(ctx, x, y, size, size, radius)
  ctx.clip()
  fitDrawImage(ctx, logo, x, y, size, size, 'cover')
  ctx.restore()
}

async function safeExtractColor(src: string): Promise<Color> {
  try {
    return await extractDominantColor(src)
  } catch {
    return { r: 76, g: 116, b: 206 }
  }
}

// ============= Lyric Utilities =============

const LYRIC_META_RE =
  /^(作词|作曲|编曲|演唱|歌手|专辑|出品|制作|发行|监制|混音|录音|母带|by|music\s|lyrics\s|composed|arranged|produced)[：:\s]/i

export function parseLrcToLines(lrc: string | undefined | null): string[] {
  if (!lrc) return []
  const out: string[] = []
  const tagRe = /\[[^\]]+\]/g
  for (const raw of lrc.split(/\r?\n/)) {
    const cleaned = raw.replace(tagRe, '').trim()
    if (!cleaned) continue
    if (cleaned.length < 2) continue
    if (LYRIC_META_RE.test(cleaned)) continue
    out.push(cleaned)
  }
  return out
}

export function pickHighlightLines(lines: string[], count: number): string[] {
  if (lines.length <= count) return lines
  const start = Math.max(0, Math.floor(lines.length / 3) - 1)
  return lines.slice(start, start + count)
}

export function getAvailableTemplates(
  type: 'song' | 'playlist',
  hasLyric: boolean
): PosterTemplateOption[] {
  const base: PosterTemplateOption[] = [
    { id: 'classic', label: '经典', description: '渐变主色调海报' },
    { id: 'music-card', label: '音乐卡片', description: '播放器卡片风格' },
    { id: 'polaroid', label: '拍立得', description: '复古胶片拼贴' },
    { id: 'minimal', label: '极简', description: '简洁纯净排版' }
  ]
  if (type === 'song') {
    base.splice(3, 0, {
      id: 'lyric',
      label: hasLyric ? '歌词' : '歌词（无）',
      description: hasLyric ? '以歌词为主体的海报' : '当前歌曲未提供歌词'
    })
  }
  return base
}

// ============= Layout Constants =============

const W = 720
const H = 1100
const PAD = 56

// ============= Template: Classic =============

async function renderClassic(data: PosterData, ctx: CanvasRenderingContext2D): Promise<void> {
  const coverImg = await loadCoverOrNull(data.cover)
  const dominant = data.cover ? await safeExtractColor(data.cover) : { r: 76, g: 116, b: 206 }

  const accentDeep = shiftColor(dominant, 0.55)
  const accentLight = shiftColor(dominant, 1.18)
  const text = pickTextColors(dominant)

  const bgGrad = ctx.createLinearGradient(0, 0, W, H)
  bgGrad.addColorStop(0, rgbToCss(accentLight))
  bgGrad.addColorStop(0.55, rgbToCss(dominant))
  bgGrad.addColorStop(1, rgbToCss(accentDeep))
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, W, H)

  const glow1 = ctx.createRadialGradient(W * 0.85, H * 0.1, 20, W * 0.85, H * 0.1, 360)
  glow1.addColorStop(0, 'rgba(255, 255, 255, 0.32)')
  glow1.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 20, W * 0.1, H * 0.9, 420)
  glow2.addColorStop(0, rgbToCss(accentLight, 0.4))
  glow2.addColorStop(1, rgbToCss(accentLight, 0))
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = text.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
  for (let i = 0; i < 80; i++) {
    const cx = Math.random() * W
    const cy = Math.random() * H
    const r = Math.random() * 1.4 + 0.2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const cardX = PAD
  const cardY = PAD
  const cardW = W - PAD * 2
  const cardH = H - PAD * 2
  ctx.save()
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, 28)
  ctx.fillStyle = text.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.42)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = text.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.6)'
  ctx.stroke()
  ctx.restore()

  const brandY = cardY + 56
  const logoSize = 16
  const brandTextX = cardX + 36 + logoSize + 10
  await drawBrandLogo(ctx, cardX + 36, brandY - logoSize / 2, logoSize, 4)
  ctx.save()
  ctx.fillStyle = text.secondary
  ctx.font = `600 18px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(
    data.brandLine || `${DEFAULT_BRAND} · ${data.type === 'song' ? '歌曲分享' : '歌单分享'}`,
    brandTextX,
    brandY
  )
  ctx.restore()

  const coverSize = 360
  const coverX = (W - coverSize) / 2
  const coverY = cardY + 110

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.32)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetY = 14
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 24)
  ctx.fillStyle = rgbToCss(accentDeep)
  ctx.fill()
  ctx.restore()

  ctx.save()
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 24)
  ctx.clip()
  if (coverImg) {
    fitDrawImage(ctx, coverImg, coverX, coverY, coverSize, coverSize, 'cover')
  } else {
    ctx.fillStyle = rgbToCss(accentDeep)
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.font = `600 96px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', coverX + coverSize / 2, coverY + coverSize / 2)
  }
  ctx.restore()

  ctx.save()
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 24)
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  const titleY = coverY + coverSize + 56
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = text.primary
  ctx.font = `700 36px ${FONT_FAMILY}`
  drawTextWithEllipsis(ctx, data.title, W / 2, titleY, cardW - 80)

  ctx.fillStyle = text.secondary
  ctx.font = `500 20px ${FONT_FAMILY}`
  drawTextWithEllipsis(ctx, data.subtitle, W / 2, titleY + 36, cardW - 100)

  if (data.type === 'song' && data.album) {
    ctx.fillStyle = text.tertiary
    ctx.font = `400 16px ${FONT_FAMILY}`
    drawTextWithEllipsis(ctx, `《${data.album}》`, W / 2, titleY + 64, cardW - 120)
  } else if (data.type === 'playlist' && data.songCount !== undefined) {
    ctx.fillStyle = text.tertiary
    ctx.font = `400 16px ${FONT_FAMILY}`
    ctx.fillText(`共 ${data.songCount} 首歌曲`, W / 2, titleY + 64)
  }

  const divY = titleY + 96
  const divW = 220
  const divGrad = ctx.createLinearGradient((W - divW) / 2, divY, (W + divW) / 2, divY)
  divGrad.addColorStop(0, text.isDark ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)')
  divGrad.addColorStop(0.5, text.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.25)')
  divGrad.addColorStop(1, text.isDark ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)')
  ctx.fillStyle = divGrad
  ctx.fillRect((W - divW) / 2, divY, divW, 1)

  const qrSize = 168
  const qrPad = 16
  const qrCardSize = qrSize + qrPad * 2
  const qrCardX = cardX + cardW - qrCardSize - 36
  const qrCardY = cardY + cardH - qrCardSize - 36

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.24)'
  ctx.shadowBlur = 22
  ctx.shadowOffsetY = 8
  roundedRectPath(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 18)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  try {
    const qrCanvas = await renderQrCanvas(data.shareUrl, qrSize)
    ctx.drawImage(qrCanvas, qrCardX + qrPad, qrCardY + qrPad, qrSize, qrSize)
  } catch {
    ctx.fillStyle = '#999'
    ctx.font = `14px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('二维码生成失败', qrCardX + qrCardSize / 2, qrCardY + qrCardSize / 2)
  }

  const ctaX = cardX + 36
  const ctaTopY = qrCardY + 14
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = text.primary
  ctx.font = `700 22px ${FONT_FAMILY}`
  ctx.fillText('扫码即刻畅听', ctaX, ctaTopY + 22)

  ctx.fillStyle = text.secondary
  ctx.font = `400 14px ${FONT_FAMILY}`
  ctx.fillText('在浏览器中打开链接', ctaX, ctaTopY + 50)
  ctx.fillText('或在澜音 App 中导入', ctaX, ctaTopY + 72)

  if (data.expiryText) {
    ctx.fillStyle = text.tertiary
    ctx.font = `400 12px ${FONT_FAMILY}`
    ctx.fillText(`有效期至 ${data.expiryText}`, ctaX, ctaTopY + 110)
  }

  ctx.fillStyle = text.tertiary
  ctx.font = `500 11px ${MONO_FAMILY}`
  ctx.textAlign = 'center'
  drawTextWithEllipsis(ctx, data.shareUrl, W / 2, cardY + cardH - 18, cardW - 100)
}

// ============= Template: Music Card =============

async function renderMusicCard(data: PosterData, ctx: CanvasRenderingContext2D): Promise<void> {
  const coverImg = await loadCoverOrNull(data.cover)
  const dominant = data.cover ? await safeExtractColor(data.cover) : { r: 60, g: 80, b: 130 }
  const accentDeep = shiftColor(dominant, 0.35)

  // 外层深色背景 + 主色调微弱晕染
  ctx.fillStyle = '#0c0e14'
  ctx.fillRect(0, 0, W, H)

  const tint = ctx.createRadialGradient(W / 2, H * 0.35, 60, W / 2, H * 0.35, 600)
  tint.addColorStop(0, rgbToCss(dominant, 0.45))
  tint.addColorStop(1, rgbToCss(accentDeep, 0))
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, W, H)

  // 模糊封面背景（柔和氛围）
  if (coverImg) {
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.filter = 'blur(60px) saturate(180%)'
    ctx.drawImage(coverImg, -100, -100, W + 200, H + 200)
    ctx.filter = 'none'
    ctx.restore()
  }

  // 顶部品牌
  const brandLogoSize = 24
  const brandCenterY = PAD + 8
  await drawBrandLogo(ctx, PAD, brandCenterY - brandLogoSize / 2, brandLogoSize, 6)
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.font = `600 16px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(data.brandLine || `${DEFAULT_BRAND}`, PAD + brandLogoSize + 10, brandCenterY)
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.font = `500 13px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.fillText(data.type === 'song' ? '歌曲分享' : '歌单分享', W - PAD, brandCenterY)
  ctx.restore()

  // 白色主卡片
  const cardX = 80
  const cardY = 130
  const cardW = W - 160
  const cardH = 740
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 18
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, 28)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // 卡片内封面
  const innerPad = 24
  const coverSize = cardW - innerPad * 2
  const coverX = cardX + innerPad
  const coverY = cardY + innerPad

  ctx.save()
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 16)
  ctx.clip()
  if (coverImg) {
    fitDrawImage(ctx, coverImg, coverX, coverY, coverSize, coverSize, 'cover')
  } else {
    ctx.fillStyle = rgbToCss(accentDeep)
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 120px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', coverX + coverSize / 2, coverY + coverSize / 2)
  }
  // 顶部柔光
  const shine = ctx.createLinearGradient(0, coverY, 0, coverY + 140)
  shine.addColorStop(0, 'rgba(255,255,255,0.18)')
  shine.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = shine
  ctx.fillRect(coverX, coverY, coverSize, 140)
  ctx.restore()

  // 卡片底部播放器条
  const barY = coverY + coverSize + innerPad
  const barH = cardH - (coverSize + innerPad * 2)
  const barCenterY = barY + barH / 2

  // 圆形小封面缩略图
  const thumbSize = 56
  const thumbX = cardX + innerPad
  const thumbY = barCenterY - thumbSize / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (coverImg) {
    fitDrawImage(ctx, coverImg, thumbX, thumbY, thumbSize, thumbSize, 'cover')
  } else {
    ctx.fillStyle = rgbToCss(accentDeep)
    ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize)
  }
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.arc(thumbX + thumbSize / 2, thumbY + thumbSize / 2, thumbSize / 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()

  // 名称 + 副标题
  const textX = thumbX + thumbSize + 16
  const iconAreaW = 110
  const textMaxW = cardX + cardW - innerPad - iconAreaW - textX

  ctx.save()
  ctx.fillStyle = '#1a1d24'
  ctx.font = `700 20px ${FONT_FAMILY}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  drawTextWithEllipsis(ctx, data.title, textX, barCenterY - 4, textMaxW)
  ctx.fillStyle = 'rgba(26,29,36,0.6)'
  ctx.font = `500 14px ${FONT_FAMILY}`
  let sub = data.subtitle
  if (data.type === 'playlist' && data.songCount !== undefined) {
    sub = `${data.subtitle} · ${data.songCount} 首`
  } else if (data.type === 'song' && data.album) {
    sub = `${data.subtitle} · ${data.album}`
  }
  drawTextWithEllipsis(ctx, sub, textX, barCenterY + 20, textMaxW)
  ctx.restore()

  // 右侧播放图标 + 队列图标
  const iconRight = cardX + cardW - innerPad
  const iconColor = '#1a1d24'
  // 暂停图标（两个圆角竖条）
  ctx.save()
  ctx.fillStyle = iconColor
  const pauseX = iconRight - 76
  const pauseW = 6
  const pauseH = 22
  roundedRectPath(ctx, pauseX, barCenterY - pauseH / 2, pauseW, pauseH, 2)
  ctx.fill()
  roundedRectPath(ctx, pauseX + 12, barCenterY - pauseH / 2, pauseW, pauseH, 2)
  ctx.fill()
  ctx.restore()

  // 队列图标（三条横线）
  ctx.save()
  ctx.strokeStyle = iconColor
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  const qX1 = iconRight - 32
  const qX2 = iconRight
  for (let i = 0; i < 3; i++) {
    const yy = barCenterY - 8 + i * 8
    ctx.beginPath()
    ctx.moveTo(qX1, yy)
    ctx.lineTo(qX2, yy)
    ctx.stroke()
  }
  ctx.restore()

  // 卡片下方文案 + QR
  const footerTopY = cardY + cardH + 28
  const footerH = H - footerTopY - 28

  // 文案在左
  let quote = ''
  if (data.type === 'song') {
    quote = data.album ? `《${data.album}》` : data.subtitle
  } else if (data.type === 'playlist') {
    quote = data.songCount !== undefined ? `精选歌单 · ${data.songCount} 首` : data.subtitle
  }
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.86)'
  ctx.font = `600 18px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  drawTextWithEllipsis(ctx, quote, cardX, footerTopY + 2, cardW - 200)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `500 13px ${FONT_FAMILY}`
  ctx.fillText(`扫码畅听 · ${DEFAULT_BRAND}`, cardX, footerTopY + 38)

  if (data.expiryText) {
    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    ctx.font = `400 11px ${FONT_FAMILY}`
    ctx.fillText(`有效期至 ${data.expiryText}`, cardX, footerTopY + 64)
  }
  ctx.restore()

  // QR 在右
  const qrSize = 110
  const qrPad = 8
  const qrTotal = qrSize + qrPad * 2
  const qrX = cardX + cardW - qrTotal
  const qrY = footerTopY + (footerH - qrTotal) / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  roundedRectPath(ctx, qrX, qrY, qrTotal, qrTotal, 12)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  try {
    const qr = await renderQrCanvas(data.shareUrl, qrSize)
    ctx.drawImage(qr, qrX + qrPad, qrY + qrPad, qrSize, qrSize)
  } catch {
    ctx.fillStyle = '#888'
    ctx.font = `12px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('QR', qrX + qrTotal / 2, qrY + qrTotal / 2)
  }
}

// ============= Template: Lyric =============

async function renderLyric(data: PosterData, ctx: CanvasRenderingContext2D): Promise<void> {
  const coverImg = await loadCoverOrNull(data.cover)
  const dominant = data.cover ? await safeExtractColor(data.cover) : { r: 50, g: 70, b: 110 }
  const bgBase = shiftColor(dominant, 0.28)
  const bgEnd = shiftColor(dominant, 0.14)

  // 深色渐变背景
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, rgbToCss(bgBase))
  bg.addColorStop(1, rgbToCss(bgEnd))
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 模糊封面氛围
  if (coverImg) {
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.filter = 'blur(80px) saturate(180%)'
    ctx.drawImage(coverImg, -120, -120, W + 240, H + 240)
    ctx.filter = 'none'
    ctx.restore()
  }

  // 颗粒
  ctx.fillStyle = 'rgba(255,255,255,0.04)'
  for (let i = 0; i < 120; i++) {
    const cx = Math.random() * W
    const cy = Math.random() * H
    const r = Math.random() * 1.2 + 0.2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 顶部封面 + 信息
  const headPad = 64
  const thumbSize = 124
  const headerY = 100
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 8
  roundedRectPath(ctx, headPad, headerY, thumbSize, thumbSize, 18)
  ctx.fillStyle = rgbToCss(bgEnd)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundedRectPath(ctx, headPad, headerY, thumbSize, thumbSize, 18)
  ctx.clip()
  if (coverImg) {
    fitDrawImage(ctx, coverImg, headPad, headerY, thumbSize, thumbSize, 'cover')
  } else {
    ctx.fillStyle = rgbToCss(bgEnd)
    ctx.fillRect(headPad, headerY, thumbSize, thumbSize)
  }
  ctx.restore()

  // 信息文字
  const infoX = headPad + thumbSize + 24
  const infoMaxW = W - infoX - headPad
  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.font = `700 32px ${FONT_FAMILY}`
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  drawTextWithEllipsis(ctx, data.title, infoX, headerY + 50, infoMaxW)

  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.font = `500 18px ${FONT_FAMILY}`
  drawTextWithEllipsis(ctx, data.subtitle, infoX, headerY + 84, infoMaxW)

  if (data.type === 'song' && data.album) {
    ctx.fillStyle = 'rgba(255,255,255,0.42)'
    ctx.font = `400 14px ${FONT_FAMILY}`
    drawTextWithEllipsis(ctx, `《${data.album}》`, infoX, headerY + 110, infoMaxW)
  } else if (data.type === 'playlist' && data.songCount !== undefined) {
    ctx.fillStyle = 'rgba(255,255,255,0.42)'
    ctx.font = `400 14px ${FONT_FAMILY}`
    ctx.fillText(`共 ${data.songCount} 首歌曲`, infoX, headerY + 110)
  }
  ctx.restore()

  // 分隔虚线
  const divY = headerY + thumbSize + 48
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.setLineDash([4, 6])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(headPad, divY)
  ctx.lineTo(W - headPad, divY)
  ctx.stroke()
  ctx.restore()

  // 歌词内容
  const lyricStartY = divY + 80
  const lyricMaxW = W - headPad * 2
  const lyric = data.type === 'song' ? data.lyricText : ''
  const lines = pickHighlightLines(parseLrcToLines(lyric), 6)
  const fallback = ['静静聆听这首歌', '在文字之间寻找回声', '愿这一刻被你听见。']
  const display = lines.length > 0 ? lines : fallback

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  let y = lyricStartY
  const lineGap = 18
  for (const raw of display) {
    if (y > H - 220) break
    let fontSize = 38
    if (raw.length > 22) fontSize = 32
    if (raw.length > 32) fontSize = 28
    ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`
    const wrapped = wrapText(ctx, raw, lyricMaxW, 2)
    for (const w of wrapped) {
      if (y > H - 220) break
      ctx.fillText(w, headPad, y)
      y += fontSize + 8
    }
    y += lineGap
  }
  ctx.restore()

  // 底部 brand + QR
  const footerY = H - 150
  const qrSize = 96
  const qrPad = 6
  const qrTotal = qrSize + qrPad * 2
  const qrX = W - headPad - qrTotal
  const qrY = footerY - 4

  ctx.save()
  roundedRectPath(ctx, qrX, qrY, qrTotal, qrTotal, 12)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()
  try {
    const qr = await renderQrCanvas(data.shareUrl, qrSize)
    ctx.drawImage(qr, qrX + qrPad, qrY + qrPad, qrSize, qrSize)
  } catch { }

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `700 20px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const lyricBrandLogoSize = 26
  const lyricBrandCenterY = footerY + 18
  await drawBrandLogo(ctx, headPad, lyricBrandCenterY - lyricBrandLogoSize / 2, lyricBrandLogoSize, 7)
  ctx.fillText(`${DEFAULT_BRAND}`, headPad + lyricBrandLogoSize + 10, lyricBrandCenterY)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = `400 13px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'
  ctx.fillText('扫码与我共听', headPad, footerY + 36)

  if (data.expiryText) {
    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    ctx.font = `400 11px ${FONT_FAMILY}`
    ctx.fillText(`有效期至 ${data.expiryText}`, headPad, footerY + 60)
  }
  ctx.restore()
}

// ============= Template: Minimal =============

async function renderMinimal(data: PosterData, ctx: CanvasRenderingContext2D): Promise<void> {
  const coverImg = await loadCoverOrNull(data.cover)
  const dominant = data.cover ? await safeExtractColor(data.cover) : { r: 78, g: 110, b: 200 }

  // 米色 / 哑光底色
  ctx.fillStyle = '#f4f1eb'
  ctx.fillRect(0, 0, W, H)

  // 角标主色装饰
  ctx.save()
  ctx.fillStyle = rgbToCss(dominant, 0.95)
  ctx.fillRect(0, 0, W, 4)
  ctx.fillRect(0, H - 4, W, 4)
  ctx.restore()

  const accentCss = rgbToCss(shiftColor(dominant, 0.85))

  // 顶部细标
  const minimalBrandLogoSize = 20
  const minimalBrandCenterY = PAD + 8
  await drawBrandLogo(
    ctx,
    PAD,
    minimalBrandCenterY - minimalBrandLogoSize / 2,
    minimalBrandLogoSize,
    5
  )
  ctx.save()
  ctx.fillStyle = '#999'
  ctx.font = `500 12px ${MONO_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(
    (data.brandLine || DEFAULT_BRAND).toUpperCase(),
    PAD + minimalBrandLogoSize + 10,
    minimalBrandCenterY
  )
  ctx.textAlign = 'right'
  ctx.fillText(
    (data.type === 'song' ? 'TRACK' : 'PLAYLIST') + ' / SHARE',
    W - PAD,
    minimalBrandCenterY
  )
  ctx.restore()

  // 居中封面
  const coverSize = 360
  const coverX = (W - coverSize) / 2
  const coverY = 130

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 26
  ctx.shadowOffsetY = 12
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 8)
  ctx.fillStyle = '#ddd'
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundedRectPath(ctx, coverX, coverY, coverSize, coverSize, 8)
  ctx.clip()
  if (coverImg) {
    fitDrawImage(ctx, coverImg, coverX, coverY, coverSize, coverSize, 'cover')
  } else {
    ctx.fillStyle = '#ddd'
    ctx.fillRect(coverX, coverY, coverSize, coverSize)
    ctx.fillStyle = '#999'
    ctx.font = `600 96px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', coverX + coverSize / 2, coverY + coverSize / 2)
  }
  ctx.restore()

  // 标题
  const titleY = coverY + coverSize + 76
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `700 40px ${FONT_FAMILY}`
  drawTextWithEllipsis(ctx, data.title, W / 2, titleY, W - PAD * 2)

  ctx.fillStyle = '#555'
  ctx.font = `400 18px ${FONT_FAMILY}`
  drawTextWithEllipsis(ctx, data.subtitle, W / 2, titleY + 36, W - PAD * 2)

  if (data.type === 'song' && data.album) {
    ctx.fillStyle = '#888'
    ctx.font = `400 14px ${FONT_FAMILY}`
    drawTextWithEllipsis(ctx, `《${data.album}》`, W / 2, titleY + 64, W - PAD * 2)
  } else if (data.type === 'playlist' && data.songCount !== undefined) {
    ctx.fillStyle = '#888'
    ctx.font = `400 14px ${FONT_FAMILY}`
    ctx.fillText(`${data.songCount} TRACKS`, W / 2, titleY + 64)
  }
  ctx.restore()

  // 装饰线
  const divY = titleY + 96
  ctx.save()
  ctx.strokeStyle = accentCss
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W / 2 - 20, divY)
  ctx.lineTo(W / 2 + 20, divY)
  ctx.stroke()
  ctx.restore()

  // QR 居中
  const qrSize = 140
  const qrX = (W - qrSize) / 2
  const qrY = divY + 30
  ctx.save()
  ctx.strokeStyle = '#ddd'
  ctx.lineWidth = 1
  roundedRectPath(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 6)
  ctx.stroke()
  ctx.restore()
  try {
    const qr = await renderQrCanvas(data.shareUrl, qrSize)
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize)
  } catch { }

  // 底部
  ctx.save()
  ctx.fillStyle = '#666'
  ctx.font = `500 12px ${MONO_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText('SCAN  ·  PLAY  ·  ENJOY', W / 2, qrY + qrSize + 24)
  if (data.expiryText) {
    ctx.fillStyle = '#999'
    ctx.font = `400 11px ${MONO_FAMILY}`
    ctx.fillText(`VALID UNTIL ${data.expiryText}`, W / 2, qrY + qrSize + 46)
  }
  ctx.restore()
}

// ============= Template: Polaroid =============

async function renderPolaroid(data: PosterData, ctx: CanvasRenderingContext2D): Promise<void> {
  const coverImg = await loadCoverOrNull(data.cover)
  const dominant = data.cover ? await safeExtractColor(data.cover) : { r: 80, g: 100, b: 160 }

  // 米色 / 哑光纸底
  ctx.fillStyle = '#eeebe4'
  ctx.fillRect(0, 0, W, H)

  // 网格纸纹理
  ctx.save()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.045)'
  ctx.lineWidth = 1
  const grid = 32
  for (let x = grid; x < W; x += grid) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let y = grid; y < H; y += grid) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.restore()

  // 微噪点
  ctx.save()
  for (let i = 0; i < 220; i++) {
    const cx = Math.random() * W
    const cy = Math.random() * H
    const r = Math.random() * 0.9 + 0.2
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.5)'
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 角落彩虹光斑（模拟漏光）
  ctx.save()
  const flare = ctx.createRadialGradient(60, H - 240, 10, 60, H - 240, 200)
  flare.addColorStop(0, 'rgba(255, 130, 90, 0.55)')
  flare.addColorStop(0.4, 'rgba(255, 220, 120, 0.28)')
  flare.addColorStop(0.7, 'rgba(120, 200, 255, 0.18)')
  flare.addColorStop(1, 'rgba(120, 200, 255, 0)')
  ctx.fillStyle = flare
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  // ==== 拍立得卡片 ====
  const cardW = 480
  const photoSize = 420
  const photoTop = 30
  const photoLeft = 30
  const cardH = photoTop + photoSize + 100
  const cardX = (W - cardW) / 2
  const cardY = 90
  const tilt = -0.022 // 轻微倾斜

  ctx.save()
  ctx.translate(cardX + cardW / 2, cardY + cardH / 2)
  ctx.rotate(tilt)
  ctx.translate(-cardW / 2, -cardH / 2)

  // 阴影
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = 30
  ctx.shadowOffsetY = 14
  ctx.fillStyle = '#fdfbf6'
  ctx.fillRect(0, 0, cardW, cardH)
  ctx.restore()

  // 卡片描边（细微脏边）
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, cardW - 1, cardH - 1)

  // 撕边效果（顶部 / 底部锯齿）
  ctx.save()
  ctx.fillStyle = '#eeebe4'
  ctx.beginPath()
  let x = 0
  ctx.moveTo(0, 0)
  while (x < cardW) {
    const step = 12 + Math.random() * 10
    const dip = Math.random() * 4 - 1
    ctx.lineTo(x + step / 2, dip)
    ctx.lineTo(x + step, 0)
    x += step
  }
  ctx.lineTo(cardW, 0)
  ctx.lineTo(cardW, -8)
  ctx.lineTo(0, -8)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 照片区域
  ctx.save()
  ctx.fillStyle = '#0c0c0c'
  ctx.fillRect(photoLeft, photoTop, photoSize, photoSize)
  if (coverImg) {
    fitDrawImage(ctx, coverImg, photoLeft, photoTop, photoSize, photoSize, 'cover')
  } else {
    ctx.fillStyle = rgbToCss(shiftColor(dominant, 0.6))
    ctx.fillRect(photoLeft, photoTop, photoSize, photoSize)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = `600 120px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('♪', photoLeft + photoSize / 2, photoTop + photoSize / 2)
  }
  // 照片上方暗角
  const vignette = ctx.createRadialGradient(
    photoLeft + photoSize / 2,
    photoTop + photoSize / 2,
    photoSize * 0.35,
    photoLeft + photoSize / 2,
    photoTop + photoSize / 2,
    photoSize * 0.75
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.34)')
  ctx.fillStyle = vignette
  ctx.fillRect(photoLeft, photoTop, photoSize, photoSize)
  // 照片右下小水印
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `700 18px ${FONT_FAMILY}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText('BTW', photoLeft + photoSize - 16, photoTop + photoSize - 14)
  ctx.restore()

  // 卡片下方手写体说明（标题）
  ctx.save()
  ctx.fillStyle = '#1d1d1d'
  ctx.font = `italic 700 26px "Comic Sans MS", "Brush Script MT", "PingFang SC", cursive`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawTextWithEllipsis(ctx, data.title, cardW / 2, photoTop + photoSize + 50, cardW - 60)
  ctx.restore()

  ctx.restore() // 回到未旋转的画布

  // ==== 撕条 quote ====
  const quoteW = 580
  const quoteH = 78
  const quoteX = (W - quoteW) / 2
  const quoteY = cardY + cardH - 4
  const quoteTilt = 0.014
  ctx.save()
  ctx.translate(quoteX + quoteW / 2, quoteY + quoteH / 2)
  ctx.rotate(quoteTilt)
  ctx.translate(-quoteW / 2, -quoteH / 2)

  // 撕条阴影
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.16)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#f8f5ec'
  // 四边锯齿
  ctx.beginPath()
  let lx = 0
  ctx.moveTo(0, 0)
  while (lx < quoteW) {
    const step = 14 + Math.random() * 10
    const dip = Math.random() * 3
    ctx.lineTo(lx + step / 2, -dip)
    ctx.lineTo(lx + step, 0)
    lx += step
  }
  ctx.lineTo(quoteW, quoteH)
  let rx = quoteW
  while (rx > 0) {
    const step = 14 + Math.random() * 10
    const dip = Math.random() * 3
    ctx.lineTo(rx - step / 2, quoteH + dip)
    ctx.lineTo(rx - step, quoteH)
    rx -= step
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 引文文字
  let quoteText = ''
  if (data.type === 'song') {
    const lyricLines = pickHighlightLines(parseLrcToLines((data as SongPosterData).lyricText), 1)
    quoteText = lyricLines[0] || data.subtitle || '让音乐替我说出心情。'
  } else {
    quoteText = data.subtitle || '收藏喜欢的歌，分享给在意的人。'
  }
  const quoteDisplay = `“ ${quoteText} ”`
  ctx.fillStyle = '#2a2a2a'
  ctx.font = `500 22px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawTextWithEllipsis(ctx, quoteDisplay, quoteW / 2, quoteH / 2, quoteW - 60)
  ctx.restore()

  // ==== 标签胶囊 ====
  const tagY = quoteY + quoteH + 40
  const tagW = 156
  const tagH = 34
  const tagX = (W - tagW) / 2
  ctx.save()
  ctx.fillStyle = '#ffffff'
  roundedRectPath(ctx, tagX, tagY, tagW, tagH, tagH / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#666'
  ctx.font = `500 14px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    data.type === 'song' ? '# Music mood' : '# My playlist',
    tagX + tagW / 2,
    tagY + tagH / 2 + 1
  )
  ctx.restore()

  // ==== 底部品牌 + QR ====
  const footerY = H - 124
  ctx.save()
  ctx.fillStyle = '#3a3a3a'
  ctx.font = `500 18px ${FONT_FAMILY}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  let line1 = ''
  if (data.type === 'song') {
    line1 = `${data.subtitle}${data.album ? ' · ' + data.album : ''}`
  } else {
    line1 = data.songCount !== undefined ? `${data.title} · ${data.songCount} 首` : data.title
  }
  drawTextWithEllipsis(ctx, line1, PAD, footerY, W - PAD * 2 - 140)

  ctx.fillStyle = '#888'
  ctx.font = `500 14px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  const polaroidBrandLogoSize = 22
  const polaroidBrandCenterY = footerY + 38
  await drawBrandLogo(
    ctx,
    PAD,
    polaroidBrandCenterY - polaroidBrandLogoSize / 2,
    polaroidBrandLogoSize,
    6
  )
  ctx.fillText(`${DEFAULT_BRAND}`, PAD + polaroidBrandLogoSize + 10, polaroidBrandCenterY)

  if (data.expiryText) {
    ctx.textBaseline = 'top'
    ctx.fillStyle = '#aaa'
    ctx.font = `400 11px ${FONT_FAMILY}`
    ctx.fillText(`有效期至 ${data.expiryText}`, PAD, footerY + 56)
  }
  ctx.restore()

  // QR 在右下
  const qrSize = 96
  const qrX = W - PAD - qrSize
  const qrY = footerY - 6
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.shadowColor = 'rgba(0,0,0,0.12)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4
  roundedRectPath(ctx, qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 8)
  ctx.fill()
  ctx.restore()
  try {
    const qr = await renderQrCanvas(data.shareUrl, qrSize)
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize)
  } catch { }
}

// ============= Dispatcher =============

const TEMPLATES: Record<
  PosterTemplate,
  (data: PosterData, ctx: CanvasRenderingContext2D) => Promise<void>
> = {
  classic: renderClassic,
  'music-card': renderMusicCard,
  polaroid: renderPolaroid,
  lyric: renderLyric,
  minimal: renderMinimal
}

export async function renderSharePoster(data: PosterData): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建 canvas 上下文')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const tpl = (data.template || 'classic') as PosterTemplate
  const renderer = TEMPLATES[tpl] || TEMPLATES.classic
  await renderer(data, ctx)
  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
