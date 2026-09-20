<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted, watch, WatchHandle } from 'vue'
import { useRouter } from 'vue-router'
import type { ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import { openPluginPlaylist } from '@renderer/services/pluginPlaybackBridge'
import { MessagePlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import LeaderBord from '@renderer/components/Find/LeaderBord.vue'
import PluginSurface from '@renderer/components/PluginSurface.vue'
import { ChevronDownIcon } from 'tdesign-icons-vue-next'
import PlaylistGrid from '@renderer/components/Music/PlaylistGrid.vue'
import { tryShowListenTogetherInvite } from '@renderer/services/listenTogetherInvite'
import {
  homeSections,
  pluginRestorationComplete,
  contributionsLoaded,
  contributionsRevision
} from '@renderer/services/pluginState'

interface Playlist {
  pluginResource?: ResourceRef
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

const playlistSection = computed(() =>
  homeSections.value.find((section) => section.kind === 'playlists')
)
const chartSection = computed(() => homeSections.value.find((section) => section.kind === 'charts'))
const customSections = computed(() =>
  homeSections.value
    .filter((section) => section.kind === 'custom' && section.view)
    .map((section) => ({ ...section, key: `${section.pluginId}:${section.id}` }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
)
const homeTab = ref('')
watch(
  [customSections, playlistSection, chartSection],
  ([tabs, playlists, charts]) => {
    const keys = [
      ...tabs.map((tab) => tab.key),
      ...(playlists ? ['songlist'] : []),
      ...(charts ? ['leaderboard'] : [])
    ]
    if (!keys.includes(homeTab.value)) homeTab.value = keys[0] || ''
  },
  { immediate: true }
)
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
let catalogGeneration = 0
let listRequest = 0

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
  source: item.source,
  pluginResource: item.pluginResource
})

const fetchTags = async (): Promise<void> => {
  if (!contributionsLoaded.value || !playlistSection.value || !userSource.value.source) return
  const generation = catalogGeneration
  try {
    const res = await window.api.music.requestSdk('getPlaylistTags', {
      source: userSource.value.source
    })
    if (generation !== catalogGeneration) return
    if (res?.error) throw new Error(res.error)
    tags.value = res?.tags || []
    hotTag.value = res?.hotTag || []
    if (!activeGroupName.value) activeGroupName.value = tags.value[0]?.name || ''
  } catch (e) {
    console.error('获取歌单标签失败:', e)
  }
}

const fetchCategoryPlaylists = async (reset = false): Promise<void> => {
  if (!contributionsLoaded.value || !playlistSection.value || !userSource.value.source) {
    loading.value = false
    return
  }
  if (loadingMore.value && !reset) return
  const request = ++listRequest
  const key = cacheKey.value
  if (reset) {
    page.value = 1
    noMore.value = false
    error.value = ''
    // 命中缓存
    const cached = categoryCache.get(key)
    if (cached) {
      recommendPlaylists.value = cached.list
      page.value = cached.page
      total.value = cached.total
      noMore.value = cached.noMore
      loading.value = false
      loadingMore.value = false
      return
    }
    loading.value = true
    recommendPlaylists.value = []
  }
  loadingMore.value = true
  try {
    const res = await window.api.music.requestSdk('getCategoryPlaylists', {
      source: userSource.value.source,
      sortId: 'hot',
      tagId: activeTagId.value,
      page: page.value,
      limit: limit.value
    })
    if (request !== listRequest) return
    if (res?.error) throw new Error(res.error)
    const rawList = Array.isArray(res?.list) ? res.list : []
    const mapped: Playlist[] = rawList.map(mapItem)
    total.value = res?.total || 0
    recommendPlaylists.value = reset ? mapped : [...recommendPlaylists.value, ...mapped]

    const loadedCount = recommendPlaylists.value.length
    noMore.value = loadedCount >= total.value || mapped.length === 0
    if (!noMore.value) page.value += 1

    categoryCache.set(key, {
      list: recommendPlaylists.value.slice(),
      page: page.value,
      total: total.value,
      noMore: noMore.value
    })
    error.value = ''
  } catch (e) {
    if (request !== listRequest) return
    console.error('获取分类歌单失败:', e)
    if (!recommendPlaylists.value.length) error.value = '获取分类歌单失败,请稍后重试'
  } finally {
    if (request === listRequest) {
      loading.value = false
      loadingMore.value = false
    }
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
  if (playlist.pluginResource) {
    void openPluginPlaylist(router, playlist.pluginResource, {
      title: playlist.title,
      author: playlist.author,
      cover: playlist.cover,
      total: playlist.total,
      description: playlist.description
    }).catch((error) => MessagePlugin.error(error instanceof Error ? error.message : String(error)))
    return
  }
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
    [() => userSource.value.source, playlistSection, contributionsLoaded, contributionsRevision],
    () => {
      catalogGeneration++
      listRequest++
      categoryCache.clear()
      loadingMore.value = false
      recommendPlaylists.value = []
      tags.value = []
      hotTag.value = []
      activeGroupName.value = ''
      activeTagId.value = ''
      activeCategoryName.value = '热门'
      if (!contributionsLoaded.value || !playlistSection.value) {
        loading.value = !contributionsLoaded.value
        return
      }
      void fetchTags()
      void fetchCategoryPlaylists(true)
    },
    { immediate: true }
  )
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => {
  catalogGeneration++
  listRequest++
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
  // 切回发现页时再扫一次剪贴板,覆盖"用户复制完文案再回到发现页"的场景
  void tryShowListenTogetherInvite('clipboard')
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

    <div
      v-if="!homeSections.length && !pluginRestorationComplete"
      class="home-restoring"
      role="status"
      aria-live="polite"
    >
      <t-loading size="28px" />
      <p>正在加载首页内容…</p>
    </div>
    <t-empty
      v-else-if="!homeSections.length"
      description="使用提供首页的插件后，可浏览歌单和排行榜。"
    />
    <n-tabs v-else type="segment" animated class="find-tabs" v-model:value="homeTab" size="small">
      <n-tab-pane
        v-for="tab in customSections"
        :key="tab.key"
        :name="tab.key"
        :tab="tab.title"
        class="find-tab-pane plugin-tab-pane"
      >
        <PluginSurface
          v-if="homeTab === tab.key"
          :plugin-id="tab.pluginId"
          :surface-id="tab.view"
        />
      </n-tab-pane>
      <n-tab-pane
        v-if="playlistSection"
        name="songlist"
        :tab="playlistSection.title"
        class="songlist-tab-pane"
      >
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
            <PlaylistGrid
              v-else-if="recommendPlaylists.length"
              :items="recommendPlaylists"
              :show-source="userSource.source === 'all'"
              @open="(index) => playPlaylist(recommendPlaylists[index])"
            />

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

      <n-tab-pane
        v-if="chartSection"
        name="leaderboard"
        :tab="chartSection.title"
        class="find-tab-pane"
      >
        <leader-bord ref="leaderboardRef" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style lang="scss" scoped>
@use '@renderer/components/Music/playlistGrid.scss';
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
    min-height: 0;
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
      flex: 1;
      min-height: 0;
      .find-tab-pane {
        height: 100%;
        overflow-y: auto;
      }
      .songlist-tab-pane {
        height: 100%;
        overflow: hidden;
        padding: 0 !important;
      }
      .plugin-tab-pane {
        min-height: 0;
        overflow: hidden;
      }
    }
  }
}

.page-header {
  flex-shrink: 0;
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

.home-restoring {
  flex: 1;
  min-height: 0;
  margin: 0 2rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 12px;
  background: var(--td-bg-color-container-hover);
  color: var(--td-text-color-secondary);
  p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
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
