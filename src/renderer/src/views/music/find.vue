<script setup lang="ts">
import { ref, onMounted, watch, WatchHandle, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import { extractDominantColor } from '../../utils/color/colorExtractor'

// 路由实例
const router = useRouter()

// 推荐歌单数据
const recommendPlaylists: any = ref([])
const loading = ref(true)
const error = ref('')
const mainColors = ref<any[]>([])
const textColors = ref<string[]>([])

// 热门歌曲数据
const hotSongs: any = ref([])

let watchSource: WatchHandle | null = null

// 获取热门歌单数据
const fetchHotSonglist = async () => {
  try {
    loading.value = true
    error.value = ''

    // 调用真实 API 获取热门歌单
    const result = await window.api.music.requestSdk('getHotSonglist', {
      source: userSource.value.source
    })
    if (result && result.list) {
      recommendPlaylists.value = result.list.map((item: any) => ({
        id: item.id,
        title: item.name,
        description: item.desc || '精选歌单',
        cover: item.img,
        playCount: item.play_count, // 直接使用返回的格式化字符串
        author: item.author,
        total: item.total,
        time: item.time,
        source: item.source
      }))
    }
    // 初始化主题色和文字颜色数组
    mainColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#55C277')
    textColors.value = Array.from({ length: recommendPlaylists.value.length }).map(() => '#fff')

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
  } catch (err) {
    console.error('获取热门歌单失败:', err)
    error.value = '获取数据失败，请稍后重试'
    // 使用备用数据
    recommendPlaylists.value = []
  } finally {
    loading.value = false
  }
}

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

const playSong = (song: any): void => {
  console.log('播放歌曲:', song.title)
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
        fetchHotSonglist()
      }
    },
    { deep: true, immediate: true }
  )
})
onUnmounted(() => {
  if (watchSource) {
    watchSource()
    watchSource = null
  }
})
</script>

<template>
  <div class="find-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>发现音乐</h2>
      <p>探索最新最热的音乐内容</p>
    </div>
    <!-- 推荐歌单 -->
    <div class="section">
      <h3 class="section-title">热门歌单Top{{ recommendPlaylists.length }}</h3>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <t-loading size="large" text="正在加载热门歌单..." />
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-container">
        <t-alert theme="error" :message="error" />
        <t-button theme="primary" style="margin-top: 1rem" @click="fetchHotSonglist">
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
            <img :src="playlist.cover" :alt="playlist.title" />
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
    </div>

    <!-- 热门歌曲 -->
    <div class="section" v-if="hotSongs.length > 0">
      <h3 class="section-title">热门歌曲</h3>
      <div class="song-list">
        <div
          v-for="(song, index) in hotSongs"
          :key="song.id"
          class="song-item"
          @click="playSong(song)"
        >
          <div class="song-index">{{ index + 1 }}</div>
          <div class="song-info">
            <div class="song-title">{{ song.title }}</div>
            <div class="song-artist">{{ song.artist }} - {{ song.album }}</div>
          </div>
          <div class="song-duration">{{ song.duration }}</div>
          <div class="song-actions">
            <t-button shape="circle" theme="default" variant="text" size="small">
              <i class="iconfont icon-gengduo"></i>
            </t-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.find-container {
  padding: 2rem;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;

  h2 {
    color: var(--td-text-color-primary);
    margin-bottom: 0.5rem;
    font-size: 1.875rem;
    font-weight: 600;
  }

  p {
    color: var(--find-text-secondary);
    font-size: 1rem;
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

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      user-select: none;
      -webkit-user-drag: none;
      transition: transform 0.3s ease;
    }

    // 图片悬浮缩放效果
    &:hover img {
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
