<script setup lang="ts">
import { ref } from 'vue'

// 响应式状态
const hoveredSong = ref<number | null>(null)

// 模拟歌曲数据
const mockSongs = ref([
  {
    id: 1,
    index: 1,
    title: '别让我担心',
    artist: '刘若英',
    album: '我等你',
    duration: '4:32',
    albumArt: '../../assets/images/cover.png',
    isPlaying: true,
    tags: [
      { label: 'VIP', theme: 'warning' },
      { label: '原唱', theme: 'success' }
    ]
  },
  {
    id: 2,
    index: 2,
    title: '后来',
    artist: '刘若英',
    album: '我等你',
    duration: '4:18',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: [
      { label: '原唱', theme: 'success' },
      { label: 'Hot', theme: 'danger' }
    ]
  },
  {
    id: 3,
    index: 3,
    title: '为爱痴狂',
    artist: '刘若英',
    album: '年华',
    duration: '3:45',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: [{ label: 'VIP', theme: 'warning' }]
  },
  {
    id: 4,
    index: 4,
    title: '很爱很爱你',
    artist: '刘若英',
    album: '年华',
    duration: '4:12',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: []
  },
  {
    id: 5,
    index: 5,
    title: '原来你也在这里',
    artist: '刘若英',
    album: '我等你',
    duration: '4:28',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: [{ label: '原唱', theme: 'success' }]
  },
  {
    id: 6,
    index: 5,
    title: '原来你也在这里',
    artist: '刘若英',
    album: '我等你',
    duration: '4:28',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: [
      { label: '原唱', theme: 'success' },
      { label: 'Hot', theme: 'danger' }
    ]
  },
  {
    id: 7,
    index: 5,
    title: '原来你也在这里',
    artist: '刘若英',
    album: '我等你',
    duration: '4:28',
    albumArt: '/placeholder.svg',
    isPlaying: false,
    tags: [{ label: '原唱', theme: 'success' }]
  }
])
</script>

<template>
  <div class="list-container">
    <!-- 固定头部区域 -->
    <div class="fixed-header">
      <!-- 搜索结果标题 -->
      <h2 class="search-title"><span class="search-keyword">别让我担心</span> 的搜索结果</h2>

      <!-- 表格头部 -->
      <div class="table-header">
        <div class="header-item" style="justify-content: center">#</div>
        <div class="header-item">标题</div>
        <div class="header-item">专辑</div>
        <div class="header-item">时长</div>
      </div>
    </div>

    <!-- 可滚动的歌曲列表区域 -->
    <div class="scrollable-content">
      <div class="song-list">
        <div
          v-for="song in mockSongs"
          :key="song.id"
          class="song-item"
          :class="{
            'song-item--playing': song.isPlaying,
            'song-item--hovered': hoveredSong === song.id
          }"
          @mouseenter="hoveredSong = song.id"
          @mouseleave="hoveredSong = null"
        >
          <!-- Index/Play Icon -->
          <div class="song-index">
            <i v-if="song.isPlaying" class="iconfont icon-a-tingzhiwukuang playing-icon"></i>
            <i
              v-else-if="hoveredSong === song.id"
              class="iconfont icon-a-tingzhiwukuang play-icon"
            ></i>
            <span v-else class="index-number">{{ song.index }}</span>
          </div>

          <!-- Title and Artist -->
          <div class="song-info">
            <img :src="'/src/assets/images/cover.png'" :alt="song.title" class="album-art" />
            <div class="song-details">
              <div class="title-row">
                <span class="song-title" :class="{ 'song-title--playing': song.isPlaying }">
                  {{ song.title }}
                </span>
                <div class="tags">
                  <t-tag
                    v-for="(tag, index) in song.tags"
                    :key="index"
                    :theme="tag.theme"
                    variant="light-outline"
                    size="small"
                    shape="round"
                    class="song-tab"
                  >
                    {{ tag.label }}
                  </t-tag>
                </div>
              </div>
              <div class="artist-name">{{ song.artist }}</div>
            </div>
          </div>

          <!-- Album -->
          <div class="album-name">
            <span>{{ song.album }}</span>
          </div>

          <!-- Duration and Actions -->
          <div class="duration-actions">
            <span class="duration">{{ song.duration }}</span>
            <t-button
              v-if="hoveredSong === song.id"
              variant="text"
              size="small"
              class="more-button"
            >
              <i class="iconfont icon-gengduo"></i>
            </t-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.list-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1.5rem;
  padding-top: 0;
  overflow: hidden;

  .fixed-header {
    flex-shrink: 0;
    z-index: 10;

    .search-title {
      font-size: 1em;
      font-weight: 500;
      color: #9d9a9a;
      margin-bottom: 1.2rem;

      .search-keyword {
        font-size: 1.6rem;
        color: #f97316;
        font-weight: 600;
        line-height: 30px;
      }
    }

    .table-header {
      display: grid;
      grid-template-columns: 2.5rem 1fr 1fr 5rem;
      gap: 1rem;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      color: #6b7280;
      border-radius: 0.5rem 0.5rem 0 0;
      background-color: #efefef;

      .header-item {
        display: flex;
        align-items: center;
      }
    }
  }

  .scrollable-content {
    flex: 1;
    overflow-y: auto;
    padding-right: 0.25rem;
    padding-bottom: 4rem;

    /* 自定义滚动条样式 */
    &::-webkit-scrollbar {
      width: 0.375rem;
    }

    &::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 0.1875rem;
    }

    &::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 0.1875rem;
      transition: background-color 0.2s ease;

      &:hover {
        background: #94a3b8;
      }
    }

    /* Firefox 滚动条样式 */
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 #f1f5f9;
  }
}

.song-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 1rem;
  .song-item {
    display: grid;
    grid-template-columns: 2.5rem 1fr 1fr 5rem;
    gap: 1rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border-left: 0.1875rem solid transparent;
    border-radius: 0.5rem;
    background-color: #fff;

    &:hover {
      background-color: #f9fafb;
    }

    &--playing {
      background-color: #fff7ed;
      border-left-color: #f97316;
    }

    .song-index {
      display: flex;
      align-items: center;
      justify-content: center;

      .playing-icon {
        color: #f97316;
        font-size: 1rem;
      }

      .play-icon {
        color: #6b7280;
        font-size: 1rem;
      }

      .index-number {
        font-size: 0.875rem;
        color: #9ca3af;
      }
    }

    .song-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;

      .album-art {
        width: 3rem;
        height: 3rem;
        border-radius: 0.5rem;
        object-fit: cover;
        flex-shrink: 0;
        box-shadow: 0 1px 10px rgba(0, 0, 0, 0.3);
      }

      .song-details {
        min-width: 0;
        flex: 1;

        .title-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;

          .song-title {
            font-weight: 500;
            color: #111827;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;

            &--playing {
              color: #ea580c;
            }
          }

          .tags {
            display: flex;
            gap: 0.25rem;
            flex-shrink: 0;

            :deep(.t-tag) {
              font-size: 0.7rem !important;
              height: auto;
              margin-right: 0.25rem;
              padding: 0rem 0.5rem;
            }
          }
        }

        .artist-name {
          font-size: 0.875rem;
          color: #6b7280;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }
    }

    .album-name {
      display: flex;
      align-items: center;

      span {
        font-size: 0.875rem;
        color: #4b5563;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .duration-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .duration {
        font-size: 0.875rem;
        color: #9ca3af;
      }

      .more-button {
        opacity: 0;
        transition: opacity 0.2s ease;

        .iconfont {
          font-size: 1rem;
        }
      }
    }

    &:hover .more-button {
      opacity: 1;
    }
  }
}
</style>
