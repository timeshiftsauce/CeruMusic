<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, watch, WatchHandle } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import LeaderBord from '@renderer/components/Find/LeaderBord.vue'
import { ChevronDownIcon, PlayCircleIcon } from 'tdesign-icons-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'

interface Playlist {
  id: string
  title: string
  description: string
  cover: string
  playCount: string | number
  author: string
  total: string | number
  time: string
  source: string
}
interface Tag {
  id: string
  name: string
}
interface TagGroup {
  name: string
  list: Tag[]
}
type CacheEntry = {
  list: Playlist[]
  page: number
  total: number
  noMore: boolean
}

const settingsStore = useSettingsStore()
const router = useRouter()
const LocalUserDetail = LocalUserDetailStore()
const { userSource } = storeToRefs(LocalUserDetail)

// 列表数据 - shallowRef:卡片对象不会被改写,深度响应式无收益
const recommendPlaylists = shallowRef<Playlist[]>([])
const loading = ref(true)
const error = ref('')

// 标签数据
const tags = ref<TagGroup[]>([])
const hotTag = ref<Tag[]>([])
const activeCategoryName = ref<string>('热门')
const activeTagId = ref<string>('')
const activeGroupName = ref<string>('')

// 分页
const page = ref<number>(1)
const limit = ref<number>(30)
const total = ref<number>(0)
const loadingMore = ref<boolean>(false)
const noMore = ref<boolean>(false)

// 跨分类缓存(key 含 source,音源切换不会撞车)
const categoryCache = new Map<string, CacheEntry>()
const showMore = ref<boolean>(false)

let watchSource: WatchHandle | null = null

const cacheKey = computed(() => `${userSource.value.source || 'wy'}::${activeTagId.value || 'hot'}`)

const activeGroup = computed(
  () => tags.value.find((g) => g.name === activeGroupName.value) || tags.value[0]
)

const mapItem = (item: any): Playlist => ({
  id: item.id,
  title: item.name,
  description: item.desc || '精选歌单',
  cover: item.img,
  playCount: item.play_count,
  author: item.author,
  total: item.total,
  time: item.time,
  source: item.source
})

const fetchTags = async (): Promise<void> => {
  try {
    const res = await window.api.music.requestSdk('getPlaylistTags', {
      source: userSource.value.source || 'wy'
    })
    tags.value = res?.tags || []
    hotTag.value = res?.hotTag || []
    if (!activeGroupName.value) activeGroupName.value = tags.value[0]?.name || ''
  } catch (e) {
    console.error('获取歌单标签失败:', e)
  }
}

const fetchCategoryPlaylists = async (reset = false): Promise<void> => {
  if (loadingMore.value) return
  if (reset) {
    page.value = 1
    noMore.value = false
    error.value = ''
    // 命中缓存
    const cached = categoryCache.get(cacheKey.value)
    if (cached) {
      recommendPlaylists.value = cached.list
      page.value = cached.page
      total.value = cached.total
      noMore.value = cached.noMore
      loading.value = false
      return
    }
    loading.value = true
    recommendPlaylists.value = []
  }
  loadingMore.value = true
  try {
    const res = await window.api.music.requestSdk('getCategoryPlaylists', {
      source: userSource.value.source || 'wy',
      sortId: 'hot',
      tagId: activeTagId.value,
      page: page.value,
      limit: limit.value
    })
    const rawList = Array.isArray(res?.list) ? res.list : []
    const mapped: Playlist[] = rawList.map(mapItem)
    total.value = res?.total || 0
    recommendPlaylists.value = reset ? mapped : [...recommendPlaylists.value, ...mapped]

    const loadedCount = recommendPlaylists.value.length
    noMore.value = loadedCount >= total.value || mapped.length === 0
    if (!noMore.value) page.value += 1

    categoryCache.set(cacheKey.value, {
      list: recommendPlaylists.value.slice(),
      page: page.value,
      total: total.value,
      noMore: noMore.value
    })
    error.value = ''
  } catch (e) {
    console.error('获取分类歌单失败:', e)
    if (!recommendPlaylists.value.length) error.value = '获取分类歌单失败,请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const onSelectTag = (tagId: string, name: string): void => {
  if (activeTagId.value === tagId) return
  activeTagId.value = tagId
  activeCategoryName.value = name
  showMore.value = false
  fetchCategoryPlaylists(true)
}

// 滚动加载更多 - rAF 节流
let scrollFrame = 0
const onScroll = (e: Event): void => {
  if (scrollFrame) return
  const el = e.target as HTMLElement
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      if (!noMore.value && !loadingMore.value) fetchCategoryPlaylists(false)
    }
  })
}

