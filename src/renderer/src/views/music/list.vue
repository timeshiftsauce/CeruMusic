<script setup lang="ts">
import { ref, onMounted, toRaw, computed } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { downloadSingleSong } from '@renderer/utils/audio/download'

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
  _types: Record<string, any>
  typeUrl: Record<string, any>
}

// 路由实例
const route = useRoute()
const LocalUserDetail = LocalUserDetailStore()

// 响应式状态
const songs = ref<MusicItem[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const hasMore = ref(true)
const currentPage = ref(1)
const pageSize = 50
const currentSong = ref<MusicItem | null>(null)
const isPlaying = ref(false)
const playlistInfo = ref({
  id: '',
  title: '',
  author: '',
  cover: '',
  total: 0,
  source: '',
  desc: ''
})

// 获取歌单歌曲列表
const fetchPlaylistSongs = async () => {
  try {
    loading.value = true

    // 从路由参数中获取歌单信息
    playlistInfo.value = {
      id: route.params.id as string,
      title: (route.query.title as string) || '歌单',
      author: (route.query.author as string) || '未知',
      cover: (route.query.cover as string) || '',
      total: Number(route.query.total) || 0,
      source: (route.query.source as string) || (LocalUserDetail.userSource.source as any),
      desc: (route.query.desc as string) || ''
    }

    // 检查是否是本地歌单
    const isLocalPlaylist = route.query.type === 'local' || route.query.source === 'local'

    if (isLocalPlaylist) {
      // 处理本地歌单
      await fetchLocalPlaylistSongs()
    } else {
      // 处理网络歌单（重置并加载第一页）
      await fetchNetworkPlaylistSongs(true)
    }
  } catch (error) {
    console.error('获取歌单歌曲失败:', error)
  } finally {
    loading.value = false
  }
}

// 获取本地歌单歌曲
const fetchLocalPlaylistSongs = async () => {
  try {
    // 调用本地歌单API获取歌曲列表
    const result = await window.api.songList.getSongs(playlistInfo.value.id)

    if (result.success && result.data) {
      songs.value = result.data

      // 更新歌单信息中的歌曲总数
      playlistInfo.value.total = songs.value.length

      // 获取歌单详细信息
      const playlistResult = await window.api.songList.getById(playlistInfo.value.id)
      if (playlistResult.success && playlistResult.data) {
        const playlist = playlistResult.data

        playlistInfo.value = {
          ...playlistInfo.value,
          title: playlist.name,
          cover: playlist.coverImgUrl || playlistInfo.value.cover,
          total: songs.value.length,
          desc: playlist.description || ''
        }
      }
    } else {
      console.error('获取本地歌单失败:', result.error)
      songs.value = []
    }
  } catch (error) {
    console.error('获取本地歌单歌曲失败:', error)
    songs.value = []
  }
}

/**
 * 获取网络歌单歌曲，支持重置与分页追加
 * @param reset 是否重置为第一页
 */
const fetchNetworkPlaylistSongs = async (reset = false) => {
  try {
    // 并发保护：首次加载使用 loading，分页加载使用 loadingMore
    if ((reset && !loading.value) || (!reset && loadingMore.value)) return

    if (reset) {
      currentPage.value = 1
      hasMore.value = true
      songs.value = []
      loading.value = true
    } else {
      if (!hasMore.value) return
      loadingMore.value = true
    }

    // 检查是否是排行榜 (ID通常包含 source 前缀且在 leaderboard 列表中)
    // 这里简单通过 ID 格式判断，或者让调用方传入 type
    const isLeaderboard =
      playlistInfo.value.id.includes('__') ||
      ['wy', 'mg', 'kg', 'tx', 'kw'].some((s) => playlistInfo.value.id.startsWith(s + '_'))

    let method = 'getPlaylistDetail'
    let id = playlistInfo.value.id
    if (isLeaderboard) {
      method = 'getLeaderboardDetail'
      id = id.replace(/^.*__/, '')
      console.log(id)
    }
    const result = (await window.api.music.requestSdk(
      method as 'getPlaylistDetail' | 'getLeaderboardDetail',
      {
        source: playlistInfo.value.source,
        id,
        page: currentPage.value
      }
    )) as any
    console.log(result)
    const limit = Number(result?.limit ?? pageSize)
    const apiTotal = Number(result?.total ?? 0)

    if (result && Array.isArray(result.list)) {
      const newList = result.list
      const existed = new Set(songs.value.map((s) => s.songmid))
      const filtered = newList.filter((item: any) => !existed.has(item.songmid))
      const appendedCount = filtered.length

      if (reset) {
        songs.value = filtered
      } else {
        songs.value = [...songs.value, ...filtered]
      }

      // 获取新增歌曲封面
      setPic((currentPage.value - 1) * limit, playlistInfo.value.source)

      // 如果API返回了歌单详细信息，更新歌单信息
      if (result.info) {
        playlistInfo.value = {
          ...playlistInfo.value,
          title: result.info.name || playlistInfo.value.title,
          author: result.info.author || playlistInfo.value.author,
          cover: result.info.img || playlistInfo.value.cover,
          total: Number(apiTotal || result.info.total || playlistInfo.value.total || 0),
          desc: result.info.desc || ''
        }
      }

      // 更新分页状态
      currentPage.value += 1
      const total = Number(apiTotal || result.info?.total || playlistInfo.value.total || 0)
      if (total > 0) {
        hasMore.value = songs.value.length < total
      } else {
        hasMore.value = appendedCount > 0 && newList.length >= limit
      }
    } else {
      hasMore.value = false
    }
  } catch (error) {
    console.error('获取网络歌单失败:', error)
    if (reset) songs.value = []
    hasMore.value = false
  } finally {
    if (reset) {
      loading.value = false
    } else {
      loadingMore.value = false
    }
  }
}

// 获取歌曲封面
async function setPic(offset: number, source: string) {
  for (let i = offset; i < songs.value.length; i++) {
    const tempImg = songs.value[i].img
    if (tempImg) continue
    try {
      const url = await window.api.music.requestSdk('getPic', {
        source,
        songInfo: toRaw(songs.value[i])
      })

      if (typeof url !== 'object') {
        songs.value[i].img = url
      } else {
        songs.value[i].img = 'resources/logo.png'
      }
    } catch (e) {
      songs.value[i].img = 'logo.svg'
      console.log('获取封面失败 index' + i, e)
    }
  }
}

// 组件事件处理函数
const handlePlay = (song: MusicItem) => {
  currentSong.value = song
  isPlaying.value = true
  console.log('播放歌曲:', song.name)
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(song))
  }
}

