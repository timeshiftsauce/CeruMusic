<script setup lang="ts">
import { ref, onMounted, computed, nextTick, onUnmounted, watch, toRaw } from 'vue'
import { PlayIcon, HeartIcon, DownloadIcon, MoreIcon } from 'tdesign-icons-vue-next'
import { searchValue } from '@renderer/store/search'
import { downloadSingleSong } from '@renderer/utils/download'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { MessagePlugin } from 'tdesign-vue-next'

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
  _types: Record<string, any>;
  typeUrl: Record<string, any>
}
const keyword = ref('')
const searchResults = ref<MusicItem[]>([])
const hoveredSong = ref<any>(null)
const loading = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 50
const totalItems = ref(0)

// 虚拟滚动配置
const virtualScrollConfig = ref({
  containerHeight: 0, // 动态计算容器高度
  itemHeight: 64, // 每个项目的高度
  buffer: 5 // 缓冲区项目数量
})

// 虚拟滚动状态
const scrollContainer = ref<HTMLElement>()
const scrollTop = ref(0)
const visibleStartIndex = ref(0)
const visibleEndIndex = ref(0)
const visibleItems = ref<MusicItem[]>([])
const mainContent = document.querySelector('.mainContent')
// 计算容器高度
const calculateContainerHeight = () => {
  if (typeof window !== 'undefined') {
    console.log(mainContent?.clientHeight)
    const listHeaderHeight = 40 // 表头高度
    const pageHeaderHeight = 52 // 表头高度
    const padding = 60 // 容器内边距
    const availableHeight =
      (mainContent?.clientHeight || document.body.offsetHeight) -
      pageHeaderHeight -
      listHeaderHeight -
      padding
    virtualScrollConfig.value.containerHeight = Math.max(400, availableHeight)
  }
}

// 计算虚拟滚动的可见项目
const updateVisibleItems = () => {
  const { containerHeight, itemHeight, buffer } = virtualScrollConfig.value
  const totalItems = searchResults.value.length

  if (totalItems === 0) {
    visibleItems.value = []
    return
  }

  const visibleCount = Math.ceil(containerHeight / itemHeight)
  const startIndex = Math.floor(scrollTop.value / itemHeight)
  const endIndex = Math.min(startIndex + visibleCount + buffer * 2, totalItems)

  visibleStartIndex.value = Math.max(0, startIndex - buffer)
  visibleEndIndex.value = endIndex

  visibleItems.value = searchResults.value.slice(visibleStartIndex.value, visibleEndIndex.value)
}

// 处理滚动事件
const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  updateVisibleItems()

  // 检查是否需要加载更多
  const { scrollTop: currentScrollTop, scrollHeight, clientHeight } = target
  if (scrollHeight - currentScrollTop - clientHeight < 100) {
    onScrollToBottom()
  }
}

// 计算总高度
const totalHeight = computed(
  () => searchResults.value.length * virtualScrollConfig.value.itemHeight
)

// 计算偏移量
const offsetY = computed(() => visibleStartIndex.value * virtualScrollConfig.value.itemHeight)
const search = searchValue()
// 从路由参数中获取搜索关键词和初始结果

onMounted(async () => {
  // 计算容器高度

  watch(
    search,
    async () => {
      keyword.value = search.getValue
      await performSearch(true)
      // 确保初始渲染显示内容
      await nextTick()
      updateVisibleItems()
    },
    { immediate: true }
  )
  calculateContainerHeight()
  // 监听窗口大小变化
  window.addEventListener('resize', calculateContainerHeight)
})

onUnmounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.removeEventListener('scroll', handleScroll)
  }
  window.removeEventListener('resize', calculateContainerHeight)
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
    console.log(result)
    totalItems.value = result.total || 0
    if (reset) {
      searchResults.value = result.list || []
    } else {
      searchResults.value = [...searchResults.value, ...(result.list || [])]
    }

    setPic((currentPage.value-1) * pageSize, source)
    currentPage.value += 1
    hasMore.value = (result.list?.length || 0) >= pageSize

    // 更新虚拟滚动
    await nextTick()
    updateVisibleItems()
  } catch (error) {
    console.error('搜索失败:', error)
  } finally {
    loading.value = false
  }
}
async function setPic(offset:number, source:string) {
  console.log('get',offset)

  for(let i = offset;i<searchResults.value.length;i++){
    const tempImg = searchResults.value[i].img
    if(tempImg) continue
    try{
       const url = await window.api.music.requestSdk('getPic',{source,songInfo:toRaw(searchResults.value[i])})

      if(typeof url !== 'object'){
        searchResults.value[i].img = url
      }else{
        console.log(url)
        searchResults.value[i].img = 'resources/logo.png'
      }
    }catch(e){
        searchResults.value[i].img = 'logo.svg'

      console.log('获取失败 index'+i,e)
    }
  }
  
}
// 虚拟滚动触底加载更多
const onScrollToBottom = async () => {
  if (!loading.value && hasMore.value) {
    await performSearch(false)
  }
}
// 计算是否有搜索结果
const hasResults = computed(() => searchResults.value && searchResults.value.length > 0)

// 播放歌曲 - 点击背景时添加到播放列表第一项并播放
const playSong = (song: MusicItem): void => {
  console.log('播放歌曲:', song.name)
  // 触发添加到播放列表并播放的事件
  if ((window as any).musicEmitter) {
    ; (window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(song))
  }
}

// 添加到播放列表末尾
const addToPlaylist = (song: any): void => {
  console.log('添加到播放列表:', song.name)
  // 触发添加到播放列表末尾的事件
  if ((window as any).musicEmitter) {
    ; (window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song))
  }
}
</script>

<template>
  <div class="search-container">
    <!-- 搜索结果标题 -->
    <div class="search-header">
      <h2 class="search-title">
        搜索"<span class="keyword">{{ keyword }}</span>"
      </h2>
      <div v-if="hasResults" class="result-info">找到 {{ totalItems }} 首单曲</div>
    </div>

    <!-- 歌曲列表 -->
    <div v-if="hasResults" class="song-list-wrapper">
      <!-- 表头 -->
      <div class="list-header">
        <div class="col-index"></div>
        <div class="col-title">标题</div>
        <div class="col-album">专辑</div>
        <div class="col-like">喜欢</div>
        <div class="col-duration">时长</div>
      </div>

      <!-- 虚拟滚动列表 -->
      <div ref="scrollContainer" class="virtual-scroll-container"
        :style="{ height: virtualScrollConfig.containerHeight + 'px' }" @scroll="handleScroll">
        <div class="virtual-scroll-spacer" :style="{ height: totalHeight + 'px' }">
          <div class="virtual-scroll-content" :style="{ transform: `translateY(${offsetY}px)` }">
            <div v-for="(song, index) in visibleItems" :key="song.songmid" class="song-item"
              :class="{ 'is-playing': false, 'is-hovered': hoveredSong === song.songmid }"
              @mouseenter="hoveredSong = song.songmid" @mouseleave="hoveredSong = null" @dblclick="playSong(song)">
              <!-- 序号/播放按钮 -->
              <div class="col-index">
                <span v-if="hoveredSong !== song.songmid" class="track-number">
                  {{ String(visibleStartIndex + index + 1).padStart(2, '0') }}
                </span>
                <t-button v-else variant="text" size="small" class="play-btn" title="添加到播放列表"
                  @click.stop="addToPlaylist(song)">
                  <play-icon size="30" />
                </t-button>
              </div>

              <!-- 歌曲信息 -->
              <div class="col-title">
                <div v-if="song.img" class="song-cover">
                  <img :src="song.img
                    " loading="lazy" alt="封面" />
                </div>
                <div class="song-info">
                  <div class="song-name" :title="song.name">{{ song.name }}</div>
                  <div class="artist-name" :title="song.singer ? song.singer : ''">
                    <template v-if="song.singer">
                      <span class="artist-link">
                        {{ song.singer }}
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 专辑 -->
              <div class="col-album">
                <span class="album-name" :title="song.albumName">
                  {{ song.albumName || '-' }}
                </span>
              </div>

              <!-- 喜欢按钮 -->
              <div class="col-like">
                <t-button variant="text" size="small" class="action-btn like-btn" @click.stop>
                  <heart-icon size="16" />
                </t-button>
              </div>

              <!-- 时长和更多操作 -->
              <div class="col-duration">
                <div class="duration-wrapper">
                  <span v-if="hoveredSong !== song.songmid" class="duration">{{
                    song.interval
                    }}</span>
                  <div v-else class="action-buttons">
                    <t-button variant="text" size="small" class="action-btn" title="下载"
                      @click.stop="downloadSingleSong(song.songmid as unknown as string, song.name, song.albumName)">
                      <download-icon size="16" />
                    </t-button>
                    <t-button variant="text" size="small" class="action-btn" title="更多" @click.stop>
                      <more-icon size="16" />
                    </t-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
      <t-loading size="large" text="搜索中..." />
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
}

