<template>
  <div class="song-virtual-list">
    <!-- 表头 -->
    <div
      class="list-header-container"
      :style="
        settingsStore.settings.globalBackground?.enable
          ? 'background-color: var(--td-bg-color-component); backdrop-filter: blur(8px)'
          : 'background-color: var(--song-list-header-bg)'
      "
    >
      <Transition name="header-fade" mode="out-in">
        <div
          v-if="!isMultiSelect"
          class="list-header"
          :style="{ marginRight: hasScroll ? '10px' : '0' }"
        >
          <div v-if="showIndex" class="col-index">#</div>
          <div
            class="col-title"
            :class="{ sortable: enableSort }"
            @mouseenter="enableSort && (hoveredHeader = 'title')"
            @mouseleave="hoveredHeader = null"
            @click="enableSort && handleSort('title')"
          >
            标题
            <div
              v-if="enableSort"
              v-show="hoveredHeader === 'title' || isTitleSortActive"
              class="sort-icon-container"
            >
              <span v-if="sortType === 'title_asc'" class="sort-icon active"
                ><ArrowUpIcon class="sort-icon-arrow" /> 标题升序</span
              >
              <span v-else-if="sortType === 'title_desc'" class="sort-icon active"
                ><ArrowDownIcon class="sort-icon-arrow" /> 标题降序</span
              >
              <span v-else-if="sortType === 'artist_asc'" class="sort-icon active"
                ><ArrowUpIcon class="sort-icon-arrow" /> 歌手升序</span
              >
              <span v-else-if="sortType === 'artist_desc'" class="sort-icon active"
                ><ArrowDownIcon class="sort-icon-arrow" /> 歌手降序</span
              >
              <span v-else class="sort-icon default"
                ><TimeIcon class="sort-icon-arrow" /> 默认排序</span
              >
            </div>
          </div>
          <div
            v-if="showAlbum"
            class="col-album"
            :class="{ sortable: enableSort }"
            @mouseenter="enableSort && (hoveredHeader = 'album')"
            @mouseleave="hoveredHeader = null"
            @click="enableSort && handleSort('album')"
          >
            专辑
            <div
              v-if="enableSort"
              v-show="hoveredHeader === 'album' || isAlbumSortActive"
              class="sort-icon-container"
            >
              <span v-if="sortType === 'album_asc'" class="sort-icon active"><ArrowUpIcon /></span>
              <span v-else-if="sortType === 'album_desc'" class="sort-icon active"
                ><ArrowDownIcon
              /></span>
              <span v-else class="sort-icon default"
                ><TimeIcon class="sort-icon-arrow" /> 默认排序</span
              >
            </div>
          </div>
          <div class="col-like">喜欢</div>
          <div
            v-if="showDuration"
            class="col-duration"
            :class="{ sortable: enableSort }"
            @mouseenter="enableSort && (hoveredHeader = 'duration')"
            @mouseleave="hoveredHeader = null"
            @click="enableSort && handleSort('duration')"
          >
            时长
            <div
              v-if="enableSort"
              v-show="hoveredHeader === 'duration' || isDurationSortActive"
              class="sort-icon-container"
            >
              <span v-if="sortType === 'duration_asc'" class="sort-icon active"
                ><ArrowUpIcon
              /></span>
              <span v-else-if="sortType === 'duration_desc'" class="sort-icon active"
                ><ArrowDownIcon
              /></span>
              <span v-else class="sort-icon default"><TimeIcon /></span>
            </div>
          </div>
        </div>
        <div v-else class="list-header multi">
          <div class="multi-left">
            <div class="select-all">
              <t-checkbox
                class="select-all-checkbox"
                :checked="isAllSelected"
                @change="toggleSelectAll"
              >
                全选
              </t-checkbox>
            </div>
            <t-button
              class="square-btn"
              theme="primary"
              size="small"
              :disabled="selectedCount === 0"
              @click="playSelected"
            >
              <template #icon>
                <span class="iconfont icon-bofang"></span>
              </template>
            </t-button>
            <t-button
              v-if="enableDownload"
              class="action-btn"
              theme="default"
              size="small"
              :disabled="selectedNonLocalCount === 0"
              @click="downloadSelected"
            >
              批量下载
            </t-button>
            <t-dropdown v-if="playlists.length > 0" trigger="click">
              <t-button
                class="action-btn"
                theme="default"
                size="small"
                :disabled="selectedCount === 0"
              >
                加入歌单
              </t-button>
              <t-dropdown-menu>
                <t-dropdown-item
                  v-for="playlist in playlists"
                  :key="playlist.id"
                  style="max-width: 200px; padding: 5px 10px"
                  @click="addSelectedToSongList(playlist)"
                >
                  {{ playlist.name }}
                </t-dropdown-item>
              </t-dropdown-menu>
            </t-dropdown>
          </div>
          <div class="multi-right">
            <span class="selected-info">已选 {{ selectedCount }} 首</span>
            <t-button
              v-if="isLocalPlaylist"
              class="action-btn"
              theme="danger"
              size="small"
              variant="outline"
              :disabled="selectedCount === 0"
              @click="removeSelected"
            >
              <template #icon><DeleteIcon /></template>
            </t-button>

            <t-button
              class="action-btn"
              theme="default"
              size="small"
              variant="outline"
              @click="emit('exitMultiSelect')"
            >
              完成
            </t-button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- 虚拟滚动容器 -->
    <div
      ref="scrollContainer"
      class="virtual-scroll-container"
      :class="{ 'custom-bg': settingsStore.settings.globalBackground?.enable }"
      @scroll="onScroll"
    >
      <div class="virtual-scroll-spacer" :style="{ height: totalHeight + 'px' }">
        <div class="virtual-scroll-content" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="(song, index) in visibleItems"
            :key="`${song.source || ''}-${song.songmid}-${song.albumId || ''}`"
            v-observe-cover="song"
            class="song-item"
            @mouseenter="hoveredSong = song.id || song.songmid"
            @mouseleave="hoveredSong = null"
            @contextmenu="handleContextMenu($event, song)"
          >
            <!-- 序号或播放状态图标 -->
            <div v-if="showIndex" class="col-index">
              <span v-if="!isMultiSelect" class="track-number">
                {{ String(visibleStartIndex + index + 1).padStart(2, '0') }}
              </span>
              <button
                v-if="!isMultiSelect"
                class="play-btn"
                title="播放"
                @click.stop="handlePlay(song)"
              >
                <i class="icon-play"></i>
              </button>
              <t-checkbox
                v-if="isMultiSelect"
                class="select-checkbox always-show"
                :checked="selectedSet.has(song.songmid)"
                @change="
                  (checked, ctx) => onRowCheckboxChange(checked as boolean, ctx as any, song)
                "
              />
            </div>

            <!-- 歌曲信息 -->
            <div class="col-title" @click="handleSongClick(song)">
              <div v-if="song.img" class="song-cover">
                <s-image
                  :key="song.img"
                  :src="song.img"
                  :observe-visibility="true"
                  :release-on-hide="true"
                  alt="封面"
                />
              </div>
              <div class="song-info">
                <div class="song-title" :title="song.name">{{ song.name }}</div>
                <div class="song-artist" :title="song.singer">
                  <span v-if="song.types && song.types.length > 0" class="quality-tag">
                    {{ getQualityDisplayName(song.types[song.types.length - 1]) }}
                  </span>
                  <span v-else-if="getLocalQualityLabel(song)" class="quality-tag">
                    {{ getLocalQualityLabel(song) }}
                  </span>
                  <span
                    v-if="song.source && !(hideLocalSource && song.source === 'local')"
                    class="source-tag"
                  >
                    {{ song.source }}
                  </span>
                  {{ song.singer }}
                </div>
              </div>
            </div>

            <!-- 专辑信息 -->
            <div v-if="showAlbum" class="col-album">
              <span class="album-name" :title="song.albumName">
                {{ song.albumName || '-' }}
              </span>
            </div>

            <!-- 喜欢按钮 -->
            <div class="col-like">
              <button
                class="action-btn like-btn"
                title="喜欢/取消喜欢"
                @click.stop="onToggleLike(song)"
              >
                <HeartIcon
                  :fill-color="isLiked(song) ? ['#e5484d', '#e5484d'] : ''"
                  :stroke-color="isLiked(song) ? [] : [contrastTextColor, contrastTextColor]"
                  :stroke-width="isLiked(song) ? 0 : 2"
                  size="18"
                />
              </button>
            </div>

            <!-- 时长 -->
            <div v-if="showDuration" class="col-duration">
              <div class="duration-wrapper">
                <span v-if="hoveredSong !== (song.id || song.songmid)" class="duration">
                  {{ formatDuration(song.interval) }}
                </span>
                <div v-else class="action-buttons">
                  <button
                    v-if="enableDownload && song.source !== 'local'"
                    class="action-btn download-btn"
                    title="下载"
                    @click.stop="$emit('download', song)"
                  >
                    <DownloadIcon />
                  </button>
                  <button
                    class="action-btn playlist-btn"
                    title="添加到播放列表"
                    @click.stop="$emit('addToPlaylist', song)"
                  >
                    <i class="iconfont icon-zengjia"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      v-model:visible="contextMenuVisible"
      :position="contextMenuPosition"
      :items="contextMenuItems"
      @item-click="handleContextMenuItemClick"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, toRaw, watch } from 'vue'