const handlePause = () => {
  isPlaying.value = false
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('pause')
  }
}

const handleDownload = (song: any) => {
  downloadSingleSong(song)
}

const handleAddToPlaylist = (song: MusicItem) => {
  console.log('添加到播放列表:', song.name)
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistEnd', toRaw(song))
  }
}

// 从本地歌单移出歌曲
const handleRemoveFromLocalPlaylist = async (song: MusicItem) => {
  try {
    const result = await window.api.songList.removeSongs(playlistInfo.value.id, [song.songmid])

    if (result.success) {
      // 从当前歌曲列表中移除
      const index = songs.value.findIndex((s) => s.songmid === song.songmid)
      if (index !== -1) {
        songs.value.splice(index, 1)
        // 更新歌单信息中的歌曲总数
        playlistInfo.value.total = songs.value.length
      }
      MessagePlugin.success(`已将"${song.name}"从歌单中移出`)
    } else {
      MessagePlugin.error(result.error || '移出歌曲失败')
    }
  } catch (error) {
    console.error('移出歌曲失败:', error)
    MessagePlugin.error('移出歌曲失败')
  }
}

// 检查是否是本地歌单
const isLocalPlaylist = computed(() => {
  return route.query.type === 'local' || route.query.source === 'local'
})

// 文件选择器引用
const fileInputRef = ref<HTMLInputElement | null>(null)

// 滚动相关状态
const scrollY = ref(0)
const isHeaderCompact = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)

