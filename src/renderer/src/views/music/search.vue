<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref, computed, watch, toRaw } from 'vue'
import { searchValue } from '@renderer/store/search'
import { interceptsSearchResults, resolveSearchQuery } from '@renderer/plugin/operations'
import { rewriteSearchResults } from '@renderer/plugin/searchResults'
import { downloadSingleSong } from '@renderer/utils/audio/download'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { MessagePlugin } from '@renderer/plugin/notifications'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'
import { useRoute, useRouter } from 'vue-router'
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

const localUserDetailStoreInst = LocalUserDetailStore()
const { userSource } = storeToRefs(localUserDetailStoreInst)

const keyword = ref('')
const searchResults = ref<MusicItem[]>([])
const loading = ref(false)
const hasMore = ref(false)
const playlistMore = ref(false)
const pages = {
  track:{raw:0,delta:0,cursor:undefined as string|undefined,seen:new Set<string>()},
  playlist:{raw:0,delta:0,cursor:undefined as string|undefined,seen:new Set<string>()}
}
async function visiblePage(kind:keyof typeof pages, result:any, source:string, request:number) {
  const raw = Array.isArray(result?.list) ? result.list : []
  let rows=raw
  if (interceptsSearchResults()) {
    try {rows=await rewriteSearchResults(keyword.value,source,kind,raw,input=>desktopBridge.api.plugins.searchResults(input))}
    catch(error){console.warn('搜索结果拦截未生效',error)}
  }
  if (request!==generation) return null
  const state=pages[kind]
  state.raw+=raw.length
  state.delta+=rows.length-raw.length
  const cursor=typeof result?.nextCursor==='string' && result.nextCursor ? result.nextCursor : undefined
  const more=cursor ? !state.seen.has(cursor) : raw.length>0 && state.raw<Number(result?.total)
  if (cursor) state.seen.add(cursor)
  state.cursor=cursor
  const total=more ? Math.max(state.raw,Number(result?.total)||0)+state.delta : state.raw+state.delta
  return {rows,total,more}
}
const currentPage = ref(1)
const pageSize = 50
const totalItems = ref(0)
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)
const activeTab = ref<'songs' | 'playlists'>('songs')
const songListRef = ref<InstanceType<typeof SongVirtualList> | null>(null)
const playlistScrollRef = ref<HTMLElement | null>(null)

// 歌单搜索状态
const playlistResults = ref<any[]>([])
const playlistLoading = ref(false)
const playlistPage = ref(1)
const playlistLimit = 30
const skeletonCount = playlistLimit
const playlistTotal = ref(0)
const search = searchValue()
const router = useRouter()
const route = useRoute()
let generation = 0

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
  const request = generation
  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.source) {
      MessagePlugin.error('请配置音源')
      return
    }
    const source = localUserStore.userSource.source as unknown as string
    const result = await desktopBridge.api.music.requestSdk('search', {
      source,
      keyword: keyword.value,
      page: currentPage.value,
      cursor: pages.track.cursor,
      limit: pageSize
    })
    if (request !== generation) return
    const visible=await visiblePage('track',result,source,request)
    if (!visible || request!==generation) return
    totalItems.value = visible.total
    const newSongs = visible.rows.map((song: any, index: number) => ({
      ...song,
      id: song.songmid || `${currentPage.value}-${index}` // 确保每首歌都有唯一ID
    }))

    if (reset) {
      searchResults.value = newSongs
    } else {
      searchResults.value = [...searchResults.value, ...newSongs]
    }

    void setPic(searchResults.value.length - newSongs.length, source)
    currentPage.value += 1
    hasMore.value = visible.more
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    if (request === generation) loading.value = false
  }
}

async function setPic(offset: number, source: string) {
  // 固定本批次对象，避免搜索切换后按旧下标覆盖新结果。
  const songs = searchResults.value.slice(offset).filter((song) => !song.img)
  let next = 0
  const worker = async () => {
    while (next < songs.length) {
      const song = songs[next++]
      if (!searchResults.value.includes(song) || song.img) continue
      try {
        const url = await desktopBridge.api.music.requestSdk('getPic', {
          source: song.source || source,
          songInfo: toRaw(song)
        })
        if (searchResults.value.includes(song) && !song.img && typeof url === 'string') {
          song.img = url
        }
      } catch {
        // 单曲补图失败不影响其他歌曲，也不覆盖已有图片。
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, songs.length) }, worker))
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

const nearBottom = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 100

const handleScroll = () => {
  if (activeTab.value !== 'songs' || currentPage.value <= 1 || loading.value || !hasMore.value) return
  const el = songListRef.value?.scrollContainer
  if (!el || nearBottom(el)) void performSearch()
}

