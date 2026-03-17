<script setup lang="ts">
import { ref, computed, watch, toRaw } from 'vue'
import { searchValue } from '@renderer/store/search'
import { downloadSingleSong } from '@renderer/utils/audio/download'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { MessagePlugin } from 'tdesign-vue-next'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'
import { useRouter } from 'vue-router'
import songCover from '@assets/images/song.jpg'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

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

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const filenameTemplate = ref(settings.value.filenameTemplate)

const keyword = ref('')
const searchResults = ref<MusicItem[]>([])
const loading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 50
const totalItems = ref(0)
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)
const activeTab = ref<'songs' | 'playlists'>('songs')

// 歌单搜索状态
const playlistResults = ref<any[]>([])
const playlistLoading = ref(false)
const playlistPage = ref(1)
const playlistLimit = 30
const skeletonCount = playlistLimit
const playlistTotal = ref(0)
const search = searchValue()
const router = useRouter()
onActivated(async () => {
  const localUserStore = LocalUserDetailStore()
  console.log('sqjsqj', search.getValue)

  if (search.getValue.trim() === '') {
    console.log('跳转')
    router.push({ name: 'find' })
  }
  watch(
    search,
    async () => {
      if (search.getFocus == true || search.getValue.trim() == keyword.value.trim()) return
      if (search.getValue.trim() === '') {
        router.push({ name: 'find' })
        return
      }
      keyword.value = search.getValue
      searchResults.value = []
      playlistResults.value = []
      currentPage.value = 1
      playlistPage.value = 1
      if (activeTab.value === 'songs') {
        await performSearch(true)
      } else {
        await fetchPlaylists(true)
      }
    },
    { immediate: true }
  )

  // 监听 userSource 变化，重新加载页面
  watch(
    () => localUserStore.userSource,
    async () => {
      if (keyword.value.trim()) {
        searchResults.value = []
        playlistResults.value = []
        currentPage.value = 1
        playlistPage.value = 1
        if (activeTab.value === 'songs') {
          await performSearch(true)
        } else {
          await fetchPlaylists(true)
        }
      }
    },
    { deep: true }
  )

  // 标签切换按需加载
  watch(activeTab, async (val) => {
    if (!keyword.value.trim()) return
    if (val === 'songs' && searchResults.value.length === 0) {
      await performSearch(true)
    } else if (val === 'playlists' && playlistResults.value.length === 0) {
      await fetchPlaylists(true)
    }
  })
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
    console.log('搜索结果', result)
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
    hasMore.value = searchResults.value.length <= totalItems.value
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
      searchResults.value[i].img = ''
      console.log('获取失败 index' + i, e)
    }
  }
}
// 计算是否有搜索结果
const hasSongResults = computed(() => searchResults.value && searchResults.value.length > 0)
const hasPlaylistResults = computed(() => playlistResults.value && playlistResults.value.length > 0)

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

const handleDownload = (song: any) => {
  const d = new Date()
  song.template = filenameTemplate.value
  song.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

// 执行歌单搜索（分页）
const fetchPlaylists = async (reset = false) => {
  if (playlistLoading.value || !keyword.value.trim()) return

  if (reset) {
    playlistPage.value = 1
    playlistResults.value = []
  }

  playlistLoading.value = true
  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.source) {
      MessagePlugin.error('请配置音源')
      return
    }
    const source = localUserStore.userSource.source as unknown as string
    const res = await window.api.music.requestSdk('searchPlaylist', {
      source,
      keyword: keyword.value,
      page: playlistPage.value,
      limit: playlistLimit
    })
    console.log('歌单搜索结果', res)
    playlistTotal.value = res?.total || 0
    const list = Array.isArray(res?.list) ? res.list : []
    const mapped = list.map((item: any) => ({
      id: item.id,
      title: item.name,
      description: item.desc || '',
      cover: item.img,
      playCount: item.play_count,
      author: item.author,
      total: item.total,
      time: item.time,
      source: item.source
    }))
    if (reset) {
      playlistResults.value = mapped
    } else {
      playlistResults.value = [...playlistResults.value, ...mapped]
    }
    if (!reset) playlistPage.value += 1
  } catch (e) {
    console.error('歌单搜索失败:', e)
  } finally {
    playlistLoading.value = false
  }
}

// 跳转到歌单详情
const routerToPlaylist = (playlist: any) => {
  router.push({
    name: 'list',
    params: { id: playlist.id },
    query: {
      title: playlist.title,
      source: playlist.source,
      author: playlist.author,
      cover: playlist.cover,
      total: playlist.total
    }
  })
}

const onPlaylistScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target
  const nearBottom = scrollHeight - scrollTop - clientHeight < 100
  const hasMore = playlistResults.value.length < playlistTotal.value
  // console.log('歌单搜索结果', nearBottom, hasMore, !playlistLoading.value)
  if (nearBottom && hasMore && !playlistLoading.value) {
    fetchPlaylists(false)
  }
}

const unescape = (str: string) => str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
</script>