// 点击封面修改图片（仅本地歌单）
const handleCoverClick = () => {
  if (!isLocalPlaylist.value) return

  // 触发文件选择器
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    MessagePlugin.error('请选择图片文件')
    return
  }

  // 检查文件大小（限制为5MB）
  if (file.size > 5 * 1024 * 1024) {
    MessagePlugin.error('图片文件大小不能超过5MB')
    return
  }

  try {
    // 读取文件为base64
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64Data = e.target?.result as string

      try {
        // 调用API更新歌单封面
        const result = await window.api.songList.updateCover(playlistInfo.value.id, base64Data)

        if (result.success) {
          // 更新本地显示的封面
          playlistInfo.value.cover = base64Data
          MessagePlugin.success('封面更新成功')
        } else {
          MessagePlugin.error(result.error || '封面更新失败')
        }
      } catch (error) {
        console.error('更新封面失败:', error)
        MessagePlugin.error('封面更新失败')
      }
    }

    reader.onerror = () => {
      MessagePlugin.error('读取图片文件失败')
    }

    reader.readAsDataURL(file)
  } catch (error) {
    console.error('处理图片文件失败:', error)
    MessagePlugin.error('处理图片文件失败')
  }

  // 清空文件选择器的值，以便可以重复选择同一个文件
  target.value = ''
}

// 替换播放列表的通用函数
const replacePlaylist = (songsToReplace: MusicItem[], shouldShuffle = false) => {
  if (!(window as any).musicEmitter) {
    MessagePlugin.error('播放器未初始化')
    return
  }

  let finalSongs = [...songsToReplace]

  if (shouldShuffle) {
    // 创建歌曲索引数组并打乱
    const shuffledIndexes = Array.from({ length: songsToReplace.length }, (_, i) => i)
    for (let i = shuffledIndexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffledIndexes[i], shuffledIndexes[j]] = [shuffledIndexes[j], shuffledIndexes[i]]
    }

    // 按打乱的顺序重新排列歌曲
    finalSongs = shuffledIndexes.map((index) => songsToReplace[index])
  }

  // 使用自定义事件替换整个播放列表
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit(
      'replacePlaylist',
      finalSongs.map((song) => toRaw(song))
    )
  }

  // // 更新当前播放状态
  // if (finalSongs[0]) {
  //   currentSong.value = finalSongs[0]
  //   isPlaying.value = true
  // }
  // const playerSong = inject('PlaySong',(...args:any)=>args)
  // nextTick(()=>{
  //   playerSong(finalSongs[0])
  // })
  MessagePlugin.success(`请稍等歌曲加载完成播放`)
}

// 播放整个歌单
const handlePlayPlaylist = () => {
  if (songs.value.length === 0) {
    MessagePlugin.warning('歌单为空，无法播放')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '播放歌单',
    body: `确定要用歌单"${playlistInfo.value.title}"中的 ${playlistInfo.value.total || songs.value.length} 首歌曲替换当前播放列表吗？`,
    confirmBtn: '确定替换',
    cancelBtn: '取消',
    onConfirm: async () => {
      dialog.destroy()
      let loadingMsg: Promise<any> | null = null
      if (!isLocalPlaylist.value && hasMore.value) {
        loadingMsg = MessagePlugin.loading('正在加载全部歌曲...', 0)
        while (hasMore.value) {
          await fetchNetworkPlaylistSongs(false)
        }
        if (loadingMsg) {
          loadingMsg.then((res) => res.close())
        }
      }
      replacePlaylist(songs.value, false)
    },
    onCancel: () => {
      dialog.destroy()
    }
  })
}
// 随机播放歌单
const handleShufflePlaylist = () => {
  if (songs.value.length === 0) {
    MessagePlugin.warning('歌单为空，无法播放')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '随机播放歌单',
    body: `确定要用歌单"${playlistInfo.value.title}"中的 ${songs.value.length} 首歌曲随机替换当前播放列表吗？`,
    confirmBtn: '确定替换',
    cancelBtn: '取消',
    onConfirm: async () => {
      dialog.destroy()
      let loadingMsg: Promise<any> | null = null
      if (!isLocalPlaylist.value && hasMore.value) {
        loadingMsg = MessagePlugin.loading('正在加载全部歌曲...', 0)
        while (hasMore.value) {
          await fetchNetworkPlaylistSongs(false)
        }
        if (loadingMsg) {
          loadingMsg.then((res) => res.close())
        }
      }
      replacePlaylist(songs.value, true)
    },
    onCancel: () => {
      dialog.destroy()
    }
  })
}
/**
 * 滚动事件处理：更新头部紧凑状态，并在接近底部时触发分页加载
 */