// 执行歌单搜索（分页）
const fetchPlaylists = async (reset = false) => {
  if (playlistLoading.value || !keyword.value.trim()) return

  if (reset) {
    playlistPage.value = 1
    playlistResults.value = []
  }

  playlistLoading.value = true
  const request = generation
  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.source) {
      MessagePlugin.error('请配置音源')
      return
    }
    const source = localUserStore.userSource.source as unknown as string
    const res = await desktopBridge.api.music.requestSdk('searchPlaylist', {
      source,
      keyword: keyword.value,
      page: playlistPage.value,
      cursor: pages.playlist.cursor,
      limit: playlistLimit
    })
    if (request !== generation) return
    const visible=await visiblePage('playlist',res,source,request)
    if (!visible || request!==generation) return
    playlistTotal.value = visible.total
    playlistMore.value = visible.more
    const list = visible.rows
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
    playlistPage.value += 1
  } catch (e) {
    console.error('歌单搜索失败:', e)
  } finally {
    if (request === generation) playlistLoading.value = false
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

const onPlaylistScroll = () => {
  if (activeTab.value !== 'playlists' || playlistPage.value <= 1 || playlistLoading.value || !playlistMore.value) return
  const el = playlistScrollRef.value
  if (el && nearBottom(el)) void fetchPlaylists()
}

const unescape = (str: string) => str.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
watch([() => route.name, () => search.submission, userSource], async (_, __, onCleanup) => {
  const current = ++generation
  onCleanup(() => { generation++ })
  if (route.name !== 'search') return
  keyword.value = ''
  loading.value = playlistLoading.value = false
  totalItems.value = playlistTotal.value = 0
  hasMore.value = playlistMore.value = false
  for (const state of Object.values(pages)) {state.raw=state.delta=0;state.cursor=undefined;state.seen.clear()}
  searchResults.value = []
  playlistResults.value = []
  playlistPage.value = currentPage.value = 1
  if (!search.submitted) return
  const sourceId = String(userSource.value.source || '')
  if (!sourceId) { MessagePlugin.error('请配置音源'); return }
  try {
    const resolved = await resolveSearchQuery(search.submitted, sourceId)
    if (current !== generation || resolved === null) return
    keyword.value = resolved
    if (activeTab.value === 'songs') await performSearch(true)
    else await fetchPlaylists(true)
  } catch (error) { if (current === generation) MessagePlugin.error('搜索失败：' + String(error)) }
}, {immediate:true, deep:true})
watch(activeTab, async tab => {
  if (!keyword.value || route.name !== 'search') return
  if (tab === 'songs' && currentPage.value === 1) await performSearch(true)
  if (tab === 'playlists' && playlistPage.value === 1) await fetchPlaylists(true)
})

// A plugin can hide a whole page or leave too few rows to scroll. Recheck the
// bottom after a successful page and when its tab becomes visible.
watch([currentPage, playlistPage, activeTab], () => {
  if (!keyword.value || route.name !== 'search') return
  if (activeTab.value === 'songs') handleScroll()
  else onPlaylistScroll()
}, { flush: 'post' })
</script>

<template>
  <div class="search-container">
    <!-- 顶部：搜索标题与标签 -->
    <div class="search-header">
      <div class="header-row">
        <h2 class="search-title">
          搜索"<span class="keyword">{{ keyword || search.submitted }}</span
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
            ref="songListRef"
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
        <div v-else-if="!loading && !hasMore" class="empty-state">
          <div class="empty-content">
            <div class="empty-icon">🔍</div>
            <h3>未找到相关歌曲</h3>
            <p>请尝试其他关键词</p>
          </div>
        </div>
        <div v-else-if="loading" class="loading-state">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>搜索中...</p>
          </div>
        </div>
      </div>

      <!-- 歌单列表 -->
      <div v-show="activeTab === 'playlists'" class="playlist-tab">
        <div ref="playlistScrollRef" class="grid-scroll-container" @scroll="onPlaylistScroll">
          <TransitionGroup
            v-if="hasPlaylistResults"
            name="grid-fade"
            tag="div"
            class="playlist-grid"
          >
            <div
              v-for="playlist in playlistResults"
              :key="JSON.stringify([playlist.source,playlist.id])"
              class="playlist-card"
              @click="routerToPlaylist(playlist)"
            >
              <div class="playlist-cover">
                <img
                  :src="playlist.cover"
                  :alt="playlist.title"
                  @error="playlist.cover = songCover"
                />
                <span v-if="userSource.source === 'mix' && playlist.source" class="source-badge">
                  {{ playlist.source }}
                </span>
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
          <div v-else-if="!playlistLoading && !playlistMore" class="empty-state">
            <div class="empty-content">
              <div class="empty-icon">📚</div>
              <h3>未找到相关歌单</h3>
              <p>请尝试其他关键词</p>
            </div>
          </div>
          <div v-else-if="playlistLoading" class="loader-grid">
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
    .source-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      color: #fff;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(12px) saturate(160%);
      -webkit-backdrop-filter: blur(12px) saturate(160%);
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
      pointer-events: none;
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
