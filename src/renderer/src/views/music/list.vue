<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { downloadSingleSong } from '@renderer/utils/download'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'

interface MusicItem {
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
}

// 路由实例
const route = useRoute()
const LocalUserDetail = LocalUserDetailStore()

// 响应式状态
const songs = ref<MusicItem[]>([])
const loading = ref(true)
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)
const playlistInfo = ref({
  id: '',
  title: '',
  author: '',
  cover: '',
  total: 0,
  source: ''
})

// 获取歌单歌曲列表
const fetchPlaylistSongs = async () => {
  try {
    loading.value = true

    // 从路由参数中获取歌单信息
    playlistInfo.value = {
      id: route.params.id as string,
      title: (route.query.title as string) || '歌单',
      author: (route.query.author as string) || '未知',
      cover: (route.query.cover as string) || '',
      total: Number(route.query.total) || 0,
      source: (route.query.source as string) || (LocalUserDetail.userSource.source as any)
    }

    // 调用API获取歌单详情和歌曲列表
    const result = await window.api.music.requestSdk('getPlaylistDetail', {
      source: playlistInfo.value.source,
      id: playlistInfo.value.id,
      page: 1
    }) as any
    console.log(result)
    if (result && result.list) {
      songs.value = result.list

      // 获取歌曲封面
      setPic(0, playlistInfo.value.source)

      // 如果API返回了歌单详细信息，更新歌单信息
      if (result.info) {
        playlistInfo.value = {
          ...playlistInfo.value,
          title: result.info.name || playlistInfo.value.title,
          author: result.info.author || playlistInfo.value.author,
          cover: result.info.img || playlistInfo.value.cover,
          total: result.info.total || playlistInfo.value.total
        }
      }
    }
  } catch (error) {
    console.error('获取歌单歌曲失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取歌曲封面
async function setPic(offset: number, source: string) {
  for (let i = offset; i < songs.value.length; i++) {
    const tempImg = songs.value[i].img
    if (tempImg) continue
    try {
      const url = await window.api.music.requestSdk('getPic', {
        source,
        songInfo: toRaw(songs.value[i])
      })

      if (typeof url !== 'object') {
        songs.value[i].img = url
      } else {
        songs.value[i].img = 'resources/logo.png'
      }
    } catch (e) {
      songs.value[i].img = 'logo.svg'
      console.log('获取封面失败 index' + i, e)
    }
  }
}

// 组件事件处理函数
const handlePlay = (song: MusicItem) => {
  currentSong.value = song
  isPlaying.value = true
  console.log('播放歌曲:', song.name)
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(song))
  }
}

const handlePause = () => {
  isPlaying.value = false
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('pause')
  }
}

const handleDownload = (song: MusicItem) => {
  downloadSingleSong(song)
}

const handleAddToPlaylist = (song: MusicItem) => {
  console.log('添加到播放列表:', song.name)
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song))
  }
}
// 组件挂载时获取数据
onMounted(() => {
  fetchPlaylistSongs()
})
</script>

<template>
  <div class="list-container">
    <!-- 固定头部区域 -->
    <div class="fixed-header">
      <!-- 歌单信息 -->
      <div class="playlist-header">
        <div class="playlist-cover">
          <img :src="playlistInfo.cover" :alt="playlistInfo.title" />
        </div>
        <div class="playlist-details">
          <h1 class="playlist-title">{{ playlistInfo.title }}</h1>
          <p class="playlist-author">by {{ playlistInfo.author }}</p>
          <p class="playlist-stats">{{ playlistInfo.total }} 首歌曲</p>
        </div>
      </div>
    </div>

    <!-- 可滚动的歌曲列表区域 -->
    <div class="scrollable-content">
      <div v-if="loading" class="loading-container">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>

      <div v-else class="song-list-wrapper">
        <SongVirtualList
          :songs="songs"
          :current-song="currentSong"
          :is-playing="isPlaying"
          :show-index="true"
          :show-album="true"
          :show-duration="true"
          @play="handlePlay"
          @pause="handlePause"
          @download="handleDownload"
          @add-to-playlist="handleAddToPlaylist"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.list-container {
  background: #fafafa;
  box-sizing: border-box;
  width: 100%;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;

  .fixed-header {
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .scrollable-content {
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;

  .loading-content {
    text-align: center;

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #507daf;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    p {
      font-size: 14px;
      color: #666;
      margin: 0;
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.playlist-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #fff;
  border-radius: 0.75rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

  .playlist-cover {
    width: 120px;
    height: 120px;
    border-radius: 0.5rem;
    overflow: hidden;
    flex-shrink: 0;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .playlist-details {
    flex: 1;

    .playlist-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #111827;
      margin: 0 0 0.5rem 0;
    }

    .playlist-author {
      font-size: 1rem;
      color: #6b7280;
      margin: 0 0 0.5rem 0;
    }

    .playlist-stats {
      font-size: 0.875rem;
      color: #9ca3af;
      margin: 0;
    }
  }
}

.song-list-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .list-container {
    padding: 15px;
  }

  .playlist-header {
    flex-direction: column;
    text-align: center;
    gap: 1rem;

    .playlist-cover {
      width: 100px;
      height: 100px;
    }
  }
}
</style>