const handleScroll = (event?: Event) => {
  let scrollTop = 0
  let scrollHeight = 0
  let clientHeight = 0

  if (event && event.target) {
    const target = event.target as HTMLElement
    scrollTop = target.scrollTop
    scrollHeight = target.scrollHeight
    clientHeight = target.clientHeight
  } else if (scrollContainer.value) {
    scrollTop = scrollContainer.value.scrollTop
    scrollHeight = scrollContainer.value.scrollHeight
    clientHeight = scrollContainer.value.clientHeight
  }

  scrollY.value = scrollTop
  // 当滚动超过100px时，启用紧凑模式
  isHeaderCompact.value = scrollY.value > 100 && scrollHeight > clientHeight + 100

  // 触底加载（参考 search.vue）
  if (
    scrollHeight > 0 &&
    scrollHeight - scrollTop - clientHeight < 100 &&
    !loadingMore.value &&
    hasMore.value &&
    !isLocalPlaylist.value
  ) {
    fetchNetworkPlaylistSongs(false)
  }
}

// 组件挂载时获取数据
onMounted(() => {
  fetchPlaylistSongs()
})
</script>

<template>
  <div class="list-container">
    <!-- 固定头部区域 -->
    <div class="fixed-header" :class="{ compact: isHeaderCompact }">
      <!-- 歌单信息 -->
      <div class="playlist-header" :class="{ compact: isHeaderCompact }">
        <div
          class="playlist-cover"
          :class="{ clickable: isLocalPlaylist }"
          @click="handleCoverClick"
        >
          <img :src="playlistInfo.cover" :alt="playlistInfo.title" />
          <!-- 本地歌单显示编辑提示 -->
          <div v-if="isLocalPlaylist" class="cover-overlay">
            <svg class="edit-icon" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
              />
            </svg>
            <span>点击修改封面</span>
          </div>
        </div>
        <!-- 隐藏的文件选择器 -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleFileSelect"
        />
        <div class="playlist-details">
          <h1 class="playlist-title">{{ playlistInfo.title }}</h1>
          <n-collapse-transition :show="!isHeaderCompact">
            <p class="playlist-desc">
              {{ playlistInfo.desc || 'By ' + playlistInfo.source }}
            </p>
            <p class="playlist-stats">{{ playlistInfo.total || songs.length }} 首歌曲</p>
          </n-collapse-transition>
          <!-- 播放控制按钮 -->
          <div class="playlist-actions">
            <t-button
              theme="primary"
              size="medium"
              :disabled="songs.length === 0 || loading"
              class="play-btn"
              @click="handlePlayPlaylist"
            >
              <template #icon>
                <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </template>
              播放全部
            </t-button>

            <t-button
              variant="outline"
              size="medium"
              :disabled="songs.length === 0 || loading"
              class="shuffle-btn"
              @click="handleShufflePlaylist"
            >
              <template #icon>
                <svg class="shuffle-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
                  />
                </svg>
              </template>
              随机播放
            </t-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 可滚动的歌曲列表区域 -->
    <div class="scrollable-content">
      <div v-if="loading" class="loading-container">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <p>加载中...</p>
        </div>
      </div>

      <div v-else class="song-list-wrapper">
        <SongVirtualList
          ref="songListRef"
          :songs="songs"
          :current-song="currentSong"
          :is-playing="isPlaying"
          :show-index="true"
          :show-album="true"
          :show-duration="true"
          :is-local-playlist="isLocalPlaylist"
          :playlist-id="playlistInfo.id"
          @play="handlePlay"
          @pause="handlePause"
          @download="handleDownload"
          @add-to-playlist="handleAddToPlaylist"
          @remove-from-local-playlist="handleRemoveFromLocalPlaylist"
          @scroll="handleScroll"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.list-container {
  box-sizing: border-box;
  // background: var(--list-bg-primary);
  width: 100%;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;

  .fixed-header {
    margin-bottom: 20px;
    flex-shrink: 0;
  }

  .scrollable-content {
    background: var(--list-content-bg);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--list-content-shadow);
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;

  .loading-content {
    text-align: center;

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid var(--list-loading-border);
      border-top: 4px solid var(--list-loading-spinner);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }

    p {
      font-size: 14px;
      color: var(--list-loading-text);
      margin: 0;
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.playlist-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  height: 240px;
  background: var(--list-header-bg);
  border-radius: 0.75rem;
  box-shadow: var(--list-header-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &.compact {
    padding: 1rem;
    gap: 1rem;
  }

  &.compact {
    height: 120px;
    .playlist-details .playlist-title {
      font-size: 25px;
    }
  }
  .playlist-cover {
    height: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 0.5rem;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.2s ease;
    }

    // 本地歌单封面可点击样式
    &.clickable {
      cursor: pointer;

      &:hover {
        .cover-overlay {
          opacity: 1;
        }

        img {
          transform: scale(1.05);
        }
      }
    }

    .cover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--list-cover-overlay);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s ease;
      color: white;
      font-size: 12px;
      text-align: center;
      padding: 8px;

      .edit-icon {
        width: 24px;
        height: 24px;
        margin-bottom: 4px;
      }

      span {
        font-weight: 500;
        line-height: 1.2;
      }
    }
  }

  .playlist-details {
    font-family: lyricfont;

    flex: 1;
    .playlist-title {
      line-height: 1em;
      font-size: 34px;
      font-weight: 800;
      color: var(--list-title-color);
      margin: 0 0 0.5rem 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      .playlist-header.compact & {
        font-size: 1.25rem;
        margin: 0 0 0.25rem 0;
      }
    }

    .playlist-desc {
      font-size: 1rem;
      color: var(--list-author-color);
      // margin: 1.5rem 0 0.5rem 0;
      transition: all 0.3s;
      opacity: 1;
      transform: translateY(0);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      text-overflow: ellipsis;
      overflow: hidden;
      width: 100%;
      &.hidden {
        opacity: 0;
        transform: translateY(-10px);
        margin: 0;
        height: 0;
        overflow: hidden;
      }
    }

    .playlist-stats {
      font-size: 0.875rem;
      color: var(--list-stats-color);
      padding: 5px 0 0 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 1;
      transform: translateY(0);

      &.hidden {
        opacity: 0;
        transform: translateY(-10px);
        margin: 0;
        height: 0;
        overflow: hidden;
      }
    }

    .playlist-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1rem;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      &.compact {
        margin-top: 0.5rem;
        gap: 0.5rem;
      }

      .play-btn,
      .shuffle-btn {
        min-width: 120px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

        .playlist-actions.compact & {
          min-width: 100px;
          padding: 6px 12px;
          font-size: 0.875rem;
        }

        .play-icon,
        .shuffle-icon {
          width: 16px;
          height: 16px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

          .playlist-actions.compact & {
            width: 14px;
            height: 14px;
          }
        }
      }
    }
  }
}

.song-list-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .list-container {
    padding: 15px;
  }

  .playlist-header {
    flex-direction: column;
    text-align: center;
    gap: 1rem;

    .playlist-cover {
      width: 100px;
      height: 100px;
    }

    .playlist-details {
      .playlist-actions {
        flex-direction: column;
        gap: 0.5rem;

        .play-btn,
        .shuffle-btn {
          width: 100%;
          min-width: auto;
        }
      }
    }
  }
}

@media (max-width: 480px) {
  .playlist-header {
    .playlist-details {
      .playlist-actions {
        .play-btn,
        .shuffle-btn {
          .play-icon,
          .shuffle-icon {
            width: 14px;
            height: 14px;
          }
        }
      }
    }
  }
}
</style>
