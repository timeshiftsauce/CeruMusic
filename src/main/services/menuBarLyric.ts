import type { Tray } from 'electron'
import { configManager } from './ConfigManager'

type MenuBarSong = {
  name?: string | null
  artist?: string | null
}

type MenuBarLyricWord = {
  word?: string | null
}

type MenuBarLyricLine = {
  words?: MenuBarLyricWord[] | null
}

type MenuBarLyricPersistedState = {
  enabled?: boolean
  lastSongTitle?: string
}

const MENU_BAR_LYRIC_CONFIG_KEY = 'macStatusBarLyric'

const getPersistedState = () =>
  configManager.get<MenuBarLyricPersistedState>(MENU_BAR_LYRIC_CONFIG_KEY, {
    enabled: false,
    lastSongTitle: ''
  })

const savePersistedState = (value: Partial<MenuBarLyricPersistedState>) =>
  configManager.set<MenuBarLyricPersistedState>(MENU_BAR_LYRIC_CONFIG_KEY, {
    ...getPersistedState(),
    ...value
  })

const initialPersistedState = getPersistedState()

const DEFAULT_DISPLAY_WIDTH = 14
const ASCII_DISPLAY_WIDTH = 30
const DEFAULT_SCROLL_GAP = '   '
const ASCII_SCROLL_GAP = ' '
const SCROLL_START_DELAY_MS = 1200
const SCROLL_INTERVAL_MS = 380
const PADDING_CHAR = ' '
const ZERO_WIDTH_PATTERN = /[​-‍﻿]/g
// eslint-disable-next-line no-control-regex
const ASCII_CHAR_PATTERN = /[\x00-\x7F]/
const TITLE_OPTIONS = { fontType: 'monospaced' as const }

// 零宽度空格：视觉完全不可见，但让 macOS 认为 tray 有内容，从而保持菜单位置持久化
const INVISIBLE_PLACEHOLDER = '​'

const normalizeText = (text: string) =>
  text.replace(ZERO_WIDTH_PATTERN, '').replace(/\s+/g, ' ').trim()

const getChars = (text: string) => Array.from(text)

const isAsciiDominantText = (text: string) => {
  const chars = getChars(text).filter((char) => char.trim().length > 0)
  if (chars.length === 0) return false
  const asciiCount = chars.filter((char) => ASCII_CHAR_PATTERN.test(char)).length
  return asciiCount / chars.length >= 0.85
}

const getDisplayWidth = (text: string) =>
  isAsciiDominantText(text) ? ASCII_DISPLAY_WIDTH : DEFAULT_DISPLAY_WIDTH

const getScrollGap = (text: string) =>
  isAsciiDominantText(text) ? ASCII_SCROLL_GAP : DEFAULT_SCROLL_GAP

const padDisplayText = (text: string, width = DEFAULT_DISPLAY_WIDTH) => {
  const chars = getChars(text)
  if (chars.length >= width) return chars.slice(0, width).join('')
  return `${text}${PADDING_CHAR.repeat(width - chars.length)}`
}

const getPlainLineText = (line?: MenuBarLyricLine | null) => {
  if (!line?.words?.length) return ''
  return normalizeText(line.words.map((word) => word?.word || '').join(''))
}

const formatSongTitle = (song: Required<MenuBarSong>) => {
  const parts = [song.name, song.artist].map((item) => normalizeText(item || '')).filter(Boolean)
  return parts.join(' - ')
}

class MenuBarLyricService {
  private tray: Tray | null = null
  private enabled = !!initialPersistedState.enabled
  private persistedSongTitle = normalizeText(initialPersistedState.lastSongTitle || '')
  private enabledChangeHandler: ((enabled: boolean) => void) | null = null
  private song: Required<MenuBarSong> = { name: '', artist: '' }
  private lyrics: string[] = []
  private currentIndex = -1
  private playStatus = false
  private lastTitle = ''
  private sourceText = ''
  private scrollOffset = 0
  private scrollTimer: NodeJS.Timeout | null = null
  private scrollStartTimer: NodeJS.Timeout | null = null

  setTray(tray: Tray | null) {
    this.tray = tray
    this.lastTitle = ''

    if (!tray) {
      this.stopMarquee()
      return
    }
    if (this.enabled) {
      this.refresh()
      return
    }
    this.clear()
  }

