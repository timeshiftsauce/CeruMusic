<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
// 路由实例
const router = useRouter()

// 推荐歌单数据
const recommendPlaylists: any = ref([])
const loading = ref(true)
const error = ref('')

// 热门歌曲数据
const hotSongs:any = ref([])

// 获取热门歌单数据
const fetchHotSonglist = async () => {
  const LocalUserDetail = LocalUserDetailStore()
  try {
    loading.value = true
    error.value = ''

    // 调用真实 API 获取热门歌单
    const result = await window.api.music.requestSdk('getHotSonglist', {
      source: LocalUserDetail.userSource.source
    })

    if (result && result.list) {
      recommendPlaylists.value = result.list.map((item: any) => ({
        id: item.id,
        title: item.name,
        description: item.desc || '精选歌单',
        cover: item.img || 'https://via.placeholder.com/200x200/f97316/ffffff?text=歌单',
        playCount: item.play_count, // 直接使用返回的格式化字符串
        author: item.author,
        total: item.total,
        time: item.time,
        source: item.source
      }))
    }
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

// 组件挂载时获取数据
onMounted(() => {
  fetchHotSonglist()
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
        <t-button theme="primary" @click="fetchHotSonglist" style="margin-top: 1rem">
          重新加载
        </t-button>
      </div>

      <!-- 歌单列表 -->
      <div v-else class="playlist-grid">
        <div
          v-for="playlist in recommendPlaylists"
          :key="playlist.id"
          class="playlist-card"
          @click="playPlaylist(playlist)"
        >
          <div class="playlist-cover">
            <img :src="playlist.cover" :alt="playlist.title" />
          </div>
          <div class="playlist-info">
            <h4 class="playlist-title">{{ playlist.title }}</h4>
            <p class="playlist-desc">{{ playlist.description }}</p>
            <div class="playlist-meta">
              <span class="play-count">
                <i class="iconfont icon-bofang"></i>
                {{ playlist.playCount }}
              </span>
              <span class="song-count" v-if="playlist.total">{{ playlist.total }}首</span>
            </div>
            <!-- <div class="playlist-author">by {{ playlist.author }}</div> -->
          </div>
        </div>
      </div>
    </div>

    <!-- 热门歌曲 -->
    <div class="section">
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
  margin: 0 auto;
}

.page-header {
  margin-bottom: 2rem;

  h2 {
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 1.875rem;
    font-weight: 600;
  }

  p {
    color: #6b7280;
    font-size: 1rem;
  }
}

.section {
  margin-bottom: 3rem;

  .section-title {
    color: #111827;
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
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1.5rem;
}

.playlist-card {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

    .play-overlay {
      opacity: 1;
    }
  }

  .playlist-cover {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .playlist-info {
    padding: 1rem;

    .playlist-title {
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playlist-desc {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .playlist-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .play-count {
      font-size: 0.75rem;
      color: #9ca3af;
      display: flex;
      align-items: center;
      gap: 0.25rem;

      .iconfont {
        font-size: 0.75rem;
      }
    }

    .song-count {
      font-size: 0.75rem;
      color: #9ca3af;
    }

    .playlist-author {
      font-size: 0.75rem;
      color: #6b7280;
      font-style: italic;
    }
  }
}

.song-list {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f9fafb;
  }

  .song-index {
    width: 2rem;
    text-align: center;
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .song-info {
    flex: 1;
    margin-left: 1rem;

    .song-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: #111827;
      margin-bottom: 0.25rem;
    }

    .song-artist {
      font-size: 0.75rem;
      color: #6b7280;
    }
  }

  .song-duration {
    font-size: 0.75rem;
    color: #6b7280;
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