.list-header {
  display: grid;
  grid-template-columns: 60px 1fr 200px 60px 80px;
  padding: 8px 20px;
  background: #fafafa;
  border-bottom: 1px solid #e9e9e9;
  font-size: 12px;
  color: #999;

  .col-index {
    text-align: center;
  }

  .col-title {
    padding-left: 10px;
  }

  .col-like {
    text-align: center;
  }

  .col-duration {
    text-align: center;
  }
}

.virtual-scroll-container {
  background: #fff;
  overflow-y: auto;
  position: relative;

  .virtual-scroll-spacer {
    position: relative;
  }

  .virtual-scroll-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
  }

  .song-item {
    display: grid;
    grid-template-columns: 60px 1fr 200px 60px 80px;
    padding: 8px 20px;
    border-bottom: 1px solid #f5f5f5;
    cursor: pointer;
    transition: background-color 0.2s ease;
    height: 64px;
    /* 固定高度，与虚拟滚动配置一致 */

    &:hover,
    &.is-hovered {
      background: #f5f5f5;
    }

    &.is-playing {
      background: #f0f7ff;
      color: #507daf;
    }

    .col-index {
      display: flex;
      align-items: center;
      justify-content: center;

      .track-number {
        font-size: 14px;
        color: #999;
        font-variant-numeric: tabular-nums;
      }

      .play-btn {
        color: #507daf;

        &:hover {
          color: #3a5d8f;
        }
      }
    }

    .col-title {
      display: flex;
      align-items: center;
      padding-left: 10px;
      min-width: 0;
      overflow: hidden;

      .song-cover {
        width: 40px;
        height: 40px;
        margin-right: 10px;
        border-radius: 4px;
        overflow: hidden;
        flex-shrink: 0;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .song-info {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        overflow: hidden;

        .song-name {
          font-size: 14px;
          color: #333;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;

          &:hover {
            color: #507daf;
          }
        }

        .artist-name {
          font-size: 12px;
          color: #999;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;

          .artist-link {
            &:hover {
              color: #507daf;
              cursor: pointer;
            }
          }
        }
      }
    }

    .col-album {
      display: flex;
      align-items: center;
      padding: 0 10px;
      overflow: hidden;

      .album-name {
        font-size: 12px;
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;

        &:hover {
          color: #507daf;
          cursor: pointer;
        }
      }
    }

    .col-like {
      display: flex;
      align-items: center;
      justify-content: center;

      .like-btn {
        color: #ccc;

        &:hover {
          color: #507daf;
          background: rgba(80, 125, 175, 0.1);
        }
      }
    }

    .col-duration {
      display: flex;
      align-items: center;
      justify-content: center;

      .duration-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;

        .duration {
          font-size: 12px;
          color: #999;
          font-variant-numeric: tabular-nums;
          min-width: 35px;
          text-align: center;
        }

        .action-buttons {
          display: flex;
          gap: 4px;
          justify-content: center;

          .action-btn {
            color: #ccc;
            padding: 0 4px;

            &:hover {
              color: #507daf;
            }
          }
        }
      }
    }
  }
}

.load-more {
  padding: 20px;
  text-align: center;
  border-top: 1px solid #f5f5f5;
  background: #fafafa;

  .load-more-tip,
  .load-complete {
    font-size: 12px;
    color: #999;
  }
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
}

/* 响应式设计 */
@media (max-width: 768px) {
  .search-container {
    padding: 15px;
  }

  .list-header,
  .song-item {
    grid-template-columns: 50px 1fr 50px 60px;

    .col-album {
      display: none;
    }

    .col-title {
      .song-cover {
        width: 35px;
        height: 35px;
      }
    }
  }
}
</style>
