<script setup lang="ts">
import { ref, onMounted, watch, WatchHandle, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import { extractDominantColor } from '../../utils/color/colorExtractor'
import LeaderBord from '@renderer/components/Find/LeaderBord.vue'
import { ChevronDownIcon } from 'tdesign-icons-vue-next'

// 路由实例
const router = useRouter()

// 推荐/分类歌单数据
const recommendPlaylists: any = ref([])
const loading = ref(true)
const error = ref('')
const mainColors = ref<any[]>([])
const textColors = ref<string[]>([])

let watchSource: WatchHandle | null = null

// 分类导航与分页状态
const tags = ref<any[]>([])
const hotTag = ref<any[]>([])
const activeCategoryName = ref<string>('热门')
const activeTagId = ref<string>('')
const page = ref<number>(1)
const limit = ref<number>(30)
const total = ref<number>(0)
const loadingMore = ref<boolean>(false)
const noMore = ref<boolean>(false)
const scrollLock = ref<boolean>(false)
const categoryCache: Record<string, { list: any[]; page: number; total: number }> = {}
const showMore = ref<boolean>(false)
const activeGroupIndex = ref<number>(0)
const activeGroupName = ref<string>('')

// 获取分类标签
const fetchTags = async () => {
  try {
    const res = await window.api.music.requestSdk('getPlaylistTags', {
      source: userSource.value.source
    })
    tags.value = res?.tags || []
    hotTag.value = res?.hotTag || []
    activeGroupIndex.value = 0
    activeGroupName.value = tags.value[0]?.name || ''
  } catch (e) {
    console.error('获取歌单标签失败:', e)
    loading.value = false
    error.value = '获取分类歌单失败，请稍后重试'
  }
}

// 根据分类获取歌单
const fetchCategoryPlaylists = async (reset = false) => {
  if (scrollLock.value || loadingMore.value) return
  if (reset) {
    page.value = 1
    noMore.value = false
    loading.value = true
    recommendPlaylists.value = []
  }
  // 缓存命中
  const cacheKey = activeTagId.value || 'hot' + ':' + userSource.value.source
  if (reset && categoryCache[cacheKey]) {
    const cache = categoryCache[cacheKey]
    recommendPlaylists.value = cache.list
    page.value = cache.page
    total.value = cache.total
    mainColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#FFF')
    textColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#000')

    // 异步获取每个封面的主题色和对应的文字颜色

    const colorPromises = recommendPlaylists.value.map(async (item: any, index: number) => {
      try {
        const color = await extractDominantColor(item.cover)
        // const textColor = await getBestContrastTextColor(item.cover)
        return { index, color }
      } catch (error) {
        console.warn(`获取封面主题色失败 (索引 ${index}):`, error)
        textColors.value[index] = '#000'
        return { index, color: '#fff' }
      }
    })

    // 等待所有颜色提取完成
    const results = await Promise.all(colorPromises)

    // 更新主题色和文字颜色数组
    results.forEach(({ index, color }) => {
      if (index < mainColors.value.length) {
        // 深化颜色值，让颜色更深邃
        const deepR = Math.floor(color.r * 0.7)
        const deepG = Math.floor(color.g * 0.7)
        const deepB = Math.floor(color.b * 0.7)
        mainColors.value[index] = `rgba(${deepR}, ${deepG}, ${deepB}, 0.85)`
        // textColors.value[index] = textColor
      }
    })
    return
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
    const list = Array.isArray(res?.list) ? res.list : []
    total.value = res?.total || 0
    const mapped = list.map((item: any) => ({
      id: item.id,
      title: item.name,
      description: item.desc || '精选歌单',
      cover: item.img,
      playCount: item.play_count,
      author: item.author,
      total: item.total,
      time: item.time,
      source: item.source
    }))
    recommendPlaylists.value = reset ? mapped : [...recommendPlaylists.value, ...mapped]
    // 更新颜色占位
    mainColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#FFF')
    textColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#000')

    const colorPromises = recommendPlaylists.value.map(async (item: any, index: number) => {
      try {
        const color = await extractDominantColor(item.cover)
        // const textColor = await getBestContrastTextColor(item.cover)
        return { index, color }
      } catch (error) {
        console.warn(`获取封面主题色失败 (索引 ${index}):`, error)
        textColors.value[index] = '#000'
        return { index, color: '#fff' }
      }
    })

    // 等待所有颜色提取完成
    const results = await Promise.all(colorPromises)

    // 更新主题色和文字颜色数组
    results.forEach(({ index, color }) => {
      if (index < mainColors.value.length) {
        // 深化颜色值，让颜色更深邃
        const deepR = Math.floor(color.r * 0.7)
        const deepG = Math.floor(color.g * 0.7)
        const deepB = Math.floor(color.b * 0.7)
        mainColors.value[index] = `rgba(${deepR}, ${deepG}, ${deepB}, 0.85)`
        textColors.value[index] = '#fff'
      }
    })
    // 更新分页与状态
    const loadedCount = recommendPlaylists.value.length
    noMore.value = loadedCount >= total.value
    // fix
    if (!noMore.value) page.value += 1
    // 写入缓存
    categoryCache[cacheKey] = {
      list: recommendPlaylists.value.slice(),
      page: page.value,
      total: total.value
    }
    error.value = ''
  } catch (e) {
    console.error('获取分类歌单失败:', e)
    loading.value = false
    error.value = '获取分类歌单失败，请稍后重试'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// 切换分类标签
const onSelectTag = async (tagId: string, name: string) => {
  activeTagId.value = tagId
  activeCategoryName.value = name
  showMore.value = false
  await fetchCategoryPlaylists(true)
}

const onScroll = (e: Event) => {
  const el = e.target as HTMLElement
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  if (nearBottom && !noMore.value && !loadingMore.value) {
    fetchCategoryPlaylists(false)
  }
}

watch(activeGroupName, (name) => {
  const idx = tags.value.findIndex((g: any) => g.name === name)
  activeGroupIndex.value = idx >= 0 ? idx : 0
})

const playPlaylist = (playlist: any): void => {
  // 跳转到歌曲列表页面，传递歌单ID和其他必要信息
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

// 获取 store 实例和响应式引用
const LocalUserDetail = LocalUserDetailStore()
const { userSource } = storeToRefs(LocalUserDetail)

// 组件挂载时获取数据
onMounted(() => {
  // 设置音源变化监听器
  watchSource = watch(
    userSource,
    (newSource) => {
      if (newSource.source) {
        loading.value = true
        error.value = ''
        // 初始化分类
        fetchTags().then(() => {
          // 默认热门分类
          activeTagId.value = ''
          activeCategoryName.value = '热门'
          fetchCategoryPlaylists(true)
        })
      }
    },
    { deep: true, immediate: true }
  )
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.category-bar') && showMore.value) showMore.value = false
  }
  document.addEventListener('click', onDocClick)
  onUnmounted(() => {
    document.removeEventListener('click', onDocClick)
  })
})
onUnmounted(() => {
  if (watchSource) {
    watchSource()
    watchSource = null
  }
})
const songlistScrollRef = ref<HTMLDivElement>()
</script>

<template>
  <div class="find-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>发现音乐</h2>
      <p>探索最新最热的音乐内容</p>
    </div>
    <n-tabs type="segment" animated class="find-tabs" default-value="songlist" size="small">
      <n-tab-pane name="songlist" tab="歌单" class="songlist-tab-pane">
        <div class="scroll-container" @scroll="onScroll" ref="songlistScrollRef">
          <!-- 分类导航 -->
          <n-back-top :listen-to="songlistScrollRef" :right="40" :bottom="120"> </n-back-top>

          <div ref="categoryBarRef" class="category-bar">
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
                <t-button ref="moreBtnRef" class="tag-chip more" shape="round" variant="outline">
                  更多分类
                  <template #suffix>
                    <i class="iconfont icon-arrow-down" :class="{ rotate: showMore }">
                      <ChevronDownIcon />
                    </i>
                  </template>
                </t-button>

                <transition name="dropdown">
                  <div v-if="showMore" class="more-panel">
                    <div class="panel-inner">
                      <div class="panel-content">
                        <t-tabs v-model:value="activeGroupName" size="medium">
                          <t-tab-panel
                            v-for="group in tags"
                            :key="group.name"
                            :value="group.name"
                            :label="group.name"
                          />
                        </t-tabs>
                        <div v-if="tags[activeGroupIndex]" class="panel-tags">
                          <button
                            v-for="t in tags[activeGroupIndex].list"
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
                  </div>
                </transition>
              </div>
            </div>
          </div>

          <!-- 分类歌单 -->
          <div class="section">
            <h3 class="section-title">{{ activeCategoryName }}歌单</h3>

            <!-- 加载状态 -->
            <div v-if="loading && recommendPlaylists.length === 0" class="loading-container">
              <t-loading size="large" text="正在加载歌单..." />
            </div>

            <!-- 错误状态 -->
            <div v-else-if="error" class="error-container">
              <t-alert theme="error" :message="error" />
              <t-button
                theme="primary"
                style="margin-top: 1rem"
                @click="fetchCategoryPlaylists(true)"
              >
                重新加载
              </t-button>
            </div>

            <!-- 歌单列表 -->
            <div v-else class="playlist-grid">
              <div
                v-for="(playlist, index) in recommendPlaylists"
                :key="playlist.id"
                class="playlist-card"
                @click="playPlaylist(playlist)"
              >
                <div class="playlist-cover">
                  <s-image :src="playlist.cover" class="playlist-cover-image" />
                </div>
                <div
                  class="playlist-info"
                  :style="{
                    '--hover-bg-color': mainColors[index],
                    '--hover-text-color': textColors[index]
                  }"
                >
                  <h4 class="playlist-title">
                    {{ playlist.title }}
                  </h4>
                  <p class="playlist-desc">
                    {{ playlist.description }}
                  </p>
                  <div class="playlist-meta">
                    <span class="play-count">
                      <i class="iconfont icon-bofang"></i>
                      {{ playlist.playCount }}
                    </span>
                    <span v-if="playlist.total" class="song-count">{{ playlist.total }}首</span>
                  </div>
                  <!-- <div class="playlist-author">by {{ playlist.author }}</div> -->
                </div>
              </div>
            </div>
            <div v-if="loadingMore && recommendPlaylists.length > 0" class="load-status">
              <t-loading size="small" text="加载更多..." />
            </div>
            <div v-else-if="noMore && recommendPlaylists.length > 0" class="load-status">
              <span class="no-more">没有更多内容</span>
            </div>
          </div>
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
    // padding: 0 2rem;
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
      padding: 0rem;
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

.scroll-container {
  height: 100%;
  overflow-y: auto;
  padding: 0 2rem;
}

.category-bar {
  margin-bottom: 1rem;
  position: relative;
  // position: sticky;
  // top: 0;
  // z-index: 2;
  // padding: 6px;
  // background: var(--find-card-bg);

  .hot-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .more-category-wrapper {
    position: static;
    display: inline-block;

    .more-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 100;
      padding-top: 8px; /* Use padding instead of margin to bridge the gap */
      margin-top: 0;
      width: 100%;
      min-width: unset;
      transform-origin: top center;

      /* Inner container for actual visual style */
      .panel-inner {
        background: var(--td-bg-color-container);
        border-radius: 12px;
        box-shadow: 0 6px 30px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--td-border-level-1-color);
        padding: 8px 16px 16px;
      }
    }
  }

  .tag-chip {
    padding: 4px 12px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--td-text-color-secondary);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;

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
      display: flex;
      align-items: center;
      gap: 4px;
      background: var(--td-bg-color-secondarycontainer);
      // color: var(--td-text-color-primary);

      &:hover {
        background: var(--td-bg-color-component-hover);
      }

      .icon-arrow-down {
        font-size: 12px;
        transition: transform 0.2s;
        &.rotate {
          transform: rotate(180deg);
        }
      }
    }
  }

  .panel-tags {
    display: flex;
    flex-wrap: wrap;
    padding-top: 12px;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }
}