import {
  DownloadIcon,
  PlayCircleIcon,
  AddIcon,
  FolderIcon,
  DeleteIcon,
  HeartIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TimeIcon
} from 'tdesign-icons-vue-next'
import ContextMenu from '../ContextMenu/ContextMenu.vue'
import { createMenuItem, createSeparator, calculateMenuPosition } from '../ContextMenu/utils'
import type { ContextMenuItem, ContextMenuPosition } from '../ContextMenu/types'
import songListAPI from '@renderer/api/songList'
import type { SongList } from '@common/types/songList'
import { MessagePlugin } from 'tdesign-vue-next'
import { cloudSongListAPI, type CloudSongList } from '@renderer/api/cloudSongList'
import { syncLocalMetaWithCloudUpdate } from '@renderer/utils/playlist/cloudSyncHelper'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { useAuthStore } from '@renderer/store'
import { useSettingsStore } from '@renderer/store/Settings'

const settingsStore = useSettingsStore()

interface Song {
  id?: number
  songmid: number
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string | number
  img: string
  lrc: null | string
  types: any[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  bitrate?: number
  sampleRate?: number
  path?: string
}

interface Props {
  songs: Song[]
  currentSong?: Song | null
  isPlaying?: boolean
  showIndex?: boolean
  showAlbum?: boolean
  showDuration?: boolean
  isLocalPlaylist?: boolean
  enableSort?: boolean
  playlistId?: string
  multiSelect?: boolean
  bufferSize?: number
  coverConcurrency?: number
  coverLoader?: (song: Song, signal: AbortSignal) => Promise<string>
  extraMenuFactory?: (song: Song) => Array<{ key: string; label: string }>
  hideLocalSource?: boolean
  enableDownload?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  currentSong: null,
  isPlaying: false,
  showIndex: true,
  showAlbum: true,
  showDuration: true,
  isLocalPlaylist: false,
  enableSort: false,
  playlistId: '',
  multiSelect: false,
  bufferSize: 10,
  coverConcurrency: 30,
  hideLocalSource: false,
  enableDownload: true
})

