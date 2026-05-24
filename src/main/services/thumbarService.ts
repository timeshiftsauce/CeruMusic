import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme, NativeImage } from 'electron'
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

/**
 * 判断 Windows 任务栏当前是否为深色主题(需要白色前景图标)。
 *
 * 实现:用 `registry-js`(GitHub Desktop 团队维护的纯 N-API 注册表库) 同步读取
 *   `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize\SystemUsesLightTheme`
 *
 * 历史踩坑(为什么不用其他方案):
 * 1. `nativeTheme.shouldUseDarkColors` 跟的是 `AppsUseLightTheme`(应用主题),
 *    不是任务栏主题 —— 用它判断任务栏会错。
 * 2. `nativeTheme.shouldUseDarkColorsForSystemIntegratedUI` 文档说跟 `SystemUsesLightTheme`,
 *    但 Electron 41 在本机实测返回值与注册表实际值不一致(测试机:apps=light/taskbar=dark
 *    时该属性返回 false,而 reg 实际是 SystemUsesLightTheme=0 应当为 dark)。
 *    可能是某个 Electron 版本的 bug,不再依赖。
 * 3. `execFileSync('reg.exe', ...)` 子进程 ~30-80ms 也能用,但 `registry-js` 是
 *    纯 native binding,亚毫秒级,且不弹黑窗、不受组策略"禁用 reg.exe"影响。
 *
 * `registry-js` 是 GitHub Desktop 的核心依赖,有 prebuilt 二进制,免本地编译。
 *
 * 调用时机:启动 init() 一次 + `nativeTheme.on('updated')` 触发时一次。
 */
function isTaskbarDark(): boolean {
  if (process.platform !== 'win32') return false
  try {
    // 懒加载 + 显式 any —— 即使包没装好(network 还在跑) require 会抛错,走兜底分支不影响启动。
    // 用 any 而非 `as typeof import('registry-js')` 是因为 build-time 包可能未就绪,
    // 走 any 让 TS 编译器在缺包时也能通过,运行时由 try/catch 兜底。
    const reg: any = require('registry-js')
    const values: Array<{ name: string; type: string; data: number | string }> =
      reg.enumerateValues(
        reg.HKEY.HKEY_CURRENT_USER,
        'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'
      )
    const entry = values.find((v) => v.name === 'SystemUsesLightTheme')
    if (!entry || entry.type !== 'REG_DWORD') {
      console.warn('[thumbar] SystemUsesLightTheme not found, falling back to nativeTheme')
      return nativeTheme.shouldUseDarkColors
    }
    // SystemUsesLightTheme=0 -> 任务栏深色, =1 -> 任务栏浅色
    return entry.data === 0
  } catch (e) {
    // registry-js 没装好 / native 二进制加载失败 —— 兜底用 nativeTheme
    console.warn('[thumbar] registry-js unavailable, falling back to nativeTheme:', e)
    return nativeTheme.shouldUseDarkColors
  }
}

const heartImplicit = (x: number, y: number): number =>
  Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y

function generateHeartPng(filled: boolean, color: 'white' | 'black' = 'white'): Buffer {
  const size = HEART_ICON_SIZE
  const SS = 4
  const png = new PNG({ width: size, height: size })
  const halfSize = size / 2
  const scale = size * 0.4
  const innerScale = size * 0.32
  const rgb = color === 'white' ? 255 : 0

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
      png.data[idx] = rgb
      png.data[idx + 1] = rgb
      png.data[idx + 2] = rgb
      png.data[idx + 3] = alpha
    }
  }

  return PNG.sync.write(png)
}

