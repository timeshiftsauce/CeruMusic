<template>
  <div class="song-virtual-list">
    <!-- 表头 -->
    <div class="list-header">
      <div v-if="showIndex" class="col-index">#</div>
      <div class="col-title">标题</div>
      <div v-if="showAlbum" class="col-album">专辑</div>
      <div class="col-like">喜欢</div>
      <div v-if="showDuration" class="col-duration">时长</div>
    </div>

    <!-- 虚拟滚动容器 -->
    <div ref="scrollContainer" class="virtual-scroll-container" @scroll="onScroll">
      <div class="virtual-scroll-spacer" :style="{ height: totalHeight + 'px' }">
        <div class="virtual-scroll-content" :style="{ transform: `translateY(${offsetY}px)` }">
          <div
            v-for="(song, index) in visibleItems"
            :key="song.id || song.songmid"
            class="song-item"
            @mouseenter="hoveredSong = song.id || song.songmid"
            @mouseleave="hoveredSong = null"
            @contextmenu="handleContextMenu($event, song)"
          >
            <!-- 序号或播放状态图标 -->
            <div v-if="showIndex" class="col-index">
              <Transition name="playSong" mode="out-in">
                <span v-if="hoveredSong !== (song.id || song.songmid)" class="track-number">
                  {{ String(visibleStartIndex + index + 1).padStart(2, '0') }}
                </span>
                <button v-else class="play-btn" title="播放" @click.stop="handlePlay(song)">
                  <i class="icon-play"></i>
                </button>
              </Transition>
            </div>

            <!-- 歌曲信息 -->
            <div class="col-title" @click="handleSongClick(song)">
              <div v-if="song.img" class="song-cover">
                <img :src="song.img" loading="lazy" alt="封面" />
              </div>
              <div class="song-info">
                <div class="song-title" :title="song.name">{{ song.name }}</div>
                <div class="song-artist" :title="song.singer">
                  <span v-if="song.types && song.types.length > 0" class="quality-tag">
                    {{ getQualityDisplayName(song.types[song.types.length - 1]) }}
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
              <button class="action-btn like-btn" @click.stop>
                <i class="icon-heart"></i>
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
import { ref, computed, onMounted, onUnmounted, nextTick, toRaw } from 'vue'
import {
  DownloadIcon,
  PlayCircleIcon,
  AddIcon,
  FolderIcon,
  DeleteIcon
} from 'tdesign-icons-vue-next'
import ContextMenu from '../ContextMenu/ContextMenu.vue'
import { createMenuItem, createSeparator, calculateMenuPosition } from '../ContextMenu/utils'
import type { ContextMenuItem, ContextMenuPosition } from '../ContextMenu/types'
import songListAPI from '@renderer/api/songList'
import type { SongList } from '@common/types/songList'
import { MessagePlugin } from 'tdesign-vue-next'

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
}

interface Props {
  songs: Song[]
  currentSong?: Song | null
  isPlaying?: boolean
  showIndex?: boolean
  showAlbum?: boolean
  showDuration?: boolean
  isLocalPlaylist?: boolean
  playlistId?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentSong: null,
  isPlaying: false,
  showIndex: true,
  showAlbum: true,
  showDuration: true,
  isLocalPlaylist: false,
  playlistId: ''
})

const emit = defineEmits([
  'play',
  'pause',
  'addToPlaylist',
  'download',
  'scroll',
  'removeFromLocalPlaylist'
])

// 虚拟滚动相关状态
const scrollContainer = ref<HTMLElement>()
const hoveredSong = ref<number | null>(null)
const itemHeight = 64
const buffer = 5

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

// 歌单列表
const playlists = ref<SongList[]>([])

// 计算总高度
const totalHeight = computed(() => props.songs.length * itemHeight)

// 计算偏移量
const offsetY = computed(() => visibleStartIndex.value * itemHeight)

// 计算可见项目
const visibleItems = computed(() => {
  const totalItems = props.songs.length
  if (totalItems === 0) return []

  if (!scrollContainer.value) return props.songs.slice(0, Math.min(10, totalItems))

  const containerRect = scrollContainer.value.getBoundingClientRect()
  const containerHeight = containerRect.height || 400

  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.floor(scrollTop.value / itemHeight)
  const endIndex = Math.min(startIndex + visibleCount + buffer * 2, totalItems)

  visibleStartIndex.value = Math.max(0, startIndex - buffer)
  visibleEndIndex.value = endIndex

  return props.songs.slice(visibleStartIndex.value, visibleEndIndex.value)
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
  hires: '高清',
  atmos: '全景',
  master: '母带'
}

const getQualityDisplayName = (quality: any) => {
  if (typeof quality === 'object' && quality.type) {
    return qualityMap[quality.type] || quality.type
  }
  return qualityMap[quality] || quality || ''
}

// 处理滚动事件
const onScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  emit('scroll', event)
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
  try {
    const result = await songListAPI.getAll()
    if (result.success) {
      playlists.value = result.data || []
    } else {
      console.error('加载歌单失败:', result.error)
    }
  } catch (error) {
    console.error('加载歌单失败:', error)
  }
}

// 添加歌曲到歌单
const handleAddToSongList = async (song: Song, playlist: SongList) => {
  try {
    const result = await songListAPI.addSongs(playlist.id, [toRaw(song) as any])
    if (result.success) {
      MessagePlugin.success(`已将"${song.name}"添加到歌单"${playlist.name}"`)
    } else {
      MessagePlugin.error(result.error || '添加到歌单失败')
    }
  } catch (error) {
    console.error('添加到歌单失败:', error)
    MessagePlugin.error('添加到歌单失败')
  }
}

onMounted(() => {
  // 组件挂载后触发一次重新计算
  nextTick(() => {
    if (scrollContainer.value) {
      // 触发一次重新计算可见项目
      const event = new Event('scroll')
      onScroll(event)
    }
  })

  // 加载歌单列表
  loadPlaylists()

  // 监听歌单变化事件
  window.addEventListener('playlist-updated', loadPlaylists)
})

onUnmounted(() => {
  // 清理事件监听器
  window.removeEventListener('playlist-updated', loadPlaylists)
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

.list-header {
  display: grid;
  grid-template-columns: 60px 1fr 200px 60px 80px;
  padding: 8px 20px;
  background: var(--song-list-header-bg);
  border-bottom: 1px solid var(--song-list-header-border);
  font-size: 12px;
  color: var(--song-list-header-text);
  flex-shrink: 0;
  height: 40px;
  box-sizing: border-box;
  align-items: center;

  .col-index {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .col-title {
    padding-left: 20px;
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
    grid-template-columns: 60px 1fr 200px 60px 80px;
    padding: 8px 20px;
    border-bottom: 1px solid var(--song-list-item-border);
    cursor: pointer;
    transition: background-color 0.2s ease;
    height: 64px;

    &:hover,
    &.is-hovered {
      background: var(--song-list-item-hover);

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
      width: 60px;

      .track-number {
        font-size: 14px;
        color: var(--song-list-track-number);
        font-variant-numeric: tabular-nums;
        width: 100%;
        text-align: center;
      }

      .play-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--song-list-btn-hover);
        font-size: 16px;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-style: none;

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

          .quality-tag {
            background: var(--song-list-quality-bg);
            color: var(--song-list-quality-color);
            padding: 1px 4px;
            border-radius: 2px;
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
</style>