const emit = defineEmits([
  'play',
  'pause',
  'addToPlaylist',
  'download',
  'downloadBatch',
  'playBatch',
  'scroll',
  'removeFromLocalPlaylist',
  'removeBatch',
  'exitMultiSelect',
  'addToSongListBatch',
  'extraMenuClick'
])

// 虚拟滚动相关状态
const scrollContainer = ref<HTMLElement>()
const hoveredSong = ref<number | null>(null)
const itemHeight = 64
const buffer = computed(() => Number(props.bufferSize) || 10)

const scrollTop = ref(0)
const visibleStartIndex = ref(0)
const visibleEndIndex = ref(0)

// 点击防抖相关状态
let clickTimer: NodeJS.Timeout | null = null
let lastClickTime = 0
const doubleClickDelay = 300 // 300ms 内的第二次点击视为双击

// 右键菜单相关状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 })
const contextMenuSong = ref<Song | null>(null)

// 排序相关状态
type SortType =
  | 'default'
  | 'title_asc'
  | 'title_desc'
  | 'artist_asc'
  | 'artist_desc'
  | 'album_asc'
  | 'album_desc'
  | 'duration_asc'
  | 'duration_desc'
const sortType = ref<SortType>('default')
const hoveredHeader = ref<'title' | 'album' | 'duration' | null>(null)

const parseDuration = (interval: string | number): number => {
  if (typeof interval === 'number') return interval
  if (!interval) return 0
  if (interval.includes(':')) {
    const parts = interval.split(':')
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  }
  return parseInt(interval) || 0
}

const isTitleSortActive = computed(() =>
  ['title_asc', 'title_desc', 'artist_asc', 'artist_desc'].includes(sortType.value)
)
const isAlbumSortActive = computed(() => ['album_asc', 'album_desc'].includes(sortType.value))
const isDurationSortActive = computed(() =>
  ['duration_asc', 'duration_desc'].includes(sortType.value)
)

const handleSort = (column: 'title' | 'album' | 'duration') => {
  if (column === 'title') {
    if (sortType.value === 'title_asc') sortType.value = 'title_desc'
    else if (sortType.value === 'title_desc') sortType.value = 'artist_asc'
    else if (sortType.value === 'artist_asc') sortType.value = 'artist_desc'
    else if (sortType.value === 'artist_desc') sortType.value = 'default'
    else sortType.value = 'title_asc'
  } else if (column === 'album') {
    if (sortType.value === 'album_asc') sortType.value = 'album_desc'
    else if (sortType.value === 'album_desc') sortType.value = 'default'
    else sortType.value = 'album_asc'
  } else if (column === 'duration') {
    if (sortType.value === 'duration_asc') sortType.value = 'duration_desc'
    else if (sortType.value === 'duration_desc') sortType.value = 'default'
    else sortType.value = 'duration_asc'
  }
}

const sortedSongs = computed(() => {
  if (!props.enableSort) {
    return props.songs
  }

  const list = [...props.songs]

  if (sortType.value === 'default') {
    return list // 默认排序按添加入歌单时间倒序
  }

  list.sort((a, b) => {
    // 移除特殊字符并进行优先级排序：数字 > A-Z > a-z > 其他（中文按拼音）
    const customCompare = (str1: string | undefined, str2: string | undefined, asc: boolean) => {
      const cleanStr = (s: string | undefined) =>
        (s || '').replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim()
      const c1 = cleanStr(str1)
      const c2 = cleanStr(str2)

      const getPriority = (s: string) => {
        if (!s) return 4
        const first = s.charAt(0)
        if (/[0-9]/.test(first)) return 0
        if (/[A-Z]/.test(first)) return 1
        if (/[a-z]/.test(first)) return 2
        return 3
      }

      const p1 = getPriority(c1)
      const p2 = getPriority(c2)

      if (p1 !== p2) {
        return asc ? p1 - p2 : p2 - p1
      }

      return asc ? c1.localeCompare(c2, 'zh-CN') : c2.localeCompare(c1, 'zh-CN')
    }

    switch (sortType.value) {
      case 'title_asc':
        return customCompare(a.name, b.name, true)
      case 'title_desc':
        return customCompare(a.name, b.name, false)
      case 'artist_asc':
        return customCompare(a.singer, b.singer, true)
      case 'artist_desc':
        return customCompare(a.singer, b.singer, false)
      case 'album_asc':
        return customCompare(a.albumName, b.albumName, true)
      case 'album_desc':
        return customCompare(a.albumName, b.albumName, false)
      case 'duration_asc': {
        const durA = parseDuration(a.interval)
        const durB = parseDuration(b.interval)
        return durA - durB
      }
      case 'duration_desc': {
        const durA = parseDuration(a.interval)
        const durB = parseDuration(b.interval)
        return durB - durA
      }
      default:
        return 0
    }
  })

  return list
})

// 歌单列表
const playlists = ref<SongList[]>([])

const hasScroll = computed(() => {
  // 判断是否有滚动条
  return !!(
    scrollContainer.value && scrollContainer.value.scrollHeight > scrollContainer.value.clientHeight
  )
})

// 计算总高度
const totalHeight = computed(() => sortedSongs.value.length * itemHeight)

// 计算偏移量
const offsetY = computed(() => visibleStartIndex.value * itemHeight)

