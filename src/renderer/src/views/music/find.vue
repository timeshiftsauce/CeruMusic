<script setup lang="ts">
import { ref } from 'vue'

// 推荐歌单数据
const recommendPlaylists = ref([
  {
    id: 1,
    title: '热门流行',
    description: '最新最热的流行音乐',
    cover: 'https://via.placeholder.com/200x200/f97316/ffffff?text=热门流行',
    playCount: '1.2万'
  },
  {
    id: 2,
    title: '经典老歌',
    description: '怀旧经典，永恒旋律',
    cover: 'https://via.placeholder.com/200x200/3b82f6/ffffff?text=经典老歌',
    playCount: '8.5万'
  },
  {
    id: 3,
    title: '轻音乐',
    description: '放松心情的轻柔音乐',
    cover: 'https://via.placeholder.com/200x200/10b981/ffffff?text=轻音乐',
    playCount: '3.7万'
  },
  {
    id: 4,
    title: '摇滚精选',
    description: '激情澎湃的摇滚乐',
    cover: 'https://via.placeholder.com/200x200/ef4444/ffffff?text=摇滚精选',
    playCount: '2.1万'
  }
])

// 热门歌曲数据
const hotSongs = ref([
  { id: 1, title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: '3:37' },
  { id: 2, title: '青花瓷', artist: '周杰伦', album: '我很忙', duration: '3:58' },
  { id: 3, title: '稻香', artist: '周杰伦', album: '魔杰座', duration: '3:43' },
  { id: 4, title: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事', duration: '3:34' },
  { id: 5, title: '七里香', artist: '周杰伦', album: '七里香', duration: '4:05' }
])

const playPlaylist = (playlist: any): void => {
  console.log('播放歌单:', playlist.title)
}

const playSong = (song: any): void => {
  console.log('播放歌曲:', song.title)
}
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
      <h3 class="section-title">推荐歌单</h3>
      <div class="playlist-grid">
        <div
          v-for="playlist in recommendPlaylists"
          :key="playlist.id"
          class="playlist-card"
          @click="playPlaylist(playlist)"
        >
          <div class="playlist-cover">
            <img :src="playlist.cover" :alt="playlist.title" />
            <div class="play-overlay">
              <t-button shape="circle" theme="primary" size="large">
                <i class="iconfont icon-a-tingzhiwukuang"></i>
              </t-button>
            </div>
          </div>
          <div class="playlist-info">
            <h4 class="playlist-title">{{ playlist.title }}</h4>
            <p class="playlist-desc">{{ playlist.description }}</p>
            <span class="play-count">
              <i class="iconfont icon-a-tingzhiwukuang"></i>
              {{ playlist.playCount }}
            </span>
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
  max-width: 1200px;
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

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

    .play-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
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
