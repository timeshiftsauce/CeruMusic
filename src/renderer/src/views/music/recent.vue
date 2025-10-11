<script setup lang="ts">
import { ref } from 'vue'

// 最近播放数据
const recentSongs = ref([
  {
    id: 1,
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    duration: '3:37',
    playTime: '2024-01-15 14:30',
    playCount: 15
  },
  {
    id: 2,
    title: '青花瓷',
    artist: '周杰伦',
    album: '我很忙',
    duration: '3:58',
    playTime: '2024-01-15 13:45',
    playCount: 8
  },
  {
    id: 3,
    title: '稻香',
    artist: '周杰伦',
    album: '魔杰座',
    duration: '3:43',
    playTime: '2024-01-15 12:20',
    playCount: 12
  },
  {
    id: 4,
    title: '告白气球',
    artist: '周杰伦',
    album: '周杰伦的床边故事',
    duration: '3:34',
    playTime: '2024-01-14 20:15',
    playCount: 6
  },
  {
    id: 5,
    title: '七里香',
    artist: '周杰伦',
    album: '七里香',
    duration: '4:05',
    playTime: '2024-01-14 19:30',
    playCount: 20
  }
])

// 最近播放的歌单
const recentPlaylists = ref([
  {
    id: 1,
    title: '我的收藏',
    description: '收藏的精选歌曲',
    cover: 'https://via.placeholder.com/120x120/f97316/ffffff?text=收藏',
    songCount: 25,
    playTime: '2024-01-15 14:00'
  },
  {
    id: 2,
    title: '工作音乐',
    description: '适合工作时听的音乐',
    cover: 'https://via.placeholder.com/120x120/3b82f6/ffffff?text=工作',
    songCount: 18,
    playTime: '2024-01-15 09:30'
  },
  {
    id: 3,
    title: '放松时光',
    description: '轻松愉快的音乐',
    cover: 'https://via.placeholder.com/120x120/10b981/ffffff?text=放松',
    songCount: 32,
    playTime: '2024-01-14 21:00'
  }
])

const playSong = (song: any): void => {
  console.log('播放歌曲:', song.title)
}

const playPlaylist = (playlist: any): void => {
  console.log('播放歌单:', playlist.title)
}

const clearHistory = (): void => {
  console.log('清空播放历史')
  // 这里可以添加确认对话框和清空逻辑
}

const formatPlayTime = (timeStr: string): string => {
  const playTime = new Date(timeStr)
  const now = new Date()
  const diffMs = now.getTime() - playTime.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) {
    return '刚刚'
  } else if (diffHours < 24) {
    return `${diffHours} 小时前`
  } else if (diffDays < 7) {
    return `${diffDays} 天前`
  } else {
    return playTime.toLocaleDateString('zh-CN')
  }
}
</script>