// 计算可见项目
const visibleItems = computed(() => {
  const totalItems = sortedSongs.value.length
  if (totalItems === 0) return []

  if (!scrollContainer.value) return sortedSongs.value.slice(0, Math.min(10, totalItems))

  const containerRect = scrollContainer.value.getBoundingClientRect()
  const containerHeight = containerRect.height || 400

  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.floor(scrollTop.value / itemHeight)
  const endIndex = Math.min(startIndex + visibleCount + buffer.value, totalItems)

  visibleStartIndex.value = Math.max(0, startIndex - buffer.value)
  visibleEndIndex.value = endIndex

  return sortedSongs.value.slice(visibleStartIndex.value, visibleEndIndex.value)
})

// 封面懒加载
const coverControllers = new Map<number | string, AbortController>()
const elementSongMap = new WeakMap<Element, Song>()
let coverObserver: IntersectionObserver | null = null

// Initialize IntersectionObserver immediately to catch initial renders
if (typeof IntersectionObserver !== 'undefined') {
  coverObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const song = elementSongMap.get(entry.target)
        if (!song) return
        if (entry.isIntersecting) {
          ensureCover(song)
        } else {
          abortCover(song)
        }
      })
    },
    {
      root: null, // 使用视口作为根
      rootMargin: '100px 0px' // 预加载 100px
    }
  )
}

let inflight = 0
const waiters: Array<() => void> = []

function acquireSlot() {
  if (inflight < (props.coverConcurrency || 30)) {
    inflight++
    return Promise.resolve()
  }
  return new Promise<void>((resolve) =>
    waiters.push(() => {
      inflight++
      resolve()
    })
  )
}

function releaseSlot() {
  inflight = Math.max(0, inflight - 1)
  const n = waiters.shift()
  if (n) n()
}

async function ensureCover(song: Song) {
  if (!props.coverLoader) return
  if ((song as any).img) return

  const id = (song as any).songmid
  if (coverControllers.has(id)) return // 已经在加载中

  const ctrl = new AbortController()
  coverControllers.set(id, ctrl)

  await acquireSlot()
  try {
    if (ctrl.signal.aborted) return
    const data = await props.coverLoader(song, ctrl.signal)
    if (!ctrl.signal.aborted && data) {
      ;(song as any).img = data
    }
  } catch (e) {
    // 忽略错误
  } finally {
    releaseSlot()
    coverControllers.delete(id)
  }
}

function abortCover(song: Song) {
  const id = (song as any).songmid
  const ctrl = coverControllers.get(id)
  if (ctrl) {
    ctrl.abort()
    coverControllers.delete(id)
  }
}

const vObserveCover = {
  mounted(el: HTMLElement, binding: any) {
    if (!coverObserver) return
    const song = binding.value
    elementSongMap.set(el, song)
    coverObserver.observe(el)
  },
  updated(el: HTMLElement, binding: any) {
    if (!coverObserver) return
    const song = binding.value
    elementSongMap.set(el, song)
    // 重新观察以触发可能的加载
    coverObserver.unobserve(el)
    coverObserver.observe(el)
  },
  unmounted(el: HTMLElement) {
    if (!coverObserver) return
    coverObserver.unobserve(el)
    const song = elementSongMap.get(el)
    if (song) {
      abortCover(song)
    }
    elementSongMap.delete(el)
  }
}

watch(
  () => props.songs,
  () => {
    for (const [, ctrl] of coverControllers) ctrl.abort()
    coverControllers.clear()
  },
  { deep: false }
)

onMounted(() => {
  // 兼容逻辑：如果在 setup 中未能初始化（例如服务端渲染环境或极早期版本），尝试在此初始化
  if (!coverObserver && typeof IntersectionObserver !== 'undefined') {
    coverObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const song = elementSongMap.get(entry.target)
          if (!song) return
          if (entry.isIntersecting) {
            ensureCover(song)
          } else {
            abortCover(song)
          }
        })
      },
      {
        root: null, // 使用视口作为根
        rootMargin: '100px 0px' // 预加载 100px
      }
    )
  }
})

onUnmounted(() => {
  if (coverObserver) {
    coverObserver.disconnect()
    coverObserver = null
  }
  for (const [, ctrl] of coverControllers) ctrl.abort()
  coverControllers.clear()
})

// 处理播放
const handlePlay = (song: Song) => {
  emit('play', song)
}

// 处理添加到播放列表
const handleAddToPlaylist = (song: Song) => {
  emit('addToPlaylist', song)
}

// 处理歌曲点击事件
const handleSongClick = (song: Song) => {
  if (isMultiSelect.value) {
    toggleSelect(song)
    return
  }
  const currentTime = Date.now()
  const timeDiff = currentTime - lastClickTime

  // 清除之前的定时器
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
  }

  if (timeDiff < doubleClickDelay && timeDiff > 0) {
    // 双击：立即执行播放操作
    handlePlay(song)
    lastClickTime = 0 // 重置时间，防止三击
  } else {
    // 单击：延迟执行添加到播放列表
    lastClickTime = currentTime
    clickTimer = setTimeout(() => {
      handleAddToPlaylist(song)
      clickTimer = null
    }, doubleClickDelay)
  }
}

