<script setup lang="ts">
import { ref, onMounted, toRaw } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { downloadSingleSong } from '@renderer/utils/audio/download'
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

    // 检查是否是本地歌单
    const isLocalPlaylist = route.query.type === 'local' || route.query.source === 'local'

    if (isLocalPlaylist) {
      // 处理本地歌单
      await fetchLocalPlaylistSongs()
    } else {
      // 处理网络歌单
      await fetchNetworkPlaylistSongs()
    }
  } catch (error) {
    console.error('获取歌单歌曲失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取本地歌单歌曲
const fetchLocalPlaylistSongs = async () => {
  try {
    // 调用本地歌单API获取歌曲列表
    const result = await window.api.songList.getSongs(playlistInfo.value.id)

    if (result.success && result.data) {
      songs.value = result.data.map((song: any) => ({
        singer: song.singer || '未知歌手',
        name: song.name || '未知歌曲',
        albumName: song.albumName || '未知专辑',
        albumId: song.albumId || 0,
        source: song.source || 'local',
        interval: song.interval || '0:00',
        songmid: song.songmid,
        img: song.img || '',
        lrc: song.lrc || null,
        types: song.types || [],
        _types: song._types || {},
        typeUrl: song.typeUrl || {}
      }))

      // 更新歌单信息中的歌曲总数
      playlistInfo.value.total = songs.value.length

      // 获取歌单详细信息
      const playlistResult = await window.api.songList.getById(playlistInfo.value.id)
      if (playlistResult.success && playlistResult.data) {
        const playlist = playlistResult.data
        playlistInfo.value = {
          ...playlistInfo.value,
          title: playlist.name,
          cover: playlist.coverImgUrl || playlistInfo.value.cover,
          total: songs.value.length
        }
      }
    } else {
      console.error('获取本地歌单失败:', result.error)
      songs.value = []
    }
  } catch (error) {
    console.error('获取本地歌单歌曲失败:', error)
    songs.value = []
  }
}

// 获取网络歌单歌曲
const fetchNetworkPlaylistSongs = async () => {
  try {
    // 调用API获取歌单详情和歌曲列表
    const result = (await window.api.music.requestSdk('getPlaylistDetail', {
      source: playlistInfo.value.source,
      id: playlistInfo.value.id,
      page: 1
    })) as any

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
    console.error('获取网络歌单失败:', error)
    songs.value = []
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

// 替换播放列表的通用函数
const replacePlaylist = (songsToReplace: MusicItem[], shouldShuffle = false) => {
  if (!(window as any).musicEmitter) {
    MessagePlugin.error('播放器未初始化')
    return
  }

  let finalSongs = [...songsToReplace]

  if (shouldShuffle) {
    // 创建歌曲索引数组并打乱
    const shuffledIndexes = Array.from({ length: songsToReplace.length }, (_, i) => i)
    for (let i = shuffledIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledIndexes[i], shuffledIndexes[j]] = [shuffledIndexes[j], shuffledIndexes[i]]
    }

    // 按打乱的顺序重新排列歌曲
    finalSongs = shuffledIndexes.map((index) => songsToReplace[index])
  }

  // 使用自定义事件替换整个播放列表
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit(
      'replacePlaylist',
      finalSongs.map((song) => toRaw(song))
    )
  }

  // // 更新当前播放状态
  // if (finalSongs[0]) {
  //   currentSong.value = finalSongs[0]
  //   isPlaying.value = true
  // }
  // const playerSong = inject('PlaySong',(...args:any)=>args)
  // nextTick(()=>{
  //   playerSong(finalSongs[0])
  // })
  MessagePlugin.success(`请稍等歌曲加载完成播放`)
}

// 播放整个歌单
const handlePlayPlaylist = () => {
  if (songs.value.length === 0) {
    MessagePlugin.warning('歌单为空，无法播放')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '播放歌单',
    body: `确定要用歌单"${playlistInfo.value.title}"中的 ${songs.value.length} 首歌曲替换当前播放列表吗？`,
    confirmBtn: '确定替换',
    cancelBtn: '取消',
    onConfirm: () => {
      console.log('播放歌单:', playlistInfo.value.title)
      replacePlaylist(songs.value, false)
      dialog.destroy()
    },
    onCancel: () => {
      dialog.destroy()
    }
  })
}
// 随机播放歌单
const handleShufflePlaylist = () => {
  if (songs.value.length === 0) {
    MessagePlugin.warning('歌单为空，无法播放')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '随机播放歌单',
    body: `确定要用歌单"${playlistInfo.value.title}"中的 ${songs.value.length} 首歌曲随机替换当前播放列表吗？`,
    confirmBtn: '确定替换',
    cancelBtn: '取消',
    onConfirm: () => {
      console.log('随机播放歌单:', playlistInfo.value.title)
      replacePlaylist(songs.value, true)
      dialog.destroy()
    },
    onCancel: () => {
      dialog.destroy()
    }
  })
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

          <!-- 播放控制按钮 -->
          <div class="playlist-actions">
            <t-button
              theme="primary"
              size="medium"
              :disabled="songs.length === 0 || loading"
              class="play-btn"
              @click="handlePlayPlaylist"
            >
              <template #icon>
                <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </template>
              播放全部
            </t-button>

            <t-button
              variant="outline"
              size="medium"
              :disabled="songs.length === 0 || loading"
              class="shuffle-btn"
              @click="handleShufflePlaylist"
            >
              <template #icon>
                <svg class="shuffle-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                  />
                </svg>
              </template>
              随机播放
            </t-button>
          </div>
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
  box-sizing: border-box;
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
      margin: 0 0 1rem 0;
    }

    .playlist-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;

      .play-btn,
      .shuffle-btn {
        min-width: 120px;

        .play-icon,
        .shuffle-icon {
          width: 16px;
          height: 16px;
        }
      }
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

    .playlist-details {
      .playlist-actions {
        flex-direction: column;
        gap: 0.5rem;

        .play-btn,
        .shuffle-btn {
          width: 100%;
          min-width: auto;
        }
      }
    }
  }
}

@media (max-width: 480px) {
  .playlist-header {
    .playlist-details {
      .playlist-actions {
        .play-btn,
        .shuffle-btn {
          .play-icon,
          .shuffle-icon {
            width: 14px;
            height: 14px;
          }
        }
      }
    }
  }
}
</style>
