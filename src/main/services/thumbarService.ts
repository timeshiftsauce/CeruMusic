import { app, BrowserWindow, ipcMain, nativeImage, NativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { PNG } from 'pngjs'

type ThumbarState = {
  hasSong: boolean
  isPlaying: boolean
  isLiked: boolean
  songName: string
  singer: string
}

type IconSet = {
  prev: NativeImage
  play: NativeImage
  pause: NativeImage
  next: NativeImage
  like: NativeImage
  liked: NativeImage
}

const HEART_ICON_SIZE = 32
const COVER_OVERLAY_SIZE = 16

const heartImplicit = (x: number, y: number): number =>
  Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y

function generateHeartPng(filled: boolean): Buffer {
  const size = HEART_ICON_SIZE
  const SS = 4
  const png = new PNG({ width: size, height: size })
  const halfSize = size / 2
  const scale = size * 0.4
  const innerScale = size * 0.32

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let outerCount = 0
      let innerCount = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const sampleX = px + (sx + 0.5) / SS
          const sampleY = py + (sy + 0.5) / SS
          const xOuter = (sampleX - halfSize) / scale
          const yOuter = (halfSize - sampleY + size * 0.12) / scale
          if (heartImplicit(xOuter, yOuter) <= 0) outerCount++

          const xInner = (sampleX - halfSize) / innerScale
          const yInner = (halfSize - sampleY + size * 0.12) / innerScale
          if (heartImplicit(xInner, yInner) <= 0) innerCount++
        }
      }
      const total = SS * SS
      const outerAlpha = outerCount / total
      const innerAlpha = innerCount / total

      let alpha: number
      if (filled) {
        alpha = Math.round(outerAlpha * 255)
      } else {
        // outline = outer minus inner
        alpha = Math.round(Math.max(0, outerAlpha - innerAlpha) * 255)
      }

      const idx = (size * py + px) << 2
      png.data[idx] = 255
      png.data[idx + 1] = 255
      png.data[idx + 2] = 255
      png.data[idx + 3] = alpha
    }
  }

  return PNG.sync.write(png)
}

function loadOrGenerateIcons(): IconSet {
  const resourceDir = app.isPackaged
    ? path.join(process.resourcesPath, 'thumbar')
    : path.join(__dirname, '../../resources/thumbar')

  const userIconDir = path.join(app.getPath('userData'), 'thumbar')
  try {
    fs.mkdirSync(userIconDir, { recursive: true })
  } catch {}

  const safeLoad = (p: string): NativeImage => {
    try {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    } catch {}
    return nativeImage.createEmpty()
  }

  const prev = safeLoad(path.join(resourceDir, 'prev-light.png'))
  const play = safeLoad(path.join(resourceDir, 'play-light.png'))
  const pause = safeLoad(path.join(resourceDir, 'pause-light.png'))
  const next = safeLoad(path.join(resourceDir, 'next-light.png'))

  const likePath = path.join(userIconDir, 'heart-outline.png')
  const likedPath = path.join(userIconDir, 'heart-filled.png')
  if (!fs.existsSync(likePath)) {
    try {
      fs.writeFileSync(likePath, generateHeartPng(false))
    } catch (e) {
      console.warn('[thumbar] failed to write heart-outline:', e)
    }
  }
  if (!fs.existsSync(likedPath)) {
    try {
      fs.writeFileSync(likedPath, generateHeartPng(true))
    } catch (e) {
      console.warn('[thumbar] failed to write heart-filled:', e)
    }
  }

  return {
    prev,
    play,
    pause,
    next,
    like: safeLoad(likePath),
    liked: safeLoad(likedPath)
  }
}

class ThumbarService {
  private win: BrowserWindow | null = null
  private icons: IconSet | null = null
  private state: ThumbarState = {
    hasSong: false,
    isPlaying: false,
    isLiked: false,
    songName: '',
    singer: ''
  }
  private ipcBound = false
  private overlayCoverHash: string | null = null