/* 下拉淡入缩放动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.16s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.dropdown-enter-to,
.dropdown-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
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

.section {
  margin-bottom: 3rem;

  .section-title {
    color: var(--td-text-color-primary);
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4rem 0;
}

.load-status {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  .no-more {
    font-size: 12px;
    color: var(--find-text-muted);
  }
}

.error-container {
  text-align: center;
  padding: 2rem;
}

.playlist-grid {
  display: grid;
  gap: 1.25rem;

  // 响应式grid列数
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));

  // 响应式断点优化
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

.playlist-card {
  // 卡片样式
  background: var(--find-card-bg);
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: var(--find-card-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;

  // 现代化悬浮效果
  &:hover {
    transform: translateY(-4px) scale(1.02);
    box-shadow: var(--find-card-shadow-hover);

    .playlist-cover::after {
      opacity: 1;
    }

    .playlist-info {
      backdrop-filter: blur(8px);
      background-color: var(--hover-bg-color);
      color: var(--find-text-primary);
      .playlist-title {
        color: var(--hover-text-color);
      }
      .playlist-desc {
        color: var(--hover-text-color);
      }
      .playlist-meta {
        color: var(--hover-text-color);
        * {
          color: var(--hover-text-color);
        }
      }
      .playlist-author {
        color: var(--hover-text-color);
      }
    }
  }

  // 活跃状态
  &:active {
    transform: translateY(-2px) scale(1.01);
  }

  .playlist-cover {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;

    // 悬浮遮罩层
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.3) 100%);
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .playlist-cover-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      user-select: none;
      -webkit-user-drag: none;
      transition: transform 0.3s ease;
    }

    // 图片悬浮缩放效果
    &:hover .playlist-cover-image {
      transform: scale(1.05);
    }
  }

  .playlist-info {
    padding: 1.25rem 1rem;
    position: relative;
    background: var(--find-card-info-bg);

    backdrop-filter: blur(4px);
    transition: all 0.3s ease;

    .playlist-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--find-text-primary);
      margin-bottom: 0.5rem;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      min-height: 2.8rem; // 确保标题区域高度一致
    }

    .playlist-desc {
      font-size: 0.875rem;
      color: var(--find-text-secondary);
      margin-bottom: 0.75rem;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 2.625rem; // 确保描述区域高度一致
      transition: color 0.3s ease;
    }

    .playlist-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: auto; // 推到底部
      padding-top: 0.5rem;
      border-top: 1px solid var(--find-meta-border);
      transition: color 0.3s ease;
    }

    .play-count {
      font-size: 0.75rem;
      color: var(--find-text-muted);
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-weight: 500;
      transition: color 0.3s ease;

      .iconfont {
        font-size: 0.875rem;
        opacity: 0.8;
      }
    }

    .song-count {
      font-size: 0.75rem;
      color: var(--find-text-muted);
      font-weight: 500;
      background: var(--find-song-count-bg);
      padding: 0.125rem 0.5rem;
      border-radius: 0.375rem;
      transition: color 0.3s ease;
    }

    .playlist-author {
      font-size: 0.75rem;
      color: var(--find-text-secondary);
      font-style: italic;
      margin-top: 0.25rem;
      opacity: 0.8;
      transition: color 0.3s ease;
    }
  }
}

.song-list {
  background: var(--find-song-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: var(--td-shadow-1);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--find-border-color);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--find-song-hover-bg);
  }

  .song-index {
    width: 2rem;
    text-align: center;
    font-size: 0.875rem;
    color: var(--find-text-secondary);
    font-weight: 500;
  }

  .song-info {
    flex: 1;
    margin-left: 1rem;

    .song-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--find-text-primary);
      margin-bottom: 0.25rem;
    }

    .song-artist {
      font-size: 0.75rem;
      color: var(--find-text-secondary);
    }
  }

  .song-duration {
    font-size: 0.75rem;
    color: var(--find-text-secondary);
    margin-right: 1rem;
  }

  .song-actions {
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover .song-actions {
    opacity: 1;
  }
}
</style>
