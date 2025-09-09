<script setup lang="ts">
import { ref, onMounted, computed, watch, toRaw } from 'vue'
import { searchValue } from '@renderer/store/search'
import { downloadSingleSong } from '@renderer/utils/download'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { MessagePlugin } from 'tdesign-vue-next'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'

interface MusicItem {
  id: number
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

const keyword = ref('')
const searchResults = ref<MusicItem[]>([])
const loading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 50
const totalItems = ref(0)
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)
const search = searchValue()

onMounted(async () => {
  watch(
    search,
    async () => {
      keyword.value = search.getValue
      await performSearch(true)
    },
    { immediate: true }
  )
})

// 执行搜索
const performSearch = async (reset = false) => {
  if (loading.value || !keyword.value.trim()) return

  if (reset) {
    currentPage.value = 1
    searchResults.value = []
    hasMore.value = true
  }

  if (!hasMore.value) return

  loading.value = true
  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.source) {
      MessagePlugin.error('请配置音源')
      return
    }
    const source = localUserStore.userSource.source as unknown as string
    const result = await window.api.music.requestSdk('search', {
      source,
      keyword: keyword.value,
      page: currentPage.value,
      limit: pageSize
    })

    totalItems.value = result.total || 0
    const newSongs = (result.list || []).map((song: any, index: number) => ({
      ...song,
      id: song.songmid || `${currentPage.value}-${index}` // 确保每首歌都有唯一ID
    }))

    if (reset) {
      searchResults.value = newSongs
    } else {
      searchResults.value = [...searchResults.value, ...newSongs]
    }

    setPic((currentPage.value - 1) * pageSize, source)
    currentPage.value += 1
    hasMore.value = newSongs.length >= pageSize
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    loading.value = false
  }
}

async function setPic(offset: number, source: string) {
  for (let i = offset; i < searchResults.value.length; i++) {
    const tempImg = searchResults.value[i].img
    if (tempImg) continue
    try {
      const url = await window.api.music.requestSdk('getPic', {
        source,
        songInfo: toRaw(searchResults.value[i])
      })
      if (typeof url !== 'object') {
        searchResults.value[i].img = url
      } else {
        searchResults.value[i].img = ''
      }
    } catch (e) {
      searchResults.value[i].img = 'logo.svg'
      console.log('获取失败 index' + i, e)
    }
  }
}
// 计算是否有搜索结果
const hasResults = computed(() => searchResults.value && searchResults.value.length > 0)

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

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target

  // 检查是否需要加载更多
  if (scrollHeight - scrollTop - clientHeight < 100 && !loading.value && hasMore.value) {
    performSearch(false)
  }
}
</script>

<template>
  <div class="search-container">
    <!-- 搜索结果标题 -->
    <div class="search-header">
      <h2 class="search-title">
        搜索"<span class="keyword">{{ keyword }}</span
        >"
      </h2>
      <div v-if="hasResults" class="result-info">找到 {{ totalItems }} 首单曲</div>
    </div>

    <!-- 歌曲列表 -->
    <div v-if="hasResults" class="song-list-wrapper">
      <SongVirtualList
        :songs="searchResults"
        :current-song="currentSong"
        :is-playing="isPlaying"
        :show-index="true"
        :show-album="true"
        :show-duration="true"
        @play="handlePlay"
        @pause="handlePause"
        @download="handleDownload"
        @add-to-playlist="handleAddToPlaylist"
        @scroll="handleScroll"
      />
    </div>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="empty-state">
      <div class="empty-content">
        <div class="empty-icon">🔍</div>
        <h3>未找到相关歌曲</h3>
        <p>请尝试其他关键词</p>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-else class="loading-state">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p>搜索中...</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-container {
  background: #fafafa;
  box-sizing: border-box;
  width: 100%;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.search-header {
  margin-bottom: 20px;

  .search-title {
    font-size: 24px;
    font-weight: normal;
    color: #333;
    margin: 0 0 8px 0;

    .keyword {
      color: #507daf;
    }
  }

  .result-info {
    font-size: 12px;
    color: #999;
  }
}

.song-list-wrapper {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty-state,
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;

  .empty-content {
    text-align: center;

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    h3 {
      font-size: 16px;
      color: #333;
      margin: 0 0 8px 0;
      font-weight: normal;
    }

    p {
      font-size: 12px;
      color: #999;
      margin: 0;
    }
  }

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

/* 响应式设计 */
@media (max-width: 768px) {
  .search-container {
    padding: 15px;
  }
}
</style>