function loadOrGenerateIcons(useDark: boolean): IconSet {
  // 路径策略:
  // - dev: __dirname = <project>/out/main, 故 ../../resources/thumbar 命中源仓库 resources/thumbar
  // - 打包(asar+asarUnpack): electron-builder.yml 配置了 asarUnpack: resources/**,
  //   解包后真实路径是 <process.resourcesPath>/app.asar.unpacked/resources/thumbar
  //   而不是 <process.resourcesPath>/thumbar —— 后者只有在 extraResources 模式下才成立
  //
  // 颜色策略:跟随系统主题(不是软件主题)。
  // - useDark=true  -> 系统深色任务栏,用白色前景图标 (-dark 后缀的源 PNG, 实际像素是白色)
  // - useDark=false -> 系统浅色任务栏,用黑色前景图标 (-light 后缀的源 PNG, 实际像素是黑色)
  // 注意命名陷阱:文件名里的 light/dark 指的是"用在何种主题下",不是图标本身颜色。
  const suffix = useDark ? '-dark.png' : '-light.png'

  const userIconDir = path.join(app.getPath('userData'), 'thumbar')
  try {
    fs.mkdirSync(userIconDir, { recursive: true })
  } catch {}

  // 多路径回退:asar unpacked / 直接放在 resources 根 / dev 路径,任一命中即可
  const candidateDirs = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'thumbar'),
        path.join(process.resourcesPath, 'resources', 'thumbar'),
        path.join(process.resourcesPath, 'thumbar')
      ]
    : [path.join(__dirname, '../../resources/thumbar')]

  const loadFromDirs = (file: string): NativeImage => {
    for (const dir of candidateDirs) {
      const p = path.join(dir, file)
      if (!fs.existsSync(p)) continue
      try {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) return img
      } catch (e) {
        console.warn(`[thumbar] failed to load ${p}:`, e)
      }
    }
    console.warn(
      `[thumbar] icon not found in any of: ${candidateDirs.map((d) => path.join(d, file)).join(' | ')}`
    )
    return nativeImage.createEmpty()
  }

  const prev = loadFromDirs('prev' + suffix)
  const play = loadFromDirs('play' + suffix)
  const pause = loadFromDirs('pause' + suffix)
  const next = loadFromDirs('next' + suffix)

  // 心形图标:根据主题色选白/黑实时生成。主题切换时会重新调用此函数,不需缓存磁盘。
  const heartColor: 'white' | 'black' = useDark ? 'white' : 'black'
  const like = nativeImage.createFromBuffer(generateHeartPng(false, heartColor))
  const liked = nativeImage.createFromBuffer(generateHeartPng(true, heartColor))

  return {
    prev,
    play,
    pause,
    next,
    like,
    liked
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
    this.reloadIcons()
    const iconsOk =
      !!this.icons &&
      !this.icons.prev.isEmpty() &&
      !this.icons.play.isEmpty() &&
      !this.icons.pause.isEmpty() &&
      !this.icons.next.isEmpty()
    console.log(
      `[thumbar] init: iconsOk=${iconsOk} packaged=${app.isPackaged} taskbarDark=${isTaskbarDark()} (nativeTheme.dark=${nativeTheme.shouldUseDarkColors}) resourcesPath=${process.resourcesPath}`
    )
    this.bindIpc()
    this.bindNativeTheme()
    this.update()

    win.once('closed', () => {
      this.win = null
    })
  }

  /**
   * 重新加载图标 —— 根据当前任务栏主题(不是应用主题)选择对应配色的图标集。
   */
  private reloadIcons(): void {
    this.icons = loadOrGenerateIcons(isTaskbarDark())
  }

  private nativeThemeListenerBound = false
  private bindNativeTheme(): void {
    if (this.nativeThemeListenerBound) return
    this.nativeThemeListenerBound = true
    // nativeTheme.on('updated') 在用户在 Windows 设置里切换任何一个主题开关时都会触发
    // (包括 AppsUseLightTheme 和 SystemUsesLightTheme)。我们只关心 SystemUsesLightTheme,
    // 但其它主题切换时重新读一次注册表也不贵,负担可忽略。
    nativeTheme.on('updated', () => {
      const taskbarDark = isTaskbarDark()
      console.log(
        `[thumbar] nativeTheme updated: taskbarDark=${taskbarDark} (nativeTheme.dark=${nativeTheme.shouldUseDarkColors}), reloading icons`
      )
      this.reloadIcons()
      this.update()
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
    // 按钮始终可用 —— 即使无歌也显示工具栏(类似网易云/QQ音乐),
    // 点击 prev/play/next 由 renderer 端兜底处理空状态。
    // hasSong=false 时只把"喜欢"按钮禁用(因为没歌就没收藏对象)。
    const enabled: Array<
      'enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive'
    > = []
    const likeFlags: Array<
      'enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive'
    > = hasSong ? [] : ['disabled']

    // 校验图标:任一为空 image 时 setThumbarButtons 会整组失败 ——
    // 提前用 console.warn 暴露问题,而不是静默丢失。
    const iconsOk =
      !this.icons.prev.isEmpty() &&
      !this.icons.play.isEmpty() &&
      !this.icons.pause.isEmpty() &&
      !this.icons.next.isEmpty() &&
      !this.icons.like.isEmpty() &&
      !this.icons.liked.isEmpty()
    if (!iconsOk) {
      console.warn('[thumbar] one or more icons are empty, toolbar may not render')
    }

    try {
      const ok = this.win.setThumbarButtons([
        {
          tooltip: '上一首',
          icon: this.icons.prev,
          flags: enabled,
          click: () => this.send('playPrev')
        },
        {
          tooltip: isPlaying ? '暂停' : '播放',
          icon: isPlaying ? this.icons.pause : this.icons.play,
          flags: enabled,
          click: () => this.send('music-control')
        },
        {
          tooltip: '下一首',
          icon: this.icons.next,
          flags: enabled,
          click: () => this.send('playNext')
        },
        {
          tooltip: isLiked ? '取消喜欢' : '喜欢',
          icon: isLiked ? this.icons.liked : this.icons.like,
          flags: likeFlags,
          click: () => this.send('thumbar:toggle-like')
        }
      ])
      // Electron 返回 boolean:false 表示按钮未能添加(常见原因:窗口尚未显示 / 图标无效)
      if (!ok) {
        console.warn(
          '[thumbar] setThumbarButtons returned false (window not shown yet or invalid icons)'
        )
      }

      const tip = this.tooltip()
      try {
        this.win.setThumbnailToolTip(tip || '澜音 Ceru Music')
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