const playPlaylist = (playlist: Playlist): void => {
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

const onDocClick = (e: MouseEvent): void => {
  const target = e.target as HTMLElement
  if (!target.closest('.category-bar') && showMore.value) showMore.value = false
}

onMounted(() => {
  watchSource = watch(
    userSource,
    () => {
      tags.value = []
      activeGroupName.value = ''
      activeTagId.value = ''
      activeCategoryName.value = '热门'
      fetchTags().then(() => fetchCategoryPlaylists(true))
    },
    { deep: true, immediate: true }
  )
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  if (watchSource) {
    watchSource()
    watchSource = null
  }
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = 0
  }
  document.removeEventListener('click', onDocClick)
})

// keep-alive 滚动位置保持
const backTop = ref(false)
const scrollTop = ref(0)
const songlistScrollRef = ref<HTMLDivElement>()
onActivated(() => {
  backTop.value = true
  if (songlistScrollRef.value) songlistScrollRef.value.scrollTop = scrollTop.value
})
onDeactivated(() => {
  backTop.value = false
  if (songlistScrollRef.value) scrollTop.value = songlistScrollRef.value.scrollTop
})
</script>

<template>
  <div id="findContainerRef" class="find-container">
    <header class="page-header">
      <h2>发现音乐</h2>
      <p>探索最新最热的音乐内容</p>
    </header>

    <n-tabs type="segment" animated class="find-tabs" default-value="songlist" size="small">
      <n-tab-pane name="songlist" tab="歌单" class="songlist-tab-pane">
        <div ref="songlistScrollRef" class="scroll-container" @scroll.passive="onScroll">
          <n-back-top
            v-if="backTop"
            :listen-to="songlistScrollRef"
            :right="40"
            :bottom="120"
            style="z-index: 100"
          />

          <!-- 分类导航 -->
          <div class="category-bar">
            <div class="hot-tags">
              <button
                class="tag-chip"
                :class="{ active: activeTagId === '' }"
                @click="onSelectTag('', '热门')"
              >
                热门
              </button>
              <button
                v-for="t in hotTag"
                :key="t.id"
                class="tag-chip"
                :class="{ active: activeTagId === t.id }"
                @click="onSelectTag(t.id, t.name)"
              >
                {{ t.name }}
              </button>

              <div
                class="more-category-wrapper"
                @mouseenter="showMore = true"
                @mouseleave="showMore = false"
              >
                <t-button class="tag-chip more" shape="round" variant="outline">
                  更多分类
                  <template #suffix>
                    <ChevronDownIcon class="chevron" :class="{ rotate: showMore }" />
                  </template>
                </t-button>

                <transition name="dropdown">
                  <div v-if="showMore" class="more-panel">
                    <div class="panel-inner">
                      <t-tabs v-model:value="activeGroupName" size="medium">
                        <t-tab-panel
                          v-for="group in tags"
                          :key="group.name"
                          :value="group.name"
                          :label="group.name"
                        />
                      </t-tabs>
                      <div v-if="activeGroup" class="panel-tags">
                        <button
                          v-for="t in activeGroup.list"
                          :key="t.id"
                          class="tag-chip"
                          :class="{ active: activeTagId === t.id }"
                          @click="onSelectTag(t.id, t.name)"
                        >
                          {{ t.name }}
                        </button>
                      </div>
                    </div>
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <section class="section">
            <h3 class="section-title">{{ activeCategoryName }}歌单</h3>

            <!-- 错误 -->
            <div v-if="error && !recommendPlaylists.length" class="state-container">
              <div class="error-state">
                <p class="state-text">{{ error }}</p>
                <t-button theme="primary" size="medium" @click="fetchCategoryPlaylists(true)">
                  重新加载
                </t-button>
              </div>
            </div>

            <!-- 骨架 -->
            <div v-else-if="loading && !recommendPlaylists.length" class="playlist-grid">
              <div v-for="n in 12" :key="`sk-${n}`" class="playlist-card skeleton-card">
                <div class="playlist-cover">
                  <div class="skeleton-block"></div>
                </div>
                <div class="playlist-info">
                  <n-skeleton text :repeat="2" />
                  <n-skeleton text style="width: 50%; margin-top: 6px" />
                </div>
              </div>
            </div>

            <!-- 列表 -->
            <div v-else-if="recommendPlaylists.length" class="playlist-grid">
              <article
                v-for="playlist in recommendPlaylists"
                :key="`${playlist.source || ''}-${playlist.id}`"
                class="playlist-card"
                :class="{ 'custom-bg': settingsStore.settings.globalBackground?.enable }"
                :style="{ '--cover-url': `url('${playlist.cover}')` }"
                @click="playPlaylist(playlist)"
              >
                <div class="playlist-cover">
                  <s-image :src="playlist.cover" class="playlist-cover-image" />
                  <span v-if="userSource.source === 'all' && playlist.source" class="source-badge">
                    {{ playlist.source }}
                  </span>
                  <div class="cover-overlay">
                    <PlayCircleIcon class="play-icon" />
                  </div>
                </div>
                <div class="playlist-info">
                  <h4 class="playlist-title">{{ playlist.title }}</h4>
                  <p class="playlist-desc">{{ playlist.description }}</p>
                  <div class="playlist-meta">
                    <span class="play-count">
                      <i class="iconfont icon-bofang"></i>
                      {{ playlist.playCount }}
                    </span>
                    <span v-if="playlist.total" class="song-count">{{ playlist.total }}首</span>
                  </div>
                </div>
              </article>
            </div>

            <!-- 空 -->
            <div v-else-if="!loading" class="state-container">
              <div class="empty-state">
                <p class="state-text">该分类暂无歌单</p>
              </div>
            </div>

            <!-- 加载/到底 -->
            <div v-if="loadingMore && recommendPlaylists.length > 0" class="load-status">
              <t-loading size="small" text="加载更多..." />
            </div>
            <div v-else-if="noMore && recommendPlaylists.length > 0" class="load-status">
              <span class="no-more">— 已经到底啦 —</span>
            </div>
          </section>
        </div>
      </n-tab-pane>

      <n-tab-pane name="leaderboard" tab="排行榜" class="find-tab-pane">
        <leader-bord ref="leaderboardRef" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style lang="scss" scoped>