// 格式化时长
const formatDuration = (duration: string | number) => {
  if (!duration) return '--:--'

  let seconds: number
  if (typeof duration === 'string') {
    // 如果已经是 "mm:ss" 格式，直接返回
    if (duration.includes(':')) return duration
    seconds = parseInt(duration)
  } else {
    seconds = duration
  }

  if (isNaN(seconds)) return '--:--'

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// 获取音质显示名称
const qualityMap: Record<string, string> = {
  '128k': '标准',
  '192k': '高品',
  '320k': '超高',
  flac: '无损',
  flac24bit: '超高解析',
  hires: 'Hi-Res',
  atmos: '全景',
  atmos_plus: '全景Plus',
  master: '母带'
}

const getQualityDisplayName = (quality: any) => {
  if (typeof quality === 'object' && quality.type) {
    return qualityMap[quality.type] || quality.type
  }
  return qualityMap[quality] || quality || ''
}

const getLocalQualityLabel = (song: Song) => {
  if (song.source !== 'local') return ''
  if (song.sampleRate && song.sampleRate > 48000) return 'Hi-Res'
  if (song.path) {
    const ext = song.path.split('.').pop()?.toLowerCase()
    if (ext === 'flac' || ext === 'wav' || ext === 'ape' || ext === 'dsd' || ext === 'dff')
      return '无损'
  }
  if (song.bitrate) {
    if (song.bitrate >= 800) return '无损'
    return `${song.bitrate}k`
  }
  return ''
}

// 处理滚动事件
const onScroll = (event: Event) => {
  const target = event.target as HTMLElement | null
  // 兼容程序触发的假事件，target 可能为 null
  scrollTop.value = target?.scrollTop ?? scrollContainer.value?.scrollTop ?? 0
  emit('scroll', event)
}

// 多选相关
const isMultiSelect = computed(() => props.multiSelect)
const selectedSet = ref<Set<number>>(new Set())
const selectedSongs = computed(() => {
  const set = selectedSet.value
  return props.songs.filter((s) => set.has(s.songmid))
})
const selectedCount = computed(() => selectedSongs.value.length)
const selectedNonLocalSongs = computed(() =>
  selectedSongs.value.filter((s) => s.source !== 'local')
)
const selectedNonLocalCount = computed(() => selectedNonLocalSongs.value.length)
const toggleSelect = (song: Song) => {
  const id = song.songmid
  if (selectedSet.value.has(id)) {
    selectedSet.value.delete(id)
  } else {
    selectedSet.value.add(id)
  }
}
const onRowCheckboxChange = (checked: boolean, context: { e?: Event } | undefined, song: Song) => {
  try {
    if (context?.e && typeof context.e.stopPropagation === 'function') {
      context.e.stopPropagation()
    }
  } catch {}
  const id = song.songmid
  if (checked) {
    selectedSet.value.add(id)
  } else {
    selectedSet.value.delete(id)
  }
}
const isAllSelected = computed(
  () => selectedSet.value.size > 0 && selectedSet.value.size === props.songs.length
)
const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedSet.value.clear()
  } else {
    const all = new Set<number>(props.songs.map((s) => s.songmid))
    selectedSet.value = all
  }
}
const downloadSelected = () => {
  const list = selectedNonLocalSongs.value
  if (list.length === 0) {
    MessagePlugin.warning('未选择可下载的歌曲')
    return
  }
  emit('downloadBatch', list)
}
const playSelected = () => {
  const list = selectedSongs.value
  if (list.length === 0) return
  emit('playBatch', list)
}
const removeSelected = () => {
  const list = selectedSongs.value
  if (list.length === 0) return
  emit('removeBatch', list)
  const removeIds = new Set(list.map((s) => s.songmid))
  selectedSet.value = new Set([...selectedSet.value].filter((id) => !removeIds.has(id)))
}
const addSelectedToSongList = (playlist: SongList) => {
  const list = selectedSongs.value
  if (list.length === 0) return
  emit('addToSongListBatch', list, playlist)
}

// 右键菜单项配置
const contextMenuItems = computed((): ContextMenuItem[] => {
  const baseItems: ContextMenuItem[] = [
    createMenuItem('play', '播放', {
      icon: PlayCircleIcon,
      onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
        if (contextMenuSong.value) {
          handlePlay(contextMenuSong.value)
        }
      }
    }),
    createMenuItem('addToPlaylist', '添加到播放列表', {
      icon: AddIcon,
      onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
        if (contextMenuSong.value) {
          handleAddToPlaylist(contextMenuSong.value)
        }
      }
    })
  ]

  // 如果有歌单，添加"加入歌单"子菜单
  if (playlists.value.length > 0) {
    baseItems.push(
      createMenuItem('addToSongList', '加入歌单', {
        icon: FolderIcon,
        children: playlists.value.map((playlist) =>
          createMenuItem(`playlist_${playlist.id}`, playlist.name, {
            onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
              if (contextMenuSong.value) {
                handleAddToSongList(contextMenuSong.value, playlist)
              }
            }
          })
        )
      })
    )
  }

  if (props.enableDownload && contextMenuSong.value?.source !== 'local') {
    baseItems.push(
      createMenuItem('download', '下载', {
        icon: DownloadIcon,
        onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
          if (contextMenuSong.value) {
            emit('download', contextMenuSong.value)
          }
        }
      })
    )
  }
  // 如果是本地歌单，添加"移出本地歌单"选项
  if (props.isLocalPlaylist) {
    // 添加分隔线
    baseItems.push(createSeparator())
    baseItems.push(
      createMenuItem('removeFromLocalPlaylist', '移出当前歌单', {
        icon: DeleteIcon,
        onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
          if (contextMenuSong.value) {
            emit('removeFromLocalPlaylist', contextMenuSong.value)
          }
        }
      })
    )
  }
  if (props.extraMenuFactory && contextMenuSong.value) {
    const extras = props.extraMenuFactory(contextMenuSong.value)
    if (Array.isArray(extras)) {
      for (const it of extras) {
        baseItems.push(
          createMenuItem(it.key, it.label, {
            onClick: (_item: ContextMenuItem, _event: MouseEvent) => {
              if (contextMenuSong.value)
                emit('extraMenuClick', { key: it.key, song: contextMenuSong.value })
            }
          })
        )
      }
    }
  }

  return baseItems
})

