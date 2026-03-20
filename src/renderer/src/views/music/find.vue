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
      source: userSource.value.source || 'wy'
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
      source: userSource.value.source || 'wy',
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
const onDocClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.category-bar') && showMore.value) showMore.value = false
}

// 组件挂载时获取数据
onMounted(() => {
  // 设置音源变化监听器
  watchSource = watch(
    userSource,
    () => {
      loading.value = true
      error.value = ''
      // 初始化分类
      fetchTags().then(() => {
        // 默认热门分类
        activeTagId.value = ''
        activeCategoryName.value = '热门'
        fetchCategoryPlaylists(true)
      })
    },
    { deep: true, immediate: true }
  )
  document.addEventListener('click', onDocClick)
})
const backTop = ref(false)
const scrollTop = ref(0)
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  if (watchSource) {
    watchSource()
    watchSource = null
  }
})
onActivated(() => {
  backTop.value = true
  // 恢复滚动位置
  if (songlistScrollRef.value) {
    songlistScrollRef.value.scrollTop = scrollTop.value
  }
})
onDeactivated(() => {
  backTop.value = false
  // 记录滚动位置
  if (songlistScrollRef.value) {
    scrollTop.value = songlistScrollRef.value.scrollTop
  }
})
const songlistScrollRef = ref<HTMLDivElement>()
</script>

<template>
  <div id="findContainerRef" class="find-container page-shell find-page">
    <!-- 页面标题 -->
    <div class="page-header page-hero">
      <h2>发现音乐</h2>
      <p>探索最新最热的音乐内容</p>
    </div>
    <n-tabs type="segment" animated class="find-tabs" default-value="songlist" size="small">
      <n-tab-pane name="songlist" tab="歌单" class="songlist-tab-pane">
        <div ref="songlistScrollRef" class="scroll-container" @scroll="onScroll">
          <!-- 分类导航 -->
          <n-back-top
            v-if="backTop"
            :listen-to="songlistScrollRef"
            :right="40"
            :bottom="120"
            style="z-index: 100"
          >
          </n-back-top>

          <div ref="categoryBarRef" class="category-bar">
            <div class="tag-rail">
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
              </div>
            </div>

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

          <!-- 分类歌单 -->
          <div class="section panel-shell">
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
    display: flex;
    flex-direction: column;
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
      flex: 1;
      min-height: 0;
      padding: 0rem;
      .find-tab-pane {
        min-height: 0;
        height: 100%;
        overflow-y: auto;
      }
      .songlist-tab-pane {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        overflow: hidden;
        padding: 0 !important;
      }
    }
  }
}

.scroll-container {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.category-bar {
  position: relative;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1.25rem;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 60%),
    var(--shell-panel-bg);
  box-shadow: var(--shell-panel-shadow-soft);
  backdrop-filter: blur(var(--shell-blur-soft));
  overflow: visible;

  .tag-rail {
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .hot-tags {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    width: max-content;
    min-height: 2rem;
  }
  .more-category-wrapper {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    z-index: 8;

    .more-panel {
      position: absolute;
      top: calc(100% + 0.65rem);
      right: 0;
      z-index: 16;
      width: min(44rem, calc(100vw - 3rem));
      min-width: 18rem;
      transform-origin: top right;

      /* Inner container for actual visual style */
      .panel-inner {
        background: var(--shell-panel-bg-strong);
        border-radius: 1rem;
        box-shadow: var(--shell-panel-shadow-soft);
        border: 1px solid var(--shell-content-border);
        backdrop-filter: blur(var(--shell-blur-soft));
        padding: 8px 16px 16px;
      }
    }
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-height: 2rem;
    padding: 0.36rem 0.82rem;
    border-radius: 999px;
    border: none;
    background: rgba(255, 255, 255, 0.05);
    color: var(--td-text-color-secondary);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
    transition:
      transform var(--motion-duration-fast) var(--motion-ease-standard),
      background-color var(--motion-duration-fast) var(--motion-ease-standard),
      color var(--motion-duration-fast) var(--motion-ease-standard),
      box-shadow var(--motion-duration-fast) var(--motion-ease-standard);

    &:hover {
      transform: translateY(-1px);
      color: var(--td-text-color-primary);
      background: rgba(255, 255, 255, 0.12);
    }

    &.active {
      background:
        linear-gradient(135deg, var(--td-brand-color-5), rgba(14, 165, 233, 0.78)),
        var(--td-brand-color-light);
      color: var(--td-text-color-anti);
      font-weight: 600;
      box-shadow: 0 10px 20px rgba(0, 137, 62, 0.18);
    }

    &.more {
      display: flex;
      align-items: center;
      gap: 4px;
      background: rgba(255, 255, 255, 0.08);

      &:hover {
        background: rgba(255, 255, 255, 0.14);
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

@media (max-width: 860px) {
  .category-bar {
    padding: 0.8rem 0.85rem;
    gap: 0.55rem;

    .more-category-wrapper .more-panel {
      width: min(34rem, calc(100vw - 2rem));
    }

    .tag-chip {
      min-height: 1.9rem;
      padding: 0.34rem 0.72rem;
    }
  }
}

/* 下拉淡入缩放动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
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
  margin: 0;
  padding-block: 0.88rem;

  h2 {
    border-left: 8px solid var(--td-brand-color-3);
    padding-left: 12px;
    border-radius: 8px;
    color: var(--td-text-color-primary);
    margin-bottom: 0.28rem;
    font-size: 1.875rem;
    font-weight: 600;
    line-height: 1.5em;
  }

  p {
    color: var(--find-text-secondary);
    font-size: 0.85rem;
    line-height: 1.35;
  }
}

.section {
  margin-bottom: 1rem;
  padding: 1.25rem;
  position: relative;
  z-index: 1;
  overflow: visible;

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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), transparent 28%),
    var(--find-card-bg);
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow: var(--find-card-shadow);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  will-change: transform, box-shadow;

  // 现代化悬浮效果
  &:hover {
    transform: translateY(-6px) scale(1.018);
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
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(10px);
    transition:
      backdrop-filter 0.3s ease,
      background-color 0.3s ease,
      color 0.3s ease;

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