.find-container {
  padding-top: 1rem;
  padding-bottom: 0;
  width: 100%;
  height: 100%;
  overflow-y: hidden;
  margin: 0 auto;
  display: flex;
  flex-direction: column;

  :deep(.find-tabs) {
    flex: 1;
    overflow: hidden;
    & > *,
    .find-tab-pane {
      padding: 0 2rem;
    }
    .n-tabs-nav {
      margin-bottom: 1rem;
    }
    .n-tabs-pane-wrapper {
      padding: 0;
      .find-tab-pane {
        height: 100%;
        overflow-y: auto;
      }
      .songlist-tab-pane {
        height: 100%;
        overflow: hidden;
        padding: 0 !important;
      }
    }
  }
}

.page-header {
  margin: 0 2rem 1rem;

  h2 {
    border-left: 8px solid var(--td-brand-color-3);
    padding-left: 12px;
    border-radius: 8px;
    line-height: 1.5em;
    color: var(--td-text-color-primary);
    margin-bottom: 0.5rem;
    font-size: 1.875rem;
    font-weight: 600;
  }

  p {
    color: var(--find-text-secondary);
    font-size: 0.85rem;
  }
}

.scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 0 2rem;
}

/* ======= 分类栏 ======= */
.category-bar {
  position: relative;
  margin-bottom: 1rem;

  .hot-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .tag-chip {
    padding: 5px 14px;
    border-radius: 999px;
    border: none;
    background: transparent;
    color: var(--td-text-color-secondary);
    cursor: pointer;
    font-size: 13px;
    line-height: 1.4;
    transition:
      color 0.2s ease,
      background-color 0.2s ease;
    white-space: nowrap;

    &:hover {
      color: var(--td-text-color-primary);
      background: var(--td-bg-color-secondarycontainer);
    }

    &.active {
      background: var(--td-brand-color-light);
      color: var(--td-brand-color);
      font-weight: 600;
    }

    &.more {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--td-bg-color-secondarycontainer);

      &:hover {
        background: var(--td-bg-color-component-hover);
      }

      .chevron {
        font-size: 13px;
        transition: transform 0.2s ease;
        &.rotate {
          transform: rotate(180deg);
        }
      }
    }
  }

  .more-category-wrapper {
    position: static;
    display: inline-block;
  }

  .more-panel {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    padding-top: 8px;
    transform-origin: top center;

    .panel-inner {
      background: var(--td-bg-color-container);
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--td-border-level-1-color);
      padding: 8px 16px 16px;
    }
  }

  .panel-tags {
    display: flex;
    flex-wrap: wrap;
    padding-top: 12px;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
  }
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.18s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

