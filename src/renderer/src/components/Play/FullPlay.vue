<script lang="ts" setup>
import {
  BackgroundRender as CoreBackgroundRender,
  PixiRenderer
} from '@applemusic-like-lyrics/core'
import { LyricPlayer, type LyricPlayerRef } from '@applemusic-like-lyrics/vue'
import type { SongList } from '@renderer/types/audio'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { ref, computed, onMounted, watch, reactive, onBeforeUnmount, toRaw } from 'vue'
import { shouldUseBlackText } from '@renderer/utils/color/contrastColor'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import {
  Fullscreen1Icon,
  FullscreenExit1Icon,
  ChevronDownIcon,
  PenBallIcon
} from 'tdesign-icons-vue-next'
// 直接从包路径导入，避免 WebAssembly 导入问题
import { parseYrc, parseLrc, parseTTML, parseQrc } from '@applemusic-like-lyrics/lyric'
import * as _ from 'lodash'
import { storeToRefs } from 'pinia'
import { NSwitch } from 'naive-ui'
import { useSettingsStore } from '@renderer/store/Settings'

// 全局播放模式设置
import { usePlaySettingStore } from '@renderer/store'

const playSetting = usePlaySettingStore()
const settingsStore = useSettingsStore()
const showSettings = ref(false)

const lyricFontFamily = computed(
  () => settingsStore.settings.lyricFontFamily || 'PingFangSC-Semibold'
)

const showLeftPanel = computed({
  get: () => playSetting.getShowLeftPanel,
  set: (val) => playSetting.setShowLeftPanel(val)
})

interface Props {
  show?: boolean
  coverImage?: string
  songId?: string | null
  songInfo: SongList | { songmid: number | null | string; lrc: string | null }
  mainColor: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg',
  songId: '',
  mainColor: '#rgb(0,0,0)'
})
// 定义事件
const emit = defineEmits(['toggle-fullscreen', 'idle-change'])

// 跟踪全屏状态
const isFullscreen = ref(false)

// 自动隐藏相关逻辑
const isIdle = ref(false)
let idleTimer: any = null

const resetIdleTimer = () => {
  if (!playSetting.getAutoHideBottom) {
    isIdle.value = false
    emit('idle-change', false)
    return
  }

  // 恢复显示时
  if (isIdle.value) {
    isIdle.value = false
    emit('idle-change', false)
  }

  if (idleTimer) clearTimeout(idleTimer)

  if (props.show) {
    idleTimer = setTimeout(() => {
      if (props.show && playSetting.getAutoHideBottom && !showSettings.value) {
        isIdle.value = true
        emit('idle-change', true)
      }
    }, 3000)
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      resetIdleTimer()
      window.addEventListener('mousemove', resetIdleTimer)
    } else {
      window.removeEventListener('mousemove', resetIdleTimer)
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    }
  },
  { immediate: true }
)

watch(
  () => playSetting.getAutoHideBottom,
  (val) => {
    if (!val) {
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    } else {
      resetIdleTimer()
    }
  }
)

watch(
  () => showSettings.value,
  (val) => {
    if (val) {
      // 打开设置时，取消自动隐藏
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    } else {
      resetIdleTimer()
    }
  }
)

// 切换全屏模式
const toggleFullscreen = () => {
  // 切换全屏状态
  isFullscreen.value = !isFullscreen.value

  // 调用 Electron API 切换全屏
  window.api.toggleFullscreen()
}