// 处理右键菜单
const handleContextMenu = (event: MouseEvent, song: Song) => {
  event.preventDefault()
  event.stopPropagation()

  // 设置菜单数据
  contextMenuSong.value = song

  // 使用智能位置计算，确保菜单在可视区域内
  contextMenuPosition.value = calculateMenuPosition(event, 240, 300)
  if (song.source === 'local') {
  }
  // 直接显示菜单
  contextMenuVisible.value = true
}

// 处理右键菜单项点击
const handleContextMenuItemClick = (_item: ContextMenuItem, _event: MouseEvent) => {
  // 菜单项的 onClick 回调已经在 ContextMenuItem 组件中调用
  // 这里不需要额外关闭菜单，ContextMenu 组件会处理关闭逻辑
  // 避免重复关闭导致菜单显示问题
}

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuSong.value = null
}

// 加载歌单列表
const loadPlaylists = async () => {
  const AuthStore = useAuthStore()
  try {
    async function getCloudSongList() {
      if (!AuthStore.isAuthenticated) return []
      return await cloudSongListAPI.getUserSongLists().catch((err) => {
        MessagePlugin.error(err.message || '获取云歌单失败')
        return []
      })
    }
    const [localRes, cloudRes] = await Promise.all([songListAPI.getAll(), getCloudSongList()])

    const localLists = (localRes.success ? localRes.data : []) || []
    const cloudLists: CloudSongList[] = Array.isArray(cloudRes) ? cloudRes : []

    // Merge Logic
    const mergedLists: SongList[] = []
    const localMap = new Map<string, SongList>()

    // 1. Process Local Lists
    localLists.forEach((l) => {
      // Ensure meta exists
      if (!l.meta) l.meta = {}
      localMap.set(l.id, l)
      mergedLists.push(l)
    })

    // 2. Process Cloud Lists
    cloudLists.forEach((c) => {
      // Try to find matching local list
      let match = localMap.get(c.localId)

      if (!match) {
        // Try reverse lookup
        match = mergedLists.find((l) => l.meta && l.meta.cloudId === c.id)
      }

      if (match) {
        // Mark as synced
        match.meta.cloudId = c.id
        match.meta.isSynced = true
        match.meta.localUpdatedAt = c.updatedAt
      } else {
        // Cloud only list
        mergedLists.push({
          id: c.id,
          name: c.name + '[云端]',
          description: c.describe,
          coverImgUrl: c.cover,
          createTime: '',
          updateTime: c.updatedAt,
          source: 'local',
          meta: {
            isCloudOnly: true,
            cloudId: c.id,
            localUpdatedAt: c.updatedAt
          }
        })
      }
    })

    playlists.value = mergedLists
  } catch (error) {
    console.error('加载歌单失败:', error)
  }
}

// === 喜欢功能（列表内心形） ===
const favoritesId = ref<string | null>(null)
const likedSet = ref<Set<string | number>>(new Set())
const contrastTextColor = 'var(--song-list-btn-color)'

const loadFavorites = async () => {
  try {
    const favIdRes = await (window as any).api?.songList?.getFavoritesId?.()
    const id: string | null = (favIdRes && favIdRes.data) || null
    favoritesId.value = id
    if (!id) {
      likedSet.value = new Set()
      return
    }
    const existsRes = await songListAPI.exists(id)
    if (!existsRes.success || !existsRes.data) {
      favoritesId.value = null
      likedSet.value = new Set()
      return
    }
    const songsRes = await songListAPI.getSongs(id)
    if (songsRes.success && Array.isArray(songsRes.data)) {
      likedSet.value = new Set(songsRes.data.map((s: any) => s.songmid))
    }
  } catch (e) {
    console.error('加载“我的喜欢”失败:', e)
  }
}

const isLiked = (song: Song) => likedSet.value.has(song.songmid)

const ensureFavoritesId = async (): Promise<string | null> => {
  if (favoritesId.value) {
    const existsRes = await songListAPI.exists(favoritesId.value)
    if (existsRes.success && existsRes.data) return favoritesId.value
    favoritesId.value = null
  }
  const searchRes = await songListAPI.search('我的喜欢', 'local')
  if (searchRes.success && Array.isArray(searchRes.data)) {
    const exact = searchRes.data.find((pl) => pl.name === '我的喜欢' && pl.source === 'local')
    if (exact?.id) {
      favoritesId.value = exact.id
      await (window as any).api?.songList?.setFavoritesId?.(favoritesId.value)
      return favoritesId.value
    }
  }
  const createRes = await songListAPI.create('我的喜欢', '', 'local')
  if (!createRes.success || !createRes.data?.id) {
    MessagePlugin.error(createRes.error || '创建“我的喜欢”失败')
    return null
  }
  favoritesId.value = createRes.data.id
  await (window as any).api?.songList?.setFavoritesId?.(favoritesId.value)
  return favoritesId.value
}

const onToggleLike = async (song: Song) => {
  try {
    const id = await ensureFavoritesId()
    if (!id) return
    if (isLiked(song)) {
      const removeRes = await songListAPI.removeSong(id, song.songmid)
      if (removeRes.success && removeRes.data) {
        likedSet.value.delete(song.songmid)
        // MessagePlugin.success('已取消喜欢')
      } else {
        MessagePlugin.error(removeRes.error || '取消喜欢失败')
      }
    } else {
      const addRes = await songListAPI.addSongs(id, [toRaw(song) as any])
      if (addRes.success) {
        likedSet.value.add(song.songmid)
        // MessagePlugin.success('已添加到“我的喜欢”')
      } else {
        MessagePlugin.error(addRes.error || '添加到“我的喜欢”失败')
      }
    }
  } catch (e: any) {
    console.error('切换喜欢失败:', e)
    MessagePlugin.error(e?.message || '操作失败，请稍后重试')
  }
}

