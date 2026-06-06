<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import SongVirtualList from '@renderer/components/Music/SongVirtualList.vue'
import songCover from '@assets/images/song.jpg'

interface MusicItem {
  id: number
  singer: string
  name: string
  albumName: string
  albumId: number | string
  source: string
  interval: string
  songmid: number | string
  img: string
  lrc: null | string
  types: any[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  publishTime?: number | string
  publishDate?: string
}

const route = useRoute()
const radioId = computed(() => String(route.params.id || ''))
const source = computed(() => String(route.query.source || 'wy'))
const title = computed(() => String(route.query.title || '电台节目'))
const cover = computed(() => String(route.query.cover || ''))
const author = computed(() => String(route.query.author || ''))
const desc = computed(() => String(route.query.desc || ''))
const totalText = computed(() => String(route.query.total || '0'))
const playCount = computed(() => String(route.query.playCount || ''))

const programs = ref<MusicItem[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = 50
const total = ref(0)
const hasMore = ref(true)
const sortAsc = ref(false)
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)

const radioPayload = computed(() => ({
  id: radioId.value,
  name: title.value,
  img: cover.value,
  author: author.value,
  desc: desc.value,
  total: Number(totalText.value) || 0,
  play_count: playCount.value,
  source: source.value
}))

const sortLabel = computed(() => (sortAsc.value ? '发布时间正序' : '发布时间倒序'))

const fetchPrograms = async (reset = false) => {
  if (loading.value || !radioId.value) return
  if (reset) {
    currentPage.value = 1
    programs.value = []
    total.value = 0
    hasMore.value = true
  }
  if (!hasMore.value) return

  loading.value = true
  try {
    const res = await window.api.music.requestSdk('getRadioPrograms', {
      source: source.value,
      radioId: radioId.value,
      page: currentPage.value,
      limit: pageSize,
      asc: sortAsc.value,
      radio: radioPayload.value
    })
    total.value = res?.total || 0
    const list = Array.isArray(res?.list) ? res.list : []
    const mapped = list.map((song: any, index: number) => ({
      ...song,
      songmid: song.songmid,
      albumId: song.albumId || 0,
      id: (currentPage.value - 1) * pageSize + index + 1
    }))

    programs.value = reset ? mapped : [...programs.value, ...mapped]
    currentPage.value += 1
    hasMore.value = programs.value.length < total.value
  } catch (e) {
    console.error('获取电台节目失败:', e)
    MessagePlugin.error('获取电台节目失败')
  } finally {
    loading.value = false
  }
}

const handlePlay = (song: MusicItem) => {
  currentSong.value = song
  isPlaying.value = true
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

const handleAddToPlaylist = (song: MusicItem) => {
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song))
  }
}

const playAll = () => {
  if (!programs.value.length) return
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(programs.value[0]))
    programs.value.slice(1).forEach((song) => {
      ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song))
    })
  }
}

const toggleSort = async () => {
  sortAsc.value = !sortAsc.value
  await fetchPrograms(true)
}

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = target
  if (scrollHeight - scrollTop - clientHeight < 100 && !loading.value && hasMore.value) {
    fetchPrograms(false)
  }
}

watch(
  () => [radioId.value, source.value],
  () => fetchPrograms(true),
  { immediate: true }
)
</script>

<template>
  <div class="radio-detail-page">
    <div class="radio-hero">
      <img class="radio-cover" :src="cover || songCover" :alt="title" />
      <div class="radio-info">
        <div class="radio-type">电台</div>
        <h1>{{ title }}</h1>
        <p class="radio-desc">{{ desc || author || '电台节目' }}</p>
        <div class="radio-meta">
          <span v-if="author">{{ author }}</span>
          <span>{{ totalText }} 期节目</span>
          <span v-if="playCount">{{ playCount }}</span>
        </div>
        <div class="radio-actions">
          <button class="primary" :disabled="!programs.length" @click="playAll">播放全部</button>
          <button class="secondary" @click="toggleSort">{{ sortLabel }}</button>
        </div>
      </div>
    </div>

    <div class="program-section">
      <div class="program-header">
        <span>节目列表</span>
        <span>{{ programs.length }} / {{ total || totalText }}</span>
      </div>
      <SongVirtualList
        v-if="programs.length"
        :songs="programs"
        :current-song="currentSong"
        :is-playing="isPlaying"
        :show-index="true"
        :show-album="false"
        :show-duration="true"
        @play="handlePlay"
        @pause="handlePause"
        @add-to-playlist="handleAddToPlaylist"
        @scroll="handleScroll"
      />
      <div v-else class="empty-state">
        {{ loading ? '节目加载中...' : '暂无节目' }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.radio-detail-page {
  box-sizing: border-box;
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.radio-hero {
  flex-shrink: 0;
  display: flex;
  gap: 20px;
  padding: 18px;
  border-radius: 12px;
  background: var(--find-card-bg);
  box-shadow: var(--find-card-shadow);
}

.radio-cover {
  width: 150px;
  height: 150px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.radio-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.radio-type {
  width: fit-content;
  margin-bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  background: var(--primary-color, #18a058);
}

h1 {
  margin: 0 0 8px;
  font-size: 24px;
  color: var(--find-text-primary);
}

.radio-desc {
  margin: 0 0 10px;
  max-width: 720px;
  line-height: 1.6;
  color: var(--find-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.radio-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--find-text-muted);
}

.radio-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;

  button {
    border: none;
    border-radius: 8px;
    padding: 8px 18px;
    cursor: pointer;
  }

  .primary {
    color: #fff;
    background: var(--primary-color, #18a058);
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary {
    color: var(--find-text-primary);
    background: rgba(255, 255, 255, 0.08);
  }
}

.program-section {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  background: var(--search-content-bg);
  box-shadow: var(--search-content-shadow);
}

.program-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--find-text-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--find-text-muted);
}

@media (max-width: 768px) {
  .radio-hero {
    flex-direction: column;
  }

  .radio-cover {
    width: 120px;
    height: 120px;
  }
}
</style>