  init(win: BrowserWindow): void {
    if (process.platform !== 'win32') return
    this.win = win
    if (!this.icons) this.icons = loadOrGenerateIcons()
    this.bindIpc()
    this.update()

    win.once('closed', () => {
      this.win = null
    })
  }

  private bindIpc(): void {
    if (this.ipcBound) return
    this.ipcBound = true

    ipcMain.on('thumbar:set-state', (_event, partial: Partial<ThumbarState>) => {
      if (!partial) return
      this.state = { ...this.state, ...partial }
      this.update()
    })

    ipcMain.on('thumbar:set-cover', (_event, dataUrl: string | null) => {
      this.applyCover(dataUrl)
    })

    ipcMain.on(
      'thumbar:set-clip',
      (_event, rect: { x: number; y: number; width: number; height: number } | null) => {
        this.applyClip(rect)
      }
    )
  }

  private applyCover(dataUrl: string | null): void {
    if (!this.win || this.win.isDestroyed()) return
    if (process.platform !== 'win32') return
    if (!dataUrl) {
      try {
        this.win.setOverlayIcon(null, '')
      } catch {}
      this.overlayCoverHash = null
      return
    }
    const hash = String(dataUrl.length) + ':' + dataUrl.slice(-32)
    if (hash === this.overlayCoverHash) return
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return
      const small = img.resize({
        width: COVER_OVERLAY_SIZE,
        height: COVER_OVERLAY_SIZE,
        quality: 'good'
      })
      this.win.setOverlayIcon(small, this.tooltip())
      this.overlayCoverHash = hash
    } catch (e) {
      console.warn('[thumbar] applyCover failed:', e)
    }
  }

  private applyClip(rect: { x: number; y: number; width: number; height: number } | null): void {
    if (!this.win || this.win.isDestroyed()) return
    if (process.platform !== 'win32') return
    try {
      if (rect && rect.width > 0 && rect.height > 0) {
        this.win.setThumbnailClip({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        })
      } else {
        this.win.setThumbnailClip({ x: 0, y: 0, width: 0, height: 0 })
      }
    } catch (e) {
      console.warn('[thumbar] applyClip failed:', e)
    }
  }

  private tooltip(): string {
    const { songName, singer } = this.state
    if (!songName) return ''
    return singer ? `${songName} - ${singer}` : songName
  }

  private update(): void {
    if (!this.win || this.win.isDestroyed()) return
    if (process.platform !== 'win32') return
    if (!this.icons) return

    const { hasSong, isPlaying, isLiked } = this.state
    const disabledFlags: Array<
      'enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive'
    > = hasSong ? [] : ['disabled']

    try {
      this.win.setThumbarButtons([
        {
          tooltip: '上一首',
          icon: this.icons.prev,
          flags: disabledFlags,
          click: () => this.send('playPrev')
        },
        {
          tooltip: isPlaying ? '暂停' : '播放',
          icon: isPlaying ? this.icons.pause : this.icons.play,
          flags: disabledFlags,
          click: () => this.send('music-control')
        },
        {
          tooltip: '下一首',
          icon: this.icons.next,
          flags: disabledFlags,
          click: () => this.send('playNext')
        },
        {
          tooltip: isLiked ? '取消喜欢' : '喜欢',
          icon: isLiked ? this.icons.liked : this.icons.like,
          flags: disabledFlags,
          click: () => this.send('thumbar:toggle-like')
        }
      ])

      const tip = this.tooltip()
      try {
        this.win.setThumbnailToolTip(tip)
      } catch {}
    } catch (e) {
      console.warn('[thumbar] setThumbarButtons failed:', e)
    }
  }

  private send(channel: string): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.win.webContents.isDestroyed()) return
    this.win.webContents.send(channel)
  }
}

export const thumbarService = new ThumbarService()
export default thumbarService
