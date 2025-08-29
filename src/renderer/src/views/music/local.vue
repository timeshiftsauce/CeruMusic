<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

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

// 歌单相关功能
interface Playlist {
  id: number
  name: string
  songs: any[]
  createdAt: string
  updatedAt: string
}

const playlists = ref<Playlist[]>([
  {
    id: 1,
    name: '我喜欢的音乐',
    songs: [localSongs.value[0], localSongs.value[2]],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 2,
    name: '周杰伦精选',
    songs: [localSongs.value[1], localSongs.value[3], localSongs.value[4]],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
])

// 当前选中的歌单
const currentPlaylist = ref<Playlist | null>(null)

// 显示歌单对话框
const showPlaylistDialog = ref(false)
const showCreatePlaylistDialog = ref(false)
const newPlaylistName = ref('')

// 创建新歌单
const createPlaylist = () => {
  if (!newPlaylistName.value.trim()) {
    MessagePlugin.warning('歌单名称不能为空')
    return
  }

  const newPlaylist: Playlist = {
    id: playlists.value.length + 1,
    name: newPlaylistName.value,
    songs: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  playlists.value.push(newPlaylist)
  newPlaylistName.value = ''
  showCreatePlaylistDialog.value = false
  MessagePlugin.success('歌单创建成功')
}

// 将当前播放列表保存为歌单
const saveCurrentPlaylistAs = () => {
  showCreatePlaylistDialog.value = true
}

// 一键播放歌单
const playPlaylist = (playlist: Playlist) => {
  if (playlist.songs.length === 0) {
    MessagePlugin.warning('歌单中没有歌曲')
    return
  }

  // 这里应该调用播放器的方法替换播放列表
  console.log('播放歌单:', playlist.name, '共', playlist.songs.length, '首歌曲')
  MessagePlugin.success(`已将播放列表替换为歌单"${playlist.name}"`)
}

// 查看歌单详情
const viewPlaylist = (playlist: Playlist) => {
  currentPlaylist.value = playlist
  showPlaylistDialog.value = true
}

// 添加歌曲到歌单
const addToPlaylist = (song: any, playlist: Playlist) => {
  // 检查歌曲是否已在歌单中
  const exists = playlist.songs.some((s) => s.id === song.id)
  if (exists) {
    MessagePlugin.warning(`歌曲"${song.title}"已在歌单中`)
    return
  }

  playlist.songs.push(song)
  playlist.updatedAt = new Date().toISOString()
  MessagePlugin.success(`已将"${song.title}"添加到歌单"${playlist.name}"`)
}

// 从歌单中移除歌曲
const removeFromPlaylist = (songId: number, playlist: Playlist) => {
  const index = playlist.songs.findIndex((s) => s.id === songId)
  if (index !== -1) {
    const songTitle = playlist.songs[index].title
    playlist.songs.splice(index, 1)
    playlist.updatedAt = new Date().toISOString()
    MessagePlugin.success(`已从歌单"${playlist.name}"中移除"${songTitle}"`)
  }
}

// 删除歌单
const deletePlaylist = (playlistId: number) => {
  const index = playlists.value.findIndex((p) => p.id === playlistId)
  if (index !== -1) {
    const playlistName = playlists.value[index].name
    playlists.value.splice(index, 1)

    // 如果正在查看的歌单被删除，关闭对话框
    if (currentPlaylist.value && currentPlaylist.value.id === playlistId) {
      currentPlaylist.value = null
      showPlaylistDialog.value = false
    }

    MessagePlugin.success(`已删除歌单"${playlistName}"`)
  }
}
</script>

<template>
  <div>
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
          <t-button theme="default" @click="saveCurrentPlaylistAs">
            <i class="iconfont icon-baocun"></i>
            保存为歌单
          </t-button>
        </div>
      </div>

      <!-- 歌单区域 -->
      <div class="playlists-section">
        <div class="section-header">
          <h3>我的歌单</h3>
          <t-button theme="primary" variant="text" @click="showCreatePlaylistDialog = true">
            <i class="iconfont icon-zengjia"></i>
            新建歌单
          </t-button>
        </div>

        <div class="playlists-grid">
          <div v-for="playlist in playlists" :key="playlist.id" class="playlist-card">
            <div class="playlist-cover" @click="viewPlaylist(playlist)">
              <div class="cover-overlay">
                <i class="iconfont icon-bofang"></i>
              </div>
            </div>
            <div class="playlist-info">
              <div class="playlist-name" @click="viewPlaylist(playlist)">{{ playlist.name }}</div>
              <div class="playlist-meta">{{ playlist.songs.length }}首歌曲</div>
            </div>
            <div class="playlist-actions">
              <t-button
                shape="circle"
                theme="primary"
                variant="text"
                size="small"
                title="播放歌单"
                @click="playPlaylist(playlist)"
              >
                <i class="iconfont icon-a-tingzhiwukuang"></i>
              </t-button>
              <t-button
                shape="circle"
                theme="default"
                variant="text"
                size="small"
                title="查看详情"
                @click="viewPlaylist(playlist)"
              >
                <i class="iconfont icon-liebiao"></i>
              </t-button>
              <t-button
                shape="circle"
                theme="danger"
                variant="text"
                size="small"
                title="删除歌单"
                @click="deletePlaylist(playlist.id)"
              >
                <i class="iconfont icon-shanchu"></i>
              </t-button>
            </div>
          </div>
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
              <t-dropdown
                :options="[
                  {
                    content: '添加到歌单',
                    value: 'addToPlaylist',
                    children: playlists.map((p) => ({ content: p.name, value: `playlist-${p.id}` }))
                  }
                ]"
                @click="
                  (data) => {
                    if (data.startsWith('playlist-')) {
                      const playlistId = parseInt(data.split('-')[1])
                      const targetPlaylist = playlists.find((p) => p.id === playlistId)
                      if (targetPlaylist) {
                        addToPlaylist(song, targetPlaylist)
                      }
                    }
                  }
                "
              >
                <t-button shape="circle" theme="default" variant="text" size="small" title="更多">
                  <i class="iconfont icon-gengduo"></i>
                </t-button>
              </t-dropdown>
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

    <!-- 创建歌单对话框 -->
    <t-dialog
      v-model:visible="showCreatePlaylistDialog"
      header="创建新歌单"
      :confirm-btn="{ content: '创建', theme: 'primary' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="createPlaylist"
    >
      <t-input
        v-model="newPlaylistName"
        placeholder="请输入歌单名称"
        clearable
        @keyup.enter="createPlaylist"
      />
    </t-dialog>

    <!-- 歌单详情对话框 -->
    <t-dialog
      v-model:visible="showPlaylistDialog"
      :header="currentPlaylist?.name || '歌单详情'"
      width="800px"
      :footer="false"
    >
      <template v-if="currentPlaylist">
        <div class="playlist-header">
          <div class="playlist-info">
            <h3>{{ currentPlaylist.name }}</h3>
            <div class="playlist-meta">
              <span>{{ currentPlaylist.songs.length }} 首歌曲</span>
              <span>创建于 {{ new Date(currentPlaylist.createdAt).toLocaleDateString() }}</span>
            </div>
          </div>
          <div class="playlist-actions">
            <t-button theme="primary" @click="playPlaylist(currentPlaylist)">
              <i class="iconfont icon-a-tingzhiwukuang"></i>
              一键播放
            </t-button>
          </div>
        </div>

        <div class="playlist-songs">
          <div class="list-header">
            <div class="header-item index">#</div>
            <div class="header-item title">标题</div>
            <div class="header-item artist">艺术家</div>
            <div class="header-item album">专辑</div>
            <div class="header-item duration">时长</div>
            <div class="header-item actions">操作</div>
          </div>

          <div class="list-body">
            <div
              v-for="(song, index) in currentPlaylist.songs"
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
                <t-button
                  shape="circle"
                  theme="danger"
                  variant="text"
                  size="small"
                  title="从歌单中移除"
                  @click="removeFromPlaylist(song.id, currentPlaylist)"
                >
                  <i class="iconfont icon-shanchu"></i>
                </t-button>
              </div>
            </div>
          </div>

          <div v-if="currentPlaylist.songs.length === 0" class="empty-playlist">
            <p>歌单中暂无歌曲</p>
          </div>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<style lang="scss" scoped>
.local-container {
  padding: 2rem;
  margin: 0 auto;
  width: 100%;
  position: relative;
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
  width: 100%;
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.list-header {
  display: grid;
  width: 100%;
  grid-template-columns: 0.5fr 2fr 1fr 3fr 1fr 1fr 1fr 1fr;

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
    grid-template-columns: 0.5fr 2fr 1fr 3fr 1fr 1fr 1fr 1fr;

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

/* 歌单区域样式 */
.playlists-section {
  margin-bottom: 2rem;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;

    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
    }
  }
}

.playlists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.playlist-card {
  background: #fff;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

    .playlist-cover .cover-overlay {
      opacity: 1;
    }
  }

  .playlist-cover {
    height: 160px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    position: relative;
    cursor: pointer;

    .cover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;

      .iconfont {
        font-size: 3rem;
        color: #fff;
      }
    }
  }

  .playlist-info {
    padding: 1rem;

    .playlist-name {
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.25rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;

      &:hover {
        color: #4f46e5;
      }
    }

    .playlist-meta {
      font-size: 0.75rem;
      color: #6b7280;
    }
  }

  .playlist-actions {
    display: flex;
    justify-content: flex-end;
    padding: 0 1rem 1rem;
    gap: 0.5rem;
  }
}

/* 歌单详情对话框样式 */
.playlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;

  .playlist-info {
    h3 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.5rem;
    }

    .playlist-meta {
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
}

.playlist-songs {
  .list-header {
    grid-template-columns: 0.5fr 2fr 1fr 3fr 1fr 1fr;
  }

  .list-body .song-row {
    grid-template-columns: 0.5fr 2fr 1fr 3fr 1fr 1fr;
  }
}

.empty-playlist {
  text-align: center;
  padding: 2rem;
  color: #6b7280;
}
</style>