// 添加歌曲到歌单
const handleAddToSongList = async (song: Song, playlist: SongList) => {
  try {
    const cloudSong = mapSongsToCloud([song])[0]

    // Cloud Only Playlist
    if (playlist.meta?.isCloudOnly && playlist.meta?.cloudId) {
      await cloudSongListAPI.addSongsToList(playlist.meta.cloudId, [cloudSong])
      MessagePlugin.success(`已将"${song.name}"添加到云端歌单"${playlist.name}"`)
      return
    }

    // Local / Synced Playlist
    const result = await songListAPI.addSongs(playlist.id, [toRaw(song) as any])
    if (result.success) {
      MessagePlugin.success(`已将"${song.name}"添加到歌单"${playlist.name}"`)

      // 如果是已同步的本地歌单，尝试同步到云端
      if (playlist.meta?.cloudId && playlist.meta?.isSynced) {
        try {
          const res = await cloudSongListAPI.addSongsToList(playlist.meta.cloudId, [cloudSong])
          if (res && res.updatedAt) {
            // Update local meta with new localUpdatedAt
            const newMeta = await syncLocalMetaWithCloudUpdate(
              playlist.id,
              playlist.meta,
              res.updatedAt
            )
            // Update in-memory playlist object to reflect change immediately
            playlist.meta = { ...playlist.meta, ...newMeta, localUpdatedAt: res.updatedAt }
          }
        } catch (e: any) {
          console.error('同步添加到云端失败:', e)
          MessagePlugin.warning('本地添加成功，但同步云端失败: ' + (e.message || '未知错误'))
        }
      }
    } else {
      MessagePlugin.error(result.error || '添加到歌单失败')
    }
  } catch (error: any) {
    console.error('添加到歌单失败:', error)
    MessagePlugin.error('添加到歌单失败: ' + (error.message || '未知错误'))
  }
}

onMounted(async () => {
  // 组件挂载后触发一次重新计算
  nextTick(() => {
    if (scrollContainer.value) {
      // 触发一次重新计算可见项目
      const event = new Event('scroll')
      onScroll(event)
    }
  })

  // 加载歌单列表
  await loadPlaylists()
  // 预加载“我的喜欢”集合（确保方法存在于当前文件作用域）
  await loadFavorites()

  // 监听歌单变化事件
  window.addEventListener('playlist-updated', async () => {
    await loadPlaylists()
    await loadFavorites()
  })
})

onUnmounted(() => {
  // 清理事件监听器
  window.removeEventListener('playlist-updated', loadPlaylists)
})

// 切换到普通模式时清空选择
watch(
  () => props.multiSelect,
  (val) => {
    if (!val) {
      selectedSet.value.clear()
    }
  }
)

watch(
  () => props.songs,
  (newSongs) => {
    const ids = new Set(newSongs.map((s) => s.songmid))
    selectedSet.value = new Set([...selectedSet.value].filter((id) => ids.has(id)))
  },
  { deep: true }
)

const scrollToSong = (songmid: string | number, source: string) => {
  if (!scrollContainer.value) return
  const index = sortedSongs.value.findIndex(
    (s) => String(s.songmid) === String(songmid) && s.source === source
  )
  if (index === -1) return
  const targetScrollTop = index * itemHeight
  scrollContainer.value.scrollTo({
    top: targetScrollTop,
    behavior: 'smooth'
  })
}

defineExpose({
  scrollToSong,
  sortedSongs
})
</script>

