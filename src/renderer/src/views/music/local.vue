<script setup lang="ts">
import { ref } from 'vue'

// 本地音乐数据
const localSongs = ref([
  {
    id: 1,
    title: '夜曲',
    artist: '周杰伦',
    album: '十一月的萧邦',
    duration: '3:37',
    path: '/music/夜曲.mp3',
    size: '8.5 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    id: 2,
    title: '青花瓷',
    artist: '周杰伦',
    album: '我很忙',
    duration: '3:58',
    path: '/music/青花瓷.mp3',
    size: '9.2 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    id: 3,
    title: '稻香',
    artist: '周杰伦',
    album: '魔杰座',
    duration: '3:43',
    path: '/music/稻香.mp3',
    size: '8.8 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    id: 4,
    title: '告白气球',
    artist: '周杰伦',
    album: '周杰伦的床边故事',
    duration: '3:34',
    path: '/music/告白气球.mp3',
    size: '8.4 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    id: 5,
    title: '七里香',
    artist: '周杰伦',
    album: '七里香',
    duration: '4:05',
    path: '/music/七里香.mp3',
    size: '9.6 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  }
])

// 统计信息
const stats = ref({
  totalSongs: localSongs.value.length,
  totalDuration: '19:17',
  totalSize: '44.5 MB'
})

const playSong = (song: any): void => {
  console.log('播放本地歌曲:', song.title)
}

const importMusic = (): void => {
  console.log('导入音乐文件')
  // 这里可以调用 Electron 的文件选择对话框
}

const openMusicFolder = (): void => {
  console.log('打开音乐文件夹')
  // 这里可以调用 Electron 的文件夹打开功能
}

const deleteSong = (song: any): void => {
  console.log('删除歌曲:', song.title)
  // 这里可以添加删除确认和实际删除逻辑
}
</script>

<template>
  <div class="local-container">
    <!-- 页面标题和操作 -->
    <div class="page-header">
      <div class="header-left">
        <h2>本地音乐</h2>
        <div class="stats">
          <span>{{ stats.totalSongs }} 首歌曲</span>
          <span>总时长 {{ stats.totalDuration }}</span>
          <span>总大小 {{ stats.totalSize }}</span>
        </div>
      </div>
      <div class="header-actions">
        <t-button theme="default" @click="openMusicFolder">
          <i class="iconfont icon-shouye"></i>
          打开文件夹
        </t-button>
        <t-button theme="primary" @click="importMusic">
          <i class="iconfont icon-zengjia"></i>
          导入音乐
        </t-button>
      </div>
    </div>

    <!-- 音乐列表 -->
    <div class="music-list">
      <div class="list-header">
        <div class="header-item index">#</div>
        <div class="header-item title">标题</div>
        <div class="header-item artist">艺术家</div>
        <div class="header-item album">专辑</div>
        <div class="header-item duration">时长</div>
        <div class="header-item size">大小</div>
        <div class="header-item format">格式</div>
        <div class="header-item actions">操作</div>
      </div>

      <div class="list-body">
        <div
          v-for="(song, index) in localSongs"
          :key="song.id"
          class="song-row"
          @dblclick="playSong(song)"
        >
          <div class="row-item index">{{ index + 1 }}</div>
          <div class="row-item title">
            <div class="song-title">{{ song.title }}</div>
          </div>
          <div class="row-item artist">{{ song.artist }}</div>
          <div class="row-item album">{{ song.album }}</div>
          <div class="row-item duration">{{ song.duration }}</div>
          <div class="row-item size">{{ song.size }}</div>
          <div class="row-item format">
            <span class="format-badge">{{ song.format }}</span>
            <span class="bitrate">{{ song.bitrate }}</span>
          </div>
          <div class="row-item actions">
            <t-button
              shape="circle"
              theme="primary"
              variant="text"
              size="small"
              title="播放"
              @click="playSong(song)"
            >
              <i class="iconfont icon-a-tingzhiwukuang"></i>
            </t-button>
            <t-button shape="circle" theme="default" variant="text" size="small" title="更多">
              <i class="iconfont icon-gengduo"></i>
            </t-button>
            <t-button
              shape="circle"
              theme="danger"
              variant="text"
              size="small"
              title="删除"
              @click="deleteSong(song)"
            >
              <i class="iconfont icon-shanchu"></i>
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="localSongs.length === 0" class="empty-state">
      <div class="empty-icon">
        <i class="iconfont icon-music"></i>
      </div>
      <h3>暂无本地音乐</h3>
      <p>点击"导入音乐"按钮添加您的音乐文件</p>
      <t-button theme="primary" @click="importMusic">
        <i class="iconfont icon-zengjia"></i>
        导入音乐
      </t-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.local-container {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;

  .header-left {
    h2 {
      color: #111827;
      margin-bottom: 0.5rem;
      font-size: 1.875rem;
      font-weight: 600;
    }

    .stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: #6b7280;

      span {
        &:not(:last-child)::after {
          content: '•';
          margin-left: 1rem;
          color: #d1d5db;
        }
      }
    }
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }
}

.music-list {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.list-header {
  display: grid;
  grid-template-columns: 60px 1fr 150px 150px 80px 80px 120px 120px;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;

  .header-item {
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.list-body {
  .song-row {
    display: grid;
    grid-template-columns: 60px 1fr 150px 150px 80px 80px 120px 120px;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #f3f4f6;
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: #f9fafb;

      .actions {
        opacity: 1;
      }
    }

    .row-item {
      display: flex;
      align-items: center;
      font-size: 0.875rem;

      &.index {
        justify-content: center;
        color: #6b7280;
        font-weight: 500;
      }

      &.title {
        .song-title {
          font-weight: 500;
          color: #111827;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      &.artist,
      &.album {
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &.duration,
      &.size {
        color: #6b7280;
        font-variant-numeric: tabular-nums;
      }

      &.format {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.125rem;

        .format-badge {
          background: #f3f4f6;
          color: #6b7280;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .bitrate {
          font-size: 0.75rem;
          color: #9ca3af;
        }
      }

      &.actions {
        gap: 0.25rem;
        opacity: 0;
        transition: opacity 0.2s ease;
      }
    }
  }
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;

  .empty-icon {
    margin-bottom: 1.5rem;

    .iconfont {
      font-size: 4rem;
      color: #d1d5db;
    }
  }

  h3 {
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }

  p {
    color: #6b7280;
    margin-bottom: 2rem;
  }
}
</style>
