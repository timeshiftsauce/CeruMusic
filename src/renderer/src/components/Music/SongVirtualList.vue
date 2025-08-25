<template>
  <div class="song-virtual-list">
    <!-- 表头 -->
    <div class="list-header">
      <div class="col-index" v-if="showIndex"></div>
      <div class="col-title">标题</div>
      <div class="col-album" v-if="showAlbum">专辑</div>
      <div class="col-like">喜欢</div>
      <div class="col-duration" v-if="showDuration">时长</div>
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
          >
            <!-- 序号或播放状态图标 -->
            <div class="col-index" v-if="showIndex">
              <span v-if="hoveredSong !== (song.id || song.songmid)" class="track-number">
                {{ String(visibleStartIndex + index + 1).padStart(2, '0') }}
              </span>
              <button v-else class="play-btn" title="播放" @click.stop="handlePlay(song)">
                <i class="icon-play"></i>
              </button>
            </div>

            <!-- 歌曲信息 -->
            <div class="col-title" @dblclick="handleAddToPlaylist(song)">
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
            <div class="col-album" v-if="showAlbum">
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
            <div class="col-duration" v-if="showDuration">
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { DownloadIcon } from 'tdesign-icons-vue-next'

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
}

const props = withDefaults(defineProps<Props>(), {
  currentSong: null,
  isPlaying: false,
  showIndex: true,
  showAlbum: true,
  showDuration: true
})

const emit = defineEmits(['play', 'pause', 'addToPlaylist', 'download','scroll'])

// 虚拟滚动相关状态
const scrollContainer = ref<HTMLElement>()
const hoveredSong = ref<number | null>(null)
const itemHeight = 64
const buffer = 5

const scrollTop = ref(0)
const visibleStartIndex = ref(0)
const visibleEndIndex = ref(0)

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

// 判断是否为当前歌曲
const isCurrentSong = (song: Song) => {
  return (
    props.currentSong &&
    (song.id === props.currentSong.id || song.songmid === props.currentSong.songmid)
  )
}

// 处理播放
const handlePlay = (song: Song) => {
  if (isCurrentSong(song) && props.isPlaying) {
    emit('pause')
  } else {
    emit('play', song)
  }
}

// 处理添加到播放列表
const handleAddToPlaylist = (song: Song) => {
  emit('addToPlaylist', song)
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

onMounted(() => {
  // 组件挂载后触发一次重新计算
  nextTick(() => {
    if (scrollContainer.value) {
      // 触发一次重新计算可见项目
      const event = new Event('scroll')
      onScroll(event)
    }
  })
})
</script>

<style scoped>
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
  background: #fafafa;
  border-bottom: 1px solid #e9e9e9;
  font-size: 12px;
  color: #999;
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
  background: #fff;
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
    border-bottom: 1px solid #f5f5f5;
    cursor: pointer;
    transition: background-color 0.2s ease;
    height: 64px;

    &:hover,
    &.is-hovered {
      background: #f5f5f5;
    }

    &.is-current {
      background: #f0f7ff;
      color: #507daf;
    }

    &.is-playing {
      background: #e6f7ff;
      color: #507daf;
    }

    .col-index {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 60px;

      .track-number {
        font-size: 14px;
        color: #999;
        font-variant-numeric: tabular-nums;
        width: 100%;
        text-align: center;
      }

      .play-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #507daf;
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
          background: rgba(80, 125, 175, 0.1);
          color: #3a5d8f;
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
          color: #333;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;

          &:hover {
            color: #507daf;
          }
        }

        .song-artist {
          font-size: 12px;
          color: #999;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          display: flex;
          align-items: center;
          gap: 4px;

          .quality-tag {
            background: #fff7e6;
            color: #fa8c16;
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
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;

        &:hover {
          color: #507daf;
          cursor: pointer;
        }
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
        color: #ccc;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: #507daf;
          background: rgba(80, 125, 175, 0.1);
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
          color: #999;
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
            color: #ccc;
            padding: 6px;
            border-radius: 50%;
            transition: all 0.2s;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;

            &:hover {
              color: #507daf;
              background: rgba(80, 125, 175, 0.1);
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