<style scoped>
.playSong-enter-active,
.playSong-leave-active {
  transition: all 0.2s ease-in-out;
}
.playSong-enter-from,
.playSong-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.song-virtual-list {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.list-header.multi {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* padding: 0 10px; */
  height: 48px;
  box-sizing: border-box;
}
.multi-left,
.multi-center,
.multi-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.select-all {
  display: inline-flex;
  align-items: center;
  /* width: 50px;？ */
  padding-left: 15px;
  gap: 6px;
  font-size: 12px;
  color: var(--song-list-header-text);
}
.select-all-checkbox {
  height: 18px;
  line-height: 18px;
  padding-right: 20px;
  border-right: 1px solid #ccc;
}
.selected-info {
  font-size: 12px;
  color: var(--song-list-header-text);
}

.square-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.action-btn {
  border-radius: 8px;
  height: 32px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.list-header {
  display: grid;
  grid-template-columns: 50px 1fr 200px 60px 80px;
  padding: 0 10px;
  background-color: transparent;
  border-bottom: 1px solid var(--song-list-header-border);
  font-size: 12px;
  color: var(--song-list-header-text);
  flex-shrink: 0;
  transition: height 0.3s ease;
  height: 40px;
  overflow: hidden;
  box-sizing: border-box;
  align-items: center;

  .sortable {
    cursor: pointer;
    user-select: none;
    &:hover {
      color: var(--song-list-title-hover, #333);
    }
  }

  .sort-icon-container {
    display: inline-flex;
    align-items: center;
    margin-left: 6px;
    height: 100%;

    .sort-icon {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      color: var(--song-list-header-text);

      &.active {
        color: var(--song-list-title-hover, #18a058);
      }

      .t-icon {
        font-size: 14px;
      }
    }
  }

  .col-index {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-title {
    padding-left: 10px;
    display: flex;
    align-items: center;
  }

  .col-album {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 0 10px;
  }

  .col-like {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-duration {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.virtual-scroll-container {
  background: var(--song-list-content-bg);
  overflow-y: auto;
  position: relative;
  flex: 1;
  min-height: 0;

  &.custom-bg {
    background: var(--td-bg-color-component);
    backdrop-filter: blur(8px);
  }

  .virtual-scroll-spacer {
    position: relative;
  }

  .virtual-scroll-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .song-item {
    display: grid;
    grid-template-columns: 50px 1fr 200px 60px 80px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--song-list-item-border);
    cursor: pointer;
    transition: background-color 0.2s ease;
    height: 64px;
    background-color: transparent;

    &:hover,
    &.is-hovered {
      background-color: var(--song-list-item-hover);

      .col-title .song-info .song-title {
        color: var(--song-list-title-hover);
      }

      .col-album .album-name {
        color: var(--song-list-album-hover);
      }
    }

    &.is-current {
      background: var(--song-list-item-current);
      color: var(--song-list-btn-hover);
    }

    &.is-playing {
      background: var(--song-list-item-playing);
      color: var(--song-list-btn-hover);
    }

    .col-index {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      position: relative;

      .track-number {
        font-size: 14px;
        color: var(--song-list-track-number);
        font-variant-numeric: tabular-nums;
        width: 100%;
        text-align: center;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 1;
        filter: blur(0);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      .play-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--song-list-btn-hover);
        font-size: 16px;
        padding: 8px;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-style: none;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        filter: blur(4px);
        pointer-events: none;

        &:hover {
          background: var(--song-list-btn-bg-hover);
          color: var(--song-list-btn-hover);
        }

        i {
          display: block;
          line-height: 1;
        }
      }
    }

    &:hover .col-index {
      .track-number {
        opacity: 0;
        filter: blur(4px);
        transform: translate(-50%, -50%) scale(0.9);
      }

      .play-btn {
        opacity: 1;
        filter: blur(0);
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      .select-checkbox {
        opacity: 1;
        filter: blur(0);
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
    }
    .select-checkbox {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      filter: blur(4px);
      pointer-events: none;
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    .select-checkbox.always-show {
      opacity: 1;
      filter: blur(0);
      transform: translate(-50%, -50%) scale(1);
      pointer-events: auto;
    }

    .col-title {
      display: flex;
      align-items: center;
      padding-left: 10px;
      min-width: 0;
      overflow: hidden;

      .song-cover {
        width: 40px;
        height: 40px;
        margin-right: 10px;
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .song-info {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;

        .song-title {
          font-size: 14px;
          color: var(--song-list-title-color);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          transition: color 0.2s ease;
          font-weight: 500;
          font-family: Arial, Helvetica, sans-serif;
        }

        .song-artist {
          font-size: 12px;
          color: var(--song-list-artist-color);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: Arial, Helvetica, sans-serif;
          .quality-tag {
            background: var(--song-list-quality-bg);
            color: var(--song-list-quality-color);
            padding: 3px 6px;
            border-radius: 5px;
            font-size: 10px;
            line-height: 1;
          }
          .source-tag {
            background: var(--song-list-source-bg);
            color: var(--song-list-source-color);
            padding: 3px 6px;
            border-radius: 5px;
            font-size: 10px;
            line-height: 1;
          }
        }
      }
    }

    .col-album {
      display: flex;
      align-items: center;
      padding: 0 10px;
      overflow: hidden;

      .album-name {
        font-size: 12px;
        color: var(--song-list-album-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        transition: color 0.2s ease;
        cursor: pointer;
      }
    }

    .col-like {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 60px;

      .like-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--song-list-btn-color);
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: var(--song-list-btn-hover);
          background: var(--song-list-btn-bg-hover);
        }

        i {
          display: block;
          line-height: 1;
          font-size: 16px;
        }
      }
    }

    .col-duration {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;

      .duration-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;

        .duration {
          font-size: 12px;
          color: var(--song-list-duration-color);
          font-variant-numeric: tabular-nums;
          min-width: 35px;
          text-align: center;
        }

        .action-buttons {
          display: flex;
          gap: 2px;
          justify-content: center;
          align-items: center;

          .action-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--song-list-btn-color);
            padding: 6px;
            border-radius: 50%;
            transition: all 0.2s;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;

            &:hover {
              color: var(--song-list-btn-hover);
              background: var(--song-list-btn-bg-hover);
            }

            i {
              display: block;
              line-height: 1;
              font-size: 14px;
            }
          }
        }
      }
    }
  }
}

/* 图标样式 */
.icon-play::before {
  content: '▶';
  font-style: normal;
}

.icon-pause::before {
  content: '⏸';
  font-style: normal;
}

.icon-download::before {
  content: '⬇';
  font-style: normal;
}

.icon-heart::before {
  content: '♡';
  font-style: normal;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .list-header {
    grid-template-columns: 50px 1fr 50px 60px;

    .col-album {
      display: none;
    }
  }

  .song-item {
    grid-template-columns: 50px 1fr 50px 60px;

    .col-album {
      display: none;
    }

    .col-title {
      .song-cover {
        width: 35px;
        height: 35px;
      }
    }

    .col-index {
      width: 50px;
    }

    .col-like {
      width: 50px;
    }

    .col-duration {
      width: 60px;

      .duration-wrapper {
        .action-buttons {
          gap: 2px;

          .action-btn {
            padding: 2px;
            font-size: 12px;
          }
        }
      }
    }
  }
}

.header-fade-enter-active,
.header-fade-leave-active {
  transition: all 0.3s ease;
}

.header-fade-enter-from,
.header-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
.sort-icon-arrow {
  font-size: 12px;
  margin-right: 0.2em;
}
</style>