<template>
  <div class="recent-container">
    <!-- 页面标题和操作 -->
    <div class="page-header">
      <div class="header-left">
        <h2>最近播放</h2>
        <p>您最近听过的音乐和歌单</p>
      </div>
      <div class="header-actions">
        <t-button theme="default" variant="outline" @click="clearHistory">
          <i class="iconfont icon-shanchu"></i>
          清空历史
        </t-button>
      </div>
    </div>

    <!-- 最近播放的歌单 -->
    <div class="section">
      <h3 class="section-title">最近播放的歌单</h3>
      <div class="playlist-list">
        <div
          v-for="playlist in recentPlaylists"
          :key="playlist.id"
          class="playlist-item"
          @click="playPlaylist(playlist)"
        >
          <div class="playlist-cover">
            <img :src="playlist.cover" :alt="playlist.title" />
            <div class="play-overlay">
              <i class="iconfont icon-a-tingzhiwukuang"></i>
            </div>
          </div>
          <div class="playlist-info">
            <h4 class="playlist-title">{{ playlist.title }}</h4>
            <p class="playlist-desc">{{ playlist.description }}</p>
            <div class="playlist-meta">
              <span>{{ playlist.songCount }} 首歌曲</span>
              <span>{{ formatPlayTime(playlist.playTime) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 最近播放的歌曲 -->
    <div class="section">
      <h3 class="section-title">最近播放的歌曲</h3>
      <div class="song-list">
        <div
          v-for="(song, index) in recentSongs"
          :key="song.id"
          class="song-item"
          @click="playSong(song)"
        >
          <div class="song-index">{{ index + 1 }}</div>
          <div class="song-info">
            <div class="song-title">{{ song.title }}</div>
            <div class="song-artist">{{ song.artist }} - {{ song.album }}</div>
          </div>
          <div class="song-stats">
            <div class="play-count">播放 {{ song.playCount }} 次</div>
            <div class="play-time">{{ formatPlayTime(song.playTime) }}</div>
          </div>
          <div class="song-duration">{{ song.duration }}</div>
          <div class="song-actions">
            <t-button
              shape="circle"
              theme="primary"
              variant="text"
              size="small"
              title="播放"
              @click.stop="playSong(song)"
            >
              <i class="iconfont icon-a-tingzhiwukuang"></i>
            </t-button>
            <t-button shape="circle" theme="default" variant="text" size="small" title="更多">
              <i class="iconfont icon-gengduo"></i>
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="recentSongs.length === 0 && recentPlaylists.length === 0" class="empty-state">
      <div class="empty-icon">
        <i class="iconfont icon-shijian"></i>
      </div>
      <h3>暂无播放历史</h3>
      <p>开始播放音乐后，您的播放记录将显示在这里</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.recent-container {
  // background: var(--recent-bg);
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  // min-height: 100%;
  height: 100%;
  overflow-y: auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;

  .header-left {
    h2 {
      color: var(--recent-title-color);
      margin-bottom: 0.5rem;
      font-size: 1.875rem;
      font-weight: 600;
    }

    p {
      color: var(--recent-subtitle-color);
      font-size: 1rem;
    }
  }
}

.section {
  margin-bottom: 3rem;

  .section-title {
    color: var(--recent-section-title);
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }
}

.playlist-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.playlist-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  background: var(--recent-card-bg);
  border-radius: 0.75rem;
  box-shadow: var(--recent-card-shadow);
  cursor: pointer;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--recent-card-shadow-hover);

    .play-overlay {
      opacity: 1;
    }
  }

  .playlist-cover {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 0.5rem;
    overflow: hidden;
    margin-right: 1rem;

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

      .iconfont {
        font-size: 1.5rem;
        color: white;
      }
    }
  }

  .playlist-info {
    flex: 1;

    .playlist-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--recent-playlist-title);
      margin-bottom: 0.25rem;
    }

    .playlist-desc {
      font-size: 0.875rem;
      color: var(--recent-playlist-desc);
      margin-bottom: 0.5rem;
    }

    .playlist-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.75rem;
      color: var(--recent-playlist-meta);

      span {
        &:not(:last-child)::after {
          content: '•';
          margin-left: 1rem;
          color: #d1d5db;
        }
      }
    }
  }
}

.song-list {
  background: var(--recent-card-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: var(--recent-card-shadow);
}

.song-item {
  display: flex;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--recent-song-item-border);
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--recent-song-item-hover);

    .song-actions {
      opacity: 1;
    }
  }

  .song-index {
    width: 2rem;
    text-align: center;
    font-size: 0.875rem;
    color: var(--recent-song-index);
    font-weight: 500;
  }

  .song-info {
    flex: 1;
    margin-left: 1rem;

    .song-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--recent-song-title);
      margin-bottom: 0.25rem;
    }

    .song-artist {
      font-size: 0.75rem;
      color: var(--recent-song-artist);
    }
  }

  .song-stats {
    margin-right: 2rem;
    text-align: right;

    .play-count {
      font-size: 0.75rem;
      color: var(--recent-song-stats);
      margin-bottom: 0.125rem;
    }

    .play-time {
      font-size: 0.75rem;
      color: var(--recent-playlist-meta);
    }
  }

  .song-duration {
    font-size: 0.75rem;
    color: var(--recent-song-duration);
    margin-right: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .song-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;

  .empty-icon {
    margin-bottom: 1.5rem;

    .iconfont {
      font-size: 4rem;
      color: var(--recent-empty-icon);
    }
  }

  h3 {
    color: var(--recent-empty-title);
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }

  p {
    color: var(--recent-empty-text);
  }
}
</style>