<template>
  <div class="search-container">
    <!-- 顶部：搜索标题与标签 -->
    <div class="search-header">
      <div class="header-row">
        <h2 class="search-title">
          搜索"<span class="keyword">{{ keyword }}</span
          >"
        </h2>
        <div class="result-info">
          <span v-if="activeTab === 'songs'">找到 {{ totalItems }} 首单曲</span>
          <span v-else>找到 {{ playlistTotal }} 个歌单</span>
        </div>
      </div>
      <n-tabs v-model:value="activeTab" type="line" size="small">
        <n-tab-pane name="songs" tab="单曲" />
        <n-tab-pane name="playlists" tab="歌单" />
      </n-tabs>
    </div>

    <!-- 结果内容区 -->
    <div class="result-content">
      <!-- 单曲列表 -->
      <div v-show="activeTab === 'songs'" class="song-tab">
        <div v-if="hasSongResults" class="song-list-wrapper">
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
        <div v-else-if="!loading" class="empty-state">
          <div class="empty-content">
            <div class="empty-icon">🔍</div>
            <h3>未找到相关歌曲</h3>
            <p>请尝试其他关键词</p>
          </div>
        </div>
        <div v-else class="loading-state">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>搜索中...</p>
          </div>
        </div>
      </div>

      <!-- 歌单列表 -->
      <div v-show="activeTab === 'playlists'" class="playlist-tab">
        <div class="grid-scroll-container" @scroll="onPlaylistScroll">
          <TransitionGroup
            v-if="hasPlaylistResults"
            name="grid-fade"
            tag="div"
            class="playlist-grid"
          >
            <div
              v-for="playlist in playlistResults"
              :key="playlist.id"
              class="playlist-card"
              @click="routerToPlaylist(playlist)"
            >
              <div class="playlist-cover">
                <img
                  :src="playlist.cover"
                  :alt="playlist.title"
                  @error="playlist.cover = songCover"
                />
              </div>
              <div class="playlist-info">
                <h4 class="playlist-title">{{ unescape(playlist.title) }}</h4>
                <p class="playlist-desc">{{ playlist.description || '精选歌单' }}</p>
                <div class="playlist-meta">
                  <span class="play-count">
                    <i class="iconfont icon-bofang"></i>
                    {{ playlist.playCount }}
                  </span>
                  <span v-if="playlist.total" class="song-count">{{ playlist.total }}首</span>
                </div>
              </div>
            </div>
          </TransitionGroup>
          <div v-else-if="!playlistLoading" class="empty-state">
            <div class="empty-content">
              <div class="empty-icon">📚</div>
              <h3>未找到相关歌单</h3>
              <p>请尝试其他关键词</p>
            </div>
          </div>
          <div v-else class="loader-grid">
            <div v-for="n in skeletonCount" :key="'sk-' + n" class="playlist-card">
              <div class="playlist-cover">
                <div class="skeleton-block"></div>
              </div>
              <div class="playlist-info">
                <n-skeleton text :repeat="2" />
                <n-skeleton text style="width: 40%" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.search-container {
  box-sizing: border-box;
  // background: var(--search-bg);
  width: 100%;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-header {
  // margin-bottom: 10px;
  flex-shrink: 0;
  .header-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .search-title {
    font-size: 24px;
    font-weight: normal;
    color: var(--search-title-color);
    margin: 0 0 8px 0;
    border-left: 4px solid var(--search-keyword-color);
    padding-left: 8px;
    .keyword {
      color: var(--search-keyword-color);
    }
  }

  .result-info {
    font-size: 12px;
    color: var(--search-info-color);
  }
}

.result-content {
  background: var(--search-content-bg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--search-content-shadow);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.song-list-wrapper {
  background: var(--search-content-bg);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: var(--search-content-shadow);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.playlist-tab,
.song-tab {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.grid-scroll-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}

.pagination-wrapper {
  flex-shrink: 0;
  padding: 8px 0;
  display: flex;
  justify-content: flex-end;
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
      color: var(--search-empty-title);
      margin: 0 0 8px 0;
      font-weight: normal;
    }

    p {
      font-size: 12px;
      color: var(--search-empty-text);
      margin: 0;
    }
  }

  .loading-content {
    text-align: center;

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid var(--search-loading-border);
      border-top: 4px solid var(--search-loading-spinner);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    p {
      font-size: 14px;
      color: var(--search-loading-text);
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

/* 歌单卡片样式（简洁展示信息） */
.playlist-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}
.loader-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  padding: 8px;
}
.grid-fade-enter-active,
.grid-fade-leave-active {
  transition: all 0.25s ease;
}
.grid-fade-enter-from,
.grid-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
.grid-fade-enter-to,
.grid-fade-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.playlist-card {
  background: var(--find-card-bg);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--find-card-shadow);
  transition: all 0.2s ease;
  cursor: pointer;
  .playlist-cover {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    .skeleton-block {
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        rgba(0, 0, 0, 0.06) 25%,
        rgba(0, 0, 0, 0.12) 37%,
        rgba(0, 0, 0, 0.06) 63%
      );
      background-size: 400% 100%;
      animation: shimmer 1.4s ease infinite;
      border-radius: 4px;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .playlist-info {
    padding: 12px;
    .playlist-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--find-text-primary);
      margin-bottom: 6px;
      line-height: 1.4;
      display: -webkit-box;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .playlist-desc {
      font-size: 12px;
      color: var(--find-text-secondary);
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .playlist-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      .play-count,
      .song-count {
        font-size: 12px;
        color: var(--find-text-muted);
      }
    }
  }
  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--find-card-shadow-hover);
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .search-container {
    padding: 15px;
  }
}
</style>