/* ======= 主体 ======= */
.section {
  margin-bottom: 3rem;

  .section-title {
    color: var(--td-text-color-primary);
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.25rem;
  }
}

.state-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
  text-align: center;

  .state-text {
    color: var(--find-text-secondary);
    margin-bottom: 1rem;
  }
}

.load-status {
  display: flex;
  justify-content: center;
  padding: 16px 0;
  .no-more {
    font-size: 12px;
    color: var(--find-text-muted);
    letter-spacing: 0.5px;
  }
}

/* ======= 网格 ======= */
.playlist-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));

  @media (max-width: 480px) {
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
  @media (min-width: 481px) and (max-width: 768px) {
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }
  @media (min-width: 769px) and (max-width: 1024px) {
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  }
  @media (min-width: 1200px) {
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  }
}

/* ======= 卡片 ======= */
.playlist-card {
  position: relative;
  background: var(--find-card-bg);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 4px 16px rgba(0, 0, 0, 0.04);
  transition:
    transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s ease;

  &.custom-bg {
    background-color: var(--td-bg-color-component);
    backdrop-filter: blur(8px);

    .playlist-info {
      background-color: rgba(var(--td-bg-color-container-rgb), 0.2);
      backdrop-filter: blur(4px);
    }
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow:
      0 6px 24px rgba(0, 0, 0, 0.12),
      var(--find-card-shadow-hover);

    .playlist-cover-image {
      transform: scale(1.06);
    }
    .cover-overlay {
      opacity: 1;
    }
    .playlist-info::before {
      opacity: 1;
    }
    .playlist-info {
      color: #fff;
      .playlist-title,
      .playlist-desc,
      .playlist-meta,
      .playlist-meta * {
        color: #fff;
      }
      .song-count {
        background: rgba(255, 255, 255, 0.16);
      }
    }
  }

  &:active {
    transform: translateY(-1px);
  }
}

.playlist-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--td-bg-color-secondarycontainer);

  .playlist-cover-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    user-select: none;
    -webkit-user-drag: none;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .source-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(10px) saturate(160%);
    -webkit-backdrop-filter: blur(10px) saturate(160%);
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    pointer-events: none;
  }

  .cover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      transparent 45%,
      rgba(0, 0, 0, 0.18) 75%,
      rgba(0, 0, 0, 0.5) 100%
    );
    opacity: 0;
    transition: opacity 0.25s ease;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 12px;
    pointer-events: none;
    z-index: 1;

    .play-icon {
      font-size: 36px;
      color: #fff;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
      transform: translateY(4px);
      transition: transform 0.25s ease;
    }
  }
}

.playlist-card:hover .cover-overlay .play-icon {
  transform: translateY(0);
}

.playlist-info {
  position: relative;
  padding: 14px 14px 16px;
  background: var(--find-card-info-bg);
  transition: color 0.3s ease;
  z-index: 0;

  // GPU-only "themed" hover backdrop using cover image
  // 默认不挂 filter/transform,避免每张卡都建立合成层;只在 hover 时启用
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--cover-url);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    filter: blur(40px) brightness(0.55) saturate(1.6);
    transform: scale(1.6);
    opacity: 0;
    transition: opacity 0.35s ease;
    z-index: -1;
    pointer-events: none;
  }

  .playlist-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--find-text-primary);
    margin-bottom: 0.4rem;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 2.8rem;
    transition: color 0.3s ease;
  }

  .playlist-desc {
    font-size: 0.82rem;
    color: var(--find-text-secondary);
    margin-bottom: 0.65rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.5rem;
    transition: color 0.3s ease;
  }

  .playlist-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--find-meta-border);
    transition:
      color 0.3s ease,
      border-color 0.3s ease;
  }

  .play-count {
    font-size: 0.75rem;
    color: var(--find-text-muted);
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 500;
    transition: color 0.3s ease;

    .iconfont {
      font-size: 0.875rem;
      opacity: 0.85;
    }
  }

  .song-count {
    font-size: 0.72rem;
    color: var(--find-text-muted);
    font-weight: 500;
    background: var(--find-song-count-bg);
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    transition:
      color 0.3s ease,
      background-color 0.3s ease;
  }
}

/* ======= 骨架 ======= */
.skeleton-card {
  cursor: default;
  pointer-events: none;
  // 骨架不参与 hover 阴影抬升
  &:hover {
    transform: none;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 4px 16px rgba(0, 0, 0, 0.04);
  }

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
  }
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
</style>