  setEnabled(enabled: boolean) {
    this.enabled = !!enabled
    savePersistedState({ enabled: this.enabled })
    this.enabledChangeHandler?.(this.enabled)
    if (!this.enabled) {
      this.clear()
      return
    }
    this.refresh()
  }

  isEnabled() {
    return this.enabled
  }

  onEnabledChange(handler: ((enabled: boolean) => void) | null) {
    this.enabledChangeHandler = handler
  }

  setSong(song?: MenuBarSong | string | null) {
    if (typeof song === 'string') {
      this.song = { name: normalizeText(song), artist: '' }
    } else {
      this.song = {
        name: normalizeText(song?.name || ''),
        artist: normalizeText(song?.artist || '')
      }
    }

    const nextSongTitle = formatSongTitle(this.song)
    if (nextSongTitle) {
      this.persistedSongTitle = nextSongTitle
      savePersistedState({ lastSongTitle: nextSongTitle })
    }

    this.refresh()
  }

  setLyrics(lines?: MenuBarLyricLine[] | null) {
    this.lyrics = (lines || []).map((line) => getPlainLineText(line))
    this.currentIndex = -1
    this.refresh()
  }

  setIndex(index: number) {
    this.currentIndex = Number.isInteger(index) ? index : -1
    this.refresh()
  }

  setPlayStatus(status: boolean) {
    this.playStatus = !!status
    this.refresh()
  }

  refresh() {
    if (process.platform !== 'darwin' || !this.tray) return

    if (!this.enabled) {
      this.applyTitle(INVISIBLE_PLACEHOLDER)
      return
    }

    const nextSourceText = this.buildSourceText()
    if (nextSourceText !== this.sourceText) {
      this.sourceText = nextSourceText
      this.scrollOffset = 0
      this.restartMarquee()
    }

    this.applyTitle(this.computeDisplayTitle())
  }

  clear() {
    this.sourceText = ''
    this.scrollOffset = 0
    this.stopMarquee()
    this.applyTitle(INVISIBLE_PLACEHOLDER)
  }

  private buildSourceText() {
    const currentLyric = this.getCurrentLyricLine()
    const fallbackSong = formatSongTitle(this.song)
    return currentLyric || fallbackSong || this.persistedSongTitle
  }

  private computeDisplayTitle() {
    if (!this.sourceText) return ''

    const displayWidth = getDisplayWidth(this.sourceText)
    const scrollGap = getScrollGap(this.sourceText)
    const chars = getChars(this.sourceText)
    if (chars.length <= displayWidth) {
      return padDisplayText(this.sourceText, displayWidth)
    }

    const marqueeSource = `${this.sourceText}${scrollGap}`
    const marqueeChars = getChars(marqueeSource)
    const start = this.scrollOffset % marqueeChars.length
    const doubledChars = [...marqueeChars, ...marqueeChars]
    return doubledChars.slice(start, start + displayWidth).join('')
  }

  private restartMarquee() {
    this.stopMarquee()
    const displayWidth = getDisplayWidth(this.sourceText)
    const scrollGap = getScrollGap(this.sourceText)
    if (!this.sourceText || getChars(this.sourceText).length <= displayWidth) return

    this.scrollStartTimer = setTimeout(() => {
      this.scrollTimer = setInterval(() => {
        const totalWidth = getChars(`${this.sourceText}${scrollGap}`).length
        this.scrollOffset = (this.scrollOffset + 1) % totalWidth
        this.applyTitle(this.computeDisplayTitle())
      }, SCROLL_INTERVAL_MS)
    }, SCROLL_START_DELAY_MS)
  }

  private stopMarquee() {
    if (this.scrollStartTimer) {
      clearTimeout(this.scrollStartTimer)
      this.scrollStartTimer = null
    }
    if (this.scrollTimer) {
      clearInterval(this.scrollTimer)
      this.scrollTimer = null
    }
  }

  private applyTitle(title: string) {
    if (process.platform !== 'darwin' || !this.tray) return
    if (title === this.lastTitle) return

    this.lastTitle = title
    this.tray.setTitle(title, TITLE_OPTIONS)
  }

  private getCurrentLyricLine() {
    if (!this.playStatus) {
      return this.currentIndex >= 0 ? this.lyrics[this.currentIndex] || '' : ''
    }
    return this.currentIndex >= 0 ? this.lyrics[this.currentIndex] || '' : ''
  }
}

export default new MenuBarLyricService()