// 监听 ESC 键退出全屏
onMounted(async () => {
  // 添加事件监听器检测全屏状态变化
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

onBeforeUnmount(() => {
  // 移除事件监听器
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

// 处理全屏状态变化
const handleFullscreenChange = () => {
  // 检查当前是否处于全屏状态
  const fullscreenElement = document.fullscreenElement

  // 更新状态
  isFullscreen.value = !!fullscreenElement
}

// 获取音频控制状态
const controlAudio = ControlAudioStore()
const { Audio } = storeToRefs(controlAudio)

// 响应式播放状态
const isAudioPlaying = ref(false)

// 更新播放状态的函数
const updatePlayState = () => {
  if (Audio.value.audio) {
    isAudioPlaying.value = !Audio.value.audio.paused
  } else {
    isAudioPlaying.value = false
  }
}

// 监听音频播放状态变化
watch(
  () => Audio.value.audio,
  (newAudio, oldAudio) => {
    // 移除旧音频的事件监听器
    if (oldAudio) {
      oldAudio.removeEventListener('play', updatePlayState)
      oldAudio.removeEventListener('pause', updatePlayState)
    }

    // 添加新音频的事件监听器
    if (newAudio) {
      newAudio.addEventListener('play', updatePlayState)
      newAudio.addEventListener('pause', updatePlayState)
      // 初始化状态
      updatePlayState()
    }
  },
  { immediate: true }
)

// 清理事件监听器
onBeforeUnmount(() => {
  if (Audio.value.audio) {
    Audio.value.audio.removeEventListener('play', updatePlayState)
    Audio.value.audio.removeEventListener('pause', updatePlayState)
  }
})
// 组件内部状态
const state = reactive({
  audioUrl: Audio.value.url,
  albumUrl: props.coverImage,
  albumIsVideo: false,
  currentTime: 0,
  lyricLines: [] as LyricLine[],
  lowFreqVolume: 1.0
})

const sanitizeLyricLines = (lines: LyricLine[]): LyricLine[] => {
  const defaultLineDuration = 3000
  const toFiniteNumber = (v: any, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const cleaned: LyricLine[] = []
  for (const rawLine of lines || []) {
    const rawWords = Array.isArray((rawLine as any).words) ? (rawLine as any).words : []
    const fixedWords: any[] = []
    let prevEnd = -1
    for (const rawWord of rawWords) {
      const rawStart = toFiniteNumber(rawWord?.startTime, Number.NaN)
      const rawEnd = toFiniteNumber(rawWord?.endTime, Number.NaN)
      if (!Number.isFinite(rawStart)) continue
      let startTime = Math.max(0, rawStart)
      if (startTime < prevEnd) startTime = prevEnd
      let endTime = Number.isFinite(rawEnd) ? rawEnd : startTime + 1
      if (endTime <= startTime) endTime = startTime + 1
      prevEnd = endTime
      fixedWords.push({ ...rawWord, startTime, endTime })
    }
    if (fixedWords.length === 0) continue

    const firstWordStart = fixedWords[0].startTime
    const lastWordEnd = fixedWords[fixedWords.length - 1].endTime
    let startTime = toFiniteNumber((rawLine as any).startTime, firstWordStart)
    startTime = Math.max(0, startTime)
    let endTime = toFiniteNumber((rawLine as any).endTime, lastWordEnd)
    if (!Number.isFinite(endTime) || endTime <= startTime) endTime = startTime + defaultLineDuration
    if (endTime < lastWordEnd) endTime = lastWordEnd

    cleaned.push({ ...(rawLine as any), startTime, endTime, words: fixedWords })
  }
  cleaned.sort((a: any, b: any) => (a?.startTime ?? 0) - (b?.startTime ?? 0))
  return cleaned
}

// 监听歌曲ID变化，获取歌词
watch(
  () => props.songId,
  async (newId, _oldId, onCleanup) => {
    if (!newId || !props.songInfo) return
    // 竞态与取消控制，防止内存泄漏与过期结果覆盖
    let active = true
    const abort = new AbortController()
    onCleanup(() => {
      active = false
      abort.abort()
    })
    // 工具函数：清洗响应式对象，避免序列化问题
    const getCleanSongInfo = () => JSON.parse(JSON.stringify(toRaw(props.songInfo)))

    // 工具函数：按来源解析逐字歌词
    const parseCrLyricBySource = (source: string, text: string): LyricLine[] => {
      return source === 'tx' ? parseQrc(text) : parseYrc(text)
    }

    // 工具函数：合并翻译到主歌词
    const mergeTranslation = (base: LyricLine[], tlyric?: string): LyricLine[] => {
      if (!tlyric || base.length === 0) return base

      const translated = parseLrc(tlyric)
      if (!translated || translated.length === 0) return base

      // 将译文按 startTime-endTime 建立索引，便于精确匹配
      const keyOf = (s: number, e: number) => `${s}-${e}`
      const joinWords = (line: LyricLine) => (line.words || []).map((w) => w.word).join('')

      const tMap = new Map<string, LyricLine>()
      for (const tl of translated) {
        tMap.set(keyOf(tl.startTime, tl.endTime), tl)
      }

      // 动态容差：与行时长相关，避免长/短行同一阈值导致误配
      const baseTolerance = 300 // 上限
      const ratioTolerance = 0.4 // 与行时长的比例

      // 锚点对齐 + 顺序映射：以第一行为锚点，后续按索引顺序插入译文
      const translatedSorted = translated.slice().sort((a, b) => a.startTime - b.startTime)

      if (base.length > 0) {
        const firstBase = base[0]
        const firstDuration = Math.max(1, firstBase.endTime - firstBase.startTime)
        const firstTol = Math.min(baseTolerance, firstDuration * ratioTolerance)

        // 在容差内寻找与第一行起始时间最接近的译文行作为锚点
        let anchorIndex: number | null = null
        let bestDiff = Number.POSITIVE_INFINITY
        for (let i = 0; i < translatedSorted.length; i++) {
          const diff = Math.abs(translatedSorted[i].startTime - firstBase.startTime)
          if (diff <= firstTol && diff < bestDiff) {
            bestDiff = diff
            anchorIndex = i
          }
        }

        if (anchorIndex !== null) {
          // 从锚点开始顺序映射
          let j = anchorIndex
          for (let i = 0; i < base.length && j < translatedSorted.length; i++, j++) {
            const bl = base[i]
            const tl = translatedSorted[j]
            if (tl.words[0].word === '//' || !bl.words[0].word) continue
            const text = joinWords(tl)
            if (text) bl.translatedLyric = text
          }
          return base
        }
      }

      // 未找到锚点：保持原样
      return base
    }

    try {
      const source =
        props.songInfo && 'source' in props.songInfo ? (props.songInfo as any).source : 'kg'
      let parsedLyrics: LyricLine[] = []

      if (source === 'wy' || source === 'tx') {
        // 网易云 / QQ 音乐：优先尝试 TTML，同时准备备用方案
        // 1. 立即启动 SDK (回退) 请求，但不 await
        // 将其 Promise 存储在 sdkPromise 变量中
        const sdkPromise = (async () => {
          try {
            const lyricData = await window.api.music.requestSdk('getLyric', {
              source,
              songInfo: _.cloneDeep(toRaw(props.songInfo)) as any
              // 注意：这里的 abort.signal 是用于 TTML 的
              // 如果 requestSdk 也支持 signal，你可以考虑也传入
            })
            console.log('sdkPromise', lyricData)
            // 依赖外部的 active 检查
            if (!active) return null

            let lyrics: null | LyricLine[] = null
            if (lyricData?.crlyric) {
              console.log('crlyric', lyricData.crlyric)
              lyrics = parseCrLyricBySource(source, lyricData.crlyric)
            } else if (lyricData?.lyric) {
              lyrics = parseLrc(lyricData.lyric)
            }
            lyrics = mergeTranslation(lyrics as any, lyricData?.tlyric)

            // 如果 SDK 也拿不到歌词，返回 null
            if (!lyrics || lyrics.length === 0) {
              return null
            }
            return lyrics
          } catch (err: any) {
            // 如果 SDK 请求失败，抛出错误
            // 这样当 TTML 也失败时，可以捕获到这个 SDK 错误
            throw new Error(`SDK request failed: ${err.message}`)
          }
        })()

        // 2. 尝试 TTML (主要) 请求
        try {
          const res = await (
            await fetch(
              `https://amll-ttml-db.stevexmh.net/${source === 'wy' ? 'ncm' : 'qq'}/${newId}`,
              {
                signal: abort.signal // TTML 请求使用 abort signal
              }
            )
          ).text()

          if (!active) return

          if (!res || res.length < 100) {
            throw new Error('ttml 无歌词') // 抛出错误以触发 catch
          }

          const ttmlLyrics = parseTTML(res).lines

          if (!ttmlLyrics || ttmlLyrics.length === 0) {
            throw new Error('TTML 解析为空') // 抛出错误以触发 catch
          }

          // --- TTML 成功 ---
          parsedLyrics = ttmlLyrics

          // 此时我们不再关心 SDK 的结果
          // 为防止 sdkPromise 失败时出现 "unhandled rejection"，
          // 我们给它加一个空的 catch 来“静音”它的潜在错误。
          sdkPromise.catch(() => {
            /* TTML 优先，忽略 SDK 的错误 */
          })
        } catch (ttmlError: any) {
          // --- TTML 失败，回退到 SDK ---
          // 检查是否是因为中止操作
          if (!active || (ttmlError && ttmlError.name === 'AbortError')) {
            return
          }

          // console.log('TTML failed, falling back to SDK:', ttmlError.message);

          try {
            // 现在等待已经启动的 SDK 请求
            const sdkLyrics = await sdkPromise

            if (sdkLyrics) {
              parsedLyrics = sdkLyrics
            } else {
              // SDK 也失败了或没有返回歌词
              // console.log('SDK fallback also provided no lyrics.');
              parsedLyrics = [] // 或者保持原样
            }
          } catch (sdkError) {
            // TTML 和 SDK 都失败了
            // console.error('Both TTML and SDK failed:', { ttmlError, sdkError });
            parsedLyrics = [] // 最终回退
          }
        }
      } else if (source !== 'local') {
        // 其他来源：直接统一歌词 API
        const lyricData = await window.api.music.requestSdk('getLyric', {
          source,
          songInfo: getCleanSongInfo()
        })
        if (!active) return

        if (lyricData?.crlyric) {
          parsedLyrics = parseCrLyricBySource(source, lyricData.crlyric)
        } else if (lyricData?.lyric) {
          parsedLyrics = parseLrc(lyricData.lyric)
        }

        parsedLyrics = mergeTranslation(parsedLyrics, lyricData?.tlyric)
      } else {
        let text = (props.songInfo as any).lrc as string | null
        // 如果是本地音乐且没有歌词，则从主进程获取
        if (!text) {
          text = await window.api.music.invoke(
            'local-music:get-lyric',
            (props.songInfo as any).songmid
          )
        }

        if (text && (/^\[(\d+),\d+\]/.test(text) || /\(\d+,\d+,\d+\)/.test(text))) {
          parsedLyrics = text ? (parseYrc(text) as any) : []
        } else {
          parsedLyrics = text ? (parseLrc(text) as any) : []
        }
      }
      if (!active) return
      const oldHasLyric = state.lyricLines.length > 10
      state.lyricLines = parsedLyrics.length > 0 ? sanitizeLyricLines(parsedLyrics) : []
      const newHasLyric = state.lyricLines.length > 10
      // 如果hasLyric条件改变，更新背景渲染器的hasLyric参数
      if (oldHasLyric !== newHasLyric && bgRef.value) {
        bgRef.value.setHasLyric(newHasLyric)
      }
    } catch (error) {
      console.error('获取歌词失败:', error)
      // 若已无效或已清理，避免写入与持有引用
      if (!active) return
      const oldHasLyric = state.lyricLines.length > 10
      state.lyricLines = []
      const newHasLyric = false
      // 如果hasLyric条件改变，更新背景渲染器的hasLyric参数
      if (oldHasLyric !== newHasLyric && bgRef.value) {
        bgRef.value.setHasLyric(newHasLyric)
      }
    }
  },
  { immediate: true }
)

const bgRef = ref<CoreBackgroundRender<PixiRenderer> | undefined>(undefined)
const lyricPlayerRef = ref<LyricPlayerRef | undefined>(undefined)
const backgroundContainer = ref<HTMLDivElement | null>(null)

// 订阅音频事件，保持数据同步
const unsubscribeTimeUpdate = ref<(() => void) | undefined>(undefined)
const unsubscribePlay = ref<(() => void) | undefined>(undefined)

// 计算实际的封面图片路径
const actualCoverImage = computed(() => {
  // 如果是相对路径，保持原样，否则使用默认图片
  return props.coverImage || '@assets/images/Default.jpg'
})

// 文本颜色状态
const useBlackText = ref(false)

// 更新文本颜色
async function updateTextColor() {
  try {
    useBlackText.value = await shouldUseBlackText(actualCoverImage.value)
  } catch (error) {
    console.error('获取对比色失败:', error)
    useBlackText.value = false // 默认使用白色文本
  }
}
const jumpTime = (e) => {
  if (Audio.value.audio) Audio.value.audio.currentTime = e.line.getLine().startTime / 1000
}
// 监听封面图片变化
watch(
  () => actualCoverImage.value,
  async (newImage) => {
    updateTextColor()
    // 更新背景图片
    if (bgRef.value) {
      await bgRef.value.setAlbum(newImage, false)
    }
  },
  { immediate: true }
)

// 在全屏播放显示时阻止系统息屏
const blockerActive = ref(false)
watch(
  () => props.show,
  async (visible) => {
    try {
      if (visible && !blockerActive.value) {
        await (window as any)?.api?.powerSaveBlocker?.start?.()
        blockerActive.value = true
      } else if (!visible && blockerActive.value) {
        await (window as any)?.api?.powerSaveBlocker?.stop?.()
        blockerActive.value = false
      }
    } catch (e) {
      console.error('powerSaveBlocker 切换失败:', e)
    }
  },
  { immediate: true }
)

// 初始化背景渲染器的函数
const initBackgroundRender = async () => {
  if (backgroundContainer.value) {
    // 清理旧实例
    if (bgRef.value) {
      bgRef.value.dispose()
      // 移除canvas元素
      const canvas = bgRef.value.getElement()
      canvas?.parentNode?.removeChild(canvas)
    }

    // 创建新实例
    bgRef.value = CoreBackgroundRender.new(PixiRenderer)

    // 获取canvas元素并添加到DOM
    const canvas = bgRef.value.getElement()
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '-1'

    backgroundContainer.value.appendChild(canvas)

    // 设置参数
    bgRef.value.setRenderScale(0.5)
    bgRef.value.setFlowSpeed(1)
    bgRef.value.setFPS(60)
    bgRef.value.setHasLyric(state.lyricLines.length > 10)

    // 设置专辑图片
    await bgRef.value.setAlbum(actualCoverImage.value, false)

    // 恢复动画
    bgRef.value.resume()
  }
}

// 组件挂载时初始化
onMounted(async () => {
  updateTextColor()
  await initBackgroundRender()
})

// 组件卸载前清理订阅
onBeforeUnmount(async () => {
  // 组件卸载时确保恢复系统息屏
  if (blockerActive.value) {
    try {
      await (window as any)?.api?.powerSaveBlocker?.stop?.()
    } catch {}
    blockerActive.value = false
  }
  // 取消订阅以防止内存泄漏
  if (unsubscribeTimeUpdate.value) {
    unsubscribeTimeUpdate.value()
  }
  if (unsubscribePlay.value) {
    unsubscribePlay.value()
  }
  // 清理背景渲染器资源
  if (bgRef.value) {
    const canvas = bgRef.value.getElement()
    canvas?.parentNode?.removeChild(canvas)
    bgRef.value.dispose()
    bgRef.value = undefined
  }
  // 清理歌词播放器资源
  lyricPlayerRef.value?.lyricPlayer?.dispose()
})

// 监听音频URL变化
watch(
  () => Audio.value.url,
  (newUrl) => {
    state.audioUrl = newUrl
  }
)

// 监听当前播放时间变化
watch(
  () => Audio.value.currentTime,
  (newTime) => {
    state.currentTime = Math.round(newTime * 1000)
  }
)

// 处理低频音量更新
const handleLowFreqUpdate = (volume: number) => {
  state.lowFreqVolume = volume
  console.log('lowFreqVolume', volume)
}

// 计算偏白的主题色
const lightMainColor = computed(() => {
  const color = props.mainColor
  // 解析rgb颜色值
  const rgbMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*\d+\)/)
  if (rgbMatch) {
    let r = parseInt(rgbMatch[1])
    let g = parseInt(rgbMatch[2])
    let b = parseInt(rgbMatch[3])

    // 适度向白色偏移，保持主题色特征
    r = Math.min(255, r + (255 - r) * 0.8)
    g = Math.min(255, g + (255 - g) * 0.8)
    b = Math.min(255, b + (255 - b) * 0.8)

    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.9)`
  }
  // 如果解析失败，返回默认的偏白色
  return 'rgba(255, 255, 255, 0.9)'
})

// 计算歌词颜色
const lyricViewColor = computed(() => {
  return playSetting.getIsImmersiveLyricColor ? lightMainColor.value : 'rgba(255, 255, 255, 1)'
})

const lyricHeight = computed(() => {
  return playSetting.getisJumpLyric ? '100%' : '200%'
})
const lyricTranslateY = computed(() => {
  return playSetting.getisJumpLyric ? '0' : '-25%'
})

// --- 滚动文字逻辑 Start ---
const titleRef = ref<HTMLElement | null>(null)
const shouldScrollTitle = ref(false)
const titleContentRef = ref<HTMLElement | null>(null)

const songName = computed(() => {
  const info = props.songInfo
  if (info && 'name' in info && typeof info.name === 'string') {
    return info.name
  }
  return '未知歌曲'
})

const checkOverflow = async () => {
  await nextTick()

  // 检查标题
  if (titleRef.value && titleContentRef.value) {
    // 比较内容宽度（scrollWidth）和容器宽度（clientWidth）
    // 为了准确测量，暂时移除滚动相关的类可能会更准，但这里我们主要看 content 的自然宽度
    const containerWidth = titleRef.value.clientWidth
    const contentWidth = titleContentRef.value.offsetWidth
    shouldScrollTitle.value = contentWidth > containerWidth
  }
}

// 监听歌曲信息变化和窗口大小变化
watch(() => [props.songInfo, props.show], checkOverflow, { immediate: true })

// 点击外部关闭设置面板
const floatActionRef = ref<HTMLElement | null>(null)
const handleClickOutside = (event: MouseEvent) => {
  if (
    showSettings.value &&
    floatActionRef.value &&
    !floatActionRef.value.contains(event.target as Node)
  ) {
    showSettings.value = false
  }
}

// 保存 debounce 函数引用以便后续移除
const debouncedCheckOverflow = _.debounce(checkOverflow, 200)

onMounted(() => {
  window.addEventListener('resize', debouncedCheckOverflow)
  document.addEventListener('click', handleClickOutside)
  // 初始检查
  setTimeout(checkOverflow, 500)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', debouncedCheckOverflow)
  document.removeEventListener('click', handleClickOutside)
})
// --- 滚动文字逻辑 End ---
</script>

<template>
  <div
    class="full-play"
    :class="{ active: props.show, 'use-black-text': useBlackText, idle: isIdle }"
  >
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <div
      ref="backgroundContainer"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1"
    ></div>
    <!-- 全屏按钮 -->
    <button
      class="fullscreen-btn"
      :class="{ 'black-text': useBlackText }"
      @click="toggleFullscreen"
    >
      <Fullscreen1Icon v-if="!isFullscreen" class="icon" />
      <FullscreenExit1Icon v-else class="icon" />
    </button>
    <button
      class="putawayscreen-btn"
      :class="{ 'black-text': useBlackText }"
      @click="emit('toggle-fullscreen')"
    >
      <ChevronDownIcon class="icon" />
    </button>
    <Transition name="fade-nav">
      <TitleBarControls
        v-if="props.show"
        class="top"
        style="-webkit-app-region: drag"
        :color="useBlackText ? 'black' : 'white'"
        :show-account="false"
      />
    </Transition>
    <div
      class="playbox"
      :style="{ padding: playSetting.getLayoutMode === 'cover' ? '0 8vw' : '0 10vw' }"
      :class="{
        'mode-cover': playSetting.getLayoutMode === 'cover',
        'single-column': !showLeftPanel
      }"
    >
      <div class="left" :style="state.lyricLines.length <= 0 && showLeftPanel ? 'width:100vw' : ''">
        <template v-if="playSetting.getLayoutMode === 'cd'">
          <img
            class="pointer"
            :class="{ playing: isAudioPlaying }"
            src="@renderer/assets/pointer.png"
            alt="pointer"
          />
          <div
            class="cd-container"
            :class="{ playing: isAudioPlaying }"
            :style="
              !isAudioPlaying
                ? 'animation-play-state: paused;'
                : '' +
                  (state.lyricLines.length <= 0
                    ? 'width:70vh;height:70vh; transition: width 0.3s ease, height 0.3s ease; transition-delay: 0.8s;'
                    : '')
            "
          >
            <!-- 黑胶唱片 -->
            <div class="vinyl-record"></div>
            <!-- 唱片标签 -->
            <div class="vinyl-label">
              <s-image :src="coverImage" shape="circle" class="cover" />
              <div class="label-shine"></div>
            </div>
            <!-- 中心孔 -->
            <div class="center-hole"></div>
          </div>
        </template>

        <template v-else-if="playSetting.getLayoutMode === 'cover'">
          <div class="cover-layout-container">
            <div class="cover-wrapper-square" :class="{ playing: controlAudio.Audio.isPlay }">
              <s-image :src="actualCoverImage" class="cover-img-square" shape="round" fit="cover" />
            </div>
            <div class="song-info-area">
              <div ref="titleRef" class="song-title-large text-scroll-container">
                <div class="text-scroll-wrapper" :class="{ 'animate-scroll': shouldScrollTitle }">
                  <div ref="titleContentRef" class="text-scroll-item">
                    {{ songName }}
                  </div>
                  <div v-if="shouldScrollTitle" class="text-scroll-item">
                    {{ songName }}
                  </div>
                </div>
              </div>
              <div class="song-meta-large">
                <span class="artist">{{ (props.songInfo as any)?.singer }}</span>
                <span
                  v-if="(props.songInfo as any)?.singer && (props.songInfo as any)?.albumName"
                  class="divider"
                >
                  /
                </span>
                <span class="album">{{ (props.songInfo as any)?.albumName }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div v-if="state.lyricLines.length > 0" class="right">
        <LyricPlayer
          ref="lyricPlayerRef"
          :lyric-lines="state.lyricLines || []"
          :current-time="state.currentTime"
          :playing="isAudioPlaying"
          class="lyric-player"
          :align-position="
            playSetting.getLayoutMode === 'cd' ? 0.5 : playSetting.getisJumpLyric ? 0.3 : 0.38
          "
          :enable-blur="playSetting.getIsBlurLyric"
          :enable-spring="playSetting.getisJumpLyric"
          :enable-scale="playSetting.getisJumpLyric"
          @line-click="jumpTime"
        >
        </LyricPlayer>
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div
      v-if="props.show && coverImage && playSetting.getIsAudioVisualizer"
      class="audio-visualizer-container"
      :class="{ idle: isIdle }"
    >
      <AudioVisualizer
        :show="Audio.isPlay"
        :height="70"
        :bar-count="80"
        :color="mainColor"
        @low-freq-update="handleLowFreqUpdate"
      />
    </div>

    <div ref="floatActionRef" class="float-action" :class="{ idle: isIdle }">
      <t-Tooltip content="播放器主题" placement="bottom">
        <button class="skin-btn" @click="showSettings = !showSettings">
          <pen-ball-icon
            :fill-color="'transparent'"
            :stroke-color="'currentColor'"
            :stroke-width="2"
            :style="{ fontSize: '20px' }"
          />
        </button>
      </t-Tooltip>
      <Transition name="fade-up">
        <div v-if="showSettings" class="settings-panel">
          <div class="panel-header">播放器样式</div>
          <div class="style-cards">
            <div
              class="style-card"
              :class="{ active: playSetting.getLayoutMode === 'cd' }"
              @click="playSetting.setLayoutMode('cd')"
            >
              <div class="card-preview cd-preview">
                <!-- <div class="preview-circle"></div> -->
                <img src="../../assets/images/cd.png" shape="circle" class="cover" width="100%" />
              </div>
              <span>经典黑胶</span>
            </div>
            <div
              class="style-card"
              :class="{ active: playSetting.getLayoutMode === 'cover' }"
              @click="playSetting.setLayoutMode('cover')"
            >
              <div class="card-preview cover-preview">
                <img
                  src="../../assets/images/cover-play.png"
                  shape="circle"
                  class="cover"
                  width="100%"
                />
              </div>

              <span>沉浸封面</span>
            </div>
          </div>

          <div class="panel-header" style="margin-top: 24px">界面设置</div>
          <div class="control-row">
            <span>显示左侧面板</span>
            <n-switch v-model:value="showLeftPanel" />
          </div>
          <div class="control-row">
            <span>沉浸色歌词</span>
            <n-switch
              v-model:value="playSetting.getIsImmersiveLyricColor"
              @update:value="playSetting.setIsImmersiveLyricColor"
            />
          </div>
          <div class="control-row">
            <span>歌词模糊效果</span>
            <n-switch
              v-model:value="playSetting.getIsBlurLyric"
              @update:value="playSetting.setIsBlurLyric"
            />
          </div>
          <div class="control-row">
            <span>音频可视化</span>
            <n-switch
              v-model:value="playSetting.getIsAudioVisualizer"
              @update:value="playSetting.setIsAudioVisualizer"
            />
          </div>
          <div class="control-row">
            <span>自动隐藏控制栏</span>
            <n-switch
              v-model:value="playSetting.autoHideBottom"
              @update:value="playSetting.setAutoHideBottom"
            />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.fade-nav-enter-active,
.fade-nav-leave-active {
  transition: all 0.6s cubic-bezier(0.8, 0, 0.8, 0.43);
}

.fade-nav-enter-from,
.fade-nav-leave-to {
  opacity: 0;
}

.fullscreen-btn,
.putawayscreen-btn {
  position: absolute;

  -webkit-app-region: no-drag;
  top: 25px;
  left: 30px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  // border: 1px solid rgba(255, 255, 255, 0.3);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  color: white;
  font-size: 18px;
  transition: all 0.3s ease;
  // box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  .icon {
    color: rgba(255, 255, 255, 0.6);
    width: 25px;
    height: 25px;
  }

  &.black-text {
    background: rgba(0, 0, 0, 0.1);

    .icon {
      color: rgba(0, 0, 0, 0.6);
    }

    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }
}

.putawayscreen-btn {
  left: 90px;
}

.full-play {
  --height: calc(100vh - var(--play-bottom-height));
  --text-color: rgba(255, 255, 255, 0.9);
  z-index: 100;
  position: fixed;
  top: var(--height);
  transition: top 0.28s cubic-bezier(0.8, 0, 0.8, 0.43);
  left: 0;
  width: 100vw;
  height: 100vh;
  color: var(--text-color);

  &.use-black-text {
    --text-color: rgba(255, 255, 255, 0.9);
  }

  &.active {
    top: 0;
  }

  &.idle {
    .playbox {
      .left {
        margin-bottom: 0;
      }
      .right {
        margin-bottom: 20px;
      }
    }

    .fullscreen-btn,
    .putawayscreen-btn,
    .top {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-100%);
    }
  }

  .top {
    position: absolute;
    width: calc(100% - 200px);
    z-index: 1;
    right: 0;
    padding: 30px 30px;
    padding-bottom: 10px;
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .playbox {
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.256);
    -webkit-drop-filter: blur(80px);
    padding: 0 10vw;
    -webkit-drop-filter: blur(80px);
    overflow: hidden;
    display: flex;
    position: relative;
    --cd-width-auto: max(200px, min(30vw, 700px, calc(100vh - var(--play-bottom-height) - 250px)));

    .left {
      width: 40%;
      transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      opacity: 1;
      transform: translateX(0);
    }

    .right {
      width: 60%;
      transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .left {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 0 var(--play-bottom-height) 0;
      perspective: 1000px;

      .pointer {
        user-select: none;
        -webkit-user-drag: none;
        position: absolute;
        width: calc(var(--cd-width-auto) / 3.5);
        left: calc(50% - 1.8vh);
        top: calc(50% - var(--cd-width-auto) / 2 - calc(var(--cd-width-auto) / 3.5) - 1vh);
        transform: rotate(-20deg);
        transform-origin: 1.8vh 1.8vh;
        z-index: 2;
        transition: transform 0.3s;

        &.playing {
          transform: rotate(0deg);
        }
      }

      .cd-container {
        width: var(--cd-width-auto);
        height: var(--cd-width-auto);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: rotateRecord 33s linear infinite;
        transition: filter 0.3s ease;
        filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.6));

        &:hover {
          filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.7));
        }

        /* 黑胶唱片主体 */
        .vinyl-record {
          aspect-ratio: 1/1;

          // margin-top: calc(var(--play-bottom-height) / 2);
          width: 100%;
          height: 100%;
          position: relative;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0d0d0d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;

          /* 唱片纹理轨道 */
          &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background:
              repeating-conic-gradient(
                from 0deg,
                transparent 0deg,
                rgba(255, 255, 255, 0.02) 0.5deg,
                transparent 1deg,
                rgba(255, 255, 255, 0.01) 1.5deg,
                transparent 2deg
              ),
              repeating-radial-gradient(
                circle at 50% 50%,
                transparent 0px,
                rgba(255, 255, 255, 0.03) 1px,
                transparent 2px,
                transparent 8px
              );
            z-index: 1;
          }

          /* 唱片光泽效果 */
          &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(
              ellipse at 30% 30%,
              rgba(255, 255, 255, 0.08) 0%,
              rgba(255, 255, 255, 0.04) 25%,
              rgba(255, 255, 255, 0.02) 50%,
              rgba(255, 255, 255, 0.01) 75%,
              transparent 100%
            );
            border-radius: 50%;
            z-index: 2;
            animation: vinylShine 6s ease-in-out infinite;
          }
        }

        /* 唱片标签区域 */
        .vinyl-label {
          position: absolute;
          width: 60%;
          height: 60%;
          background: radial-gradient(
            circle at 50% 50%,
            rgba(40, 40, 40, 0.95) 0%,
            rgba(25, 25, 25, 0.98) 70%,
            rgba(15, 15, 15, 1) 100%
          );
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
          box-shadow:
            inset 0 0 20px rgba(0, 0, 0, 0.8),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05),
            0 0 10px rgba(0, 0, 0, 0.5);

          :deep(.cover) {
            position: relative;
            z-index: 4;
            border-radius: 50%;
            overflow: hidden;
            box-shadow:
              0 0 20px rgba(0, 0, 0, 0.4),
              inset 0 0 0 2px rgba(255, 255, 255, 0.1);
            width: 95% !important;
            height: 95% !important;
            aspect-ratio: 1 / 1;

            img {
              user-select: none;
              -webkit-user-drag: none;
              border-radius: 50%;
              filter: brightness(0.85) contrast(1.15) saturate(1.1);
              width: 100% !important;
              height: 100% !important;
              object-fit: cover;
            }
          }

          /* 标签光泽 */
          .label-shine {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(
              ellipse at 25% 25%,
              rgba(255, 255, 255, 0.1) 0%,
              transparent 50%
            );
            border-radius: 50%;
            z-index: 5;
            pointer-events: none;
            animation: labelShine 8s ease-in-out infinite;
          }
        }

        /* 中心孔 */
        .center-hole {
          position: absolute;
          width: 8%;
          height: 8%;
          background: radial-gradient(circle, #000 0%, #111 30%, #222 70%, #333 100%);
          border-radius: 50%;
          z-index: 10;
          box-shadow:
            inset 0 0 8px rgba(0, 0, 0, 0.9),
            0 0 3px rgba(0, 0, 0, 0.8);
        }
      }
    }

    .right {
      mask: linear-gradient(
        rgba(255, 255, 255, 0) 0px,
        rgba(255, 255, 255, 0.6) 5%,
        rgb(255, 255, 255) 15%,
        rgb(255, 255, 255) 75%,
        rgba(255, 255, 255, 0.6) 85%,
        rgba(255, 255, 255, 0)
      );

      :deep(.lyric-player) {
        --amll-lyric-view-color: v-bind(lyricViewColor);
        transition: color 0.2s;
        font-family: v-bind(lyricFontFamily);
        --amll-lyric-player-font-size: min(clamp(30px, 2.5vw, 50px), 5vh);

        // bottom: max(2vw, 29px);

        height: v-bind(lyricHeight);
        transform: translateY(v-bind(lyricTranslateY));

        * [class^='lyricMainLine'] {
          font-weight: 600 !important;
          // text-align: center;
          * {
            font-weight: 600 !important;
          }
        }
        [class^='interludeDots'] {
          left: 1.2em;
        }
        & > div {
          padding-bottom: 0;
          overflow: hidden;
          transform: translateY(-20px);
        }
      }

      padding: 0 20px;

      margin: 80px 0 calc(var(--play-bottom-height)) 0;
      overflow: hidden;
    }

    &.mode-cover {
      .left {
        width: 50%;
        padding: 0 6vw;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
      }
      .right {
        width: 50%;
      }
    }

    &.single-column {
      .left {
        width: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        opacity: 0;
        transform: translateX(-100px);
        pointer-events: none;
      }

      .right {
        width: 100%;
        padding: 0 10vw;
        display: flex;
        justify-content: center;

        :deep(.lyric-player) {
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
        }
      }
    }

    .cover-layout-container {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 40px;
      margin-top: calc(var(--play-bottom-height) / 2);
      max-height: calc(100vh - 200px);

      .cover-wrapper-square {
        width: 100%;
        max-width: min(480px, 45vh);
        aspect-ratio: 1/1;
        border-radius: 24px;
        overflow: hidden;
        box-shadow:
          0 25px 50px -12px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.1);
        transition: transform 0.44s cubic-bezier(0.44, 2, 0.64, 1);
        margin: 0 auto;
        transform: scale(0.8);

        &.playing {
          transform: scale(1);

          &:hover {
            transition: transform 0.2s;
            transform: scale(1.02);
          }
        }

        &:hover {
          transform: scale(0.82);
        }

        :deep(.cover-img-square) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          user-select: none;
          img {
            -webkit-user-drag: none;

            user-select: none;
          }
        }
      }

      .song-info-area {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;

        .song-title-large {
          font-size: min(3vw, 42px);
          font-weight: 800;
          color: rgba(255, 255, 255, 0.95);
          line-height: 1.2;
          letter-spacing: -0.5px;
          /* display: -webkit-box; */
          /* -webkit-line-clamp: 2; */
          /* -webkit-box-orient: vertical; */
          /* overflow: hidden; */
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);

          &.text-scroll-container {
            overflow: hidden;
            white-space: nowrap;
            position: relative;
            width: 100%;
          }

          .text-scroll-wrapper {
            display: inline-flex;
            &.animate-scroll {
              animation: scroll 15s linear infinite;
            }
          }

          .text-scroll-item {
            font-weight: 800;
            flex-shrink: 0;
            padding-right: 2rem;
            display: inline-block;
          }
        }

        .song-meta-large {
          font-size: min(1.5vw, 20px);
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          opacity: 0.55;
          .artist {
            color: v-bind(lightMainColor);
            filter: brightness(1.2);
          }

          .divider {
            opacity: 0.4;
          }
        }

        .song-extra-info {
          margin-top: 8px;
        }
      }
    }
  }

  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  .audio-visualizer-container {
    position: absolute;
    bottom: calc(var(--play-bottom-height) - 10px);
    z-index: 9999;
    left: 0;
    right: 0;
    height: 60px;
    // background: linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent);
    filter: blur(6px);
    // max-width: 1000px;
    // -webkit-backdrop-filter: blur(10px);
    // border-top: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 5;
    // padding: 0 20px;
    display: flex;
    align-items: center;
    transition: bottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    &.idle {
      bottom: 0 !important;
    }
  }
}

.float-action {
  position: absolute;
  z-index: 5;
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
  &.idle {
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
  }
  --bottom-height: 60px;
  right: 20px;
  bottom: calc(var(--bottom-height) + var(--play-bottom-height));
  .skin-btn {
    backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.15);
    // box-shadow:
    //   0 8px 32px 0 rgba(0, 0, 0, 0.1),
    //   0 0 20px v-bind(lightMainColor),
    //   inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.628);
    // border: none;
    height: 50px;
    width: 50px;
    border-radius: 50%;
    cursor: pointer;

    /* 弹性过渡效果 */
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);

    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 1px;

    &:hover {
      // transform: translateY(-2px);
      background-color: rgba(255, 255, 255, 0.25);
      box-shadow:
        0 12px 40px 0 rgba(0, 0, 0, 0.15),
        0 0 30px v-bind(lightMainColor),
        inset 0 0 0 1px rgba(255, 255, 255, 0.4);
    }

    &:active {
      transform: translateY(1px) scale(0.92);
      box-shadow:
        0 4px 10px 0 rgba(0, 0, 0, 0.1),
        0 0 10px v-bind(lightMainColor),
        inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      transition: all 0.1s ease;
    }
  }

  .settings-panel {
    max-height: calc(
      100vh - 40px - 2.25rem - 70px - calc(var(--bottom-height) + var(--play-bottom-height))
    );
    overflow: auto;
    scrollbar-width: none;
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 340px;
    background: rgb(30 30 30 / 29%);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border-radius: 24px;
    padding: 24px;
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    transform-origin: bottom right;
    z-index: 100;

    .panel-header {
      color: rgba(255, 255, 255, 0.95);
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }

    .style-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .style-card {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 16px;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-2px);
      }

      &.active {
        background: rgba(255, 255, 255, 0.15);
        border-color: v-bind(lightMainColor);
        box-shadow: 0 8px 20px -5px rgba(0, 0, 0, 0.3);
      }

      .card-preview {
        width: 100%;
        // height: 80px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: content-box;
        &.cd-preview {
          padding: 10px;
        }

        &.cover-preview {
          padding: 10px;
        }
      }

      span {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.8);
        font-weight: 500;
      }
    }

    .control-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px;

      span {
        color: rgba(241, 241, 241, 0.8);
        font-size: 14px;
        font-weight: 500;
      }
    }
  }
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

@keyframes rotateRecord {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes vinylShine {
  0% {
    opacity: 0.1;
    transform: rotate(0deg) scale(1);
  }

  50% {
    opacity: 0.2;
    transform: rotate(180deg) scale(1.1);
  }

  100% {
    opacity: 0.1;
    transform: rotate(360deg) scale(1);
  }
}

@keyframes labelShine {
  0% {
    opacity: 0.05;
    transform: rotate(0deg);
  }

  25% {
    opacity: 0.15;
  }

  50% {
    opacity: 0.1;
    transform: rotate(180deg);
  }

  75% {
    opacity: 0.15;
  }

  100% {
    opacity: 0.05;
    transform: rotate(360deg);
  }
}
</style>
