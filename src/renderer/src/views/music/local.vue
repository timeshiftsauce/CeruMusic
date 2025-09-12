<script setup lang="ts">
import { ref, onMounted, computed, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { Edit2Icon, ListIcon } from 'tdesign-icons-vue-next'
import songListAPI from '@renderer/api/songList'
import type { SongList, Songs } from '@common/types/songList'
import defaultCover from '/default-cover.png'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

// 扩展 Songs 类型以包含本地音乐的额外属性
interface LocalSong extends Songs {
  path?: string
  size?: string
  format?: string
  bitrate?: string
}

// 本地音乐数据（示例数据，实际应该从本地文件系统获取）
const localSongs = ref<LocalSong[]>([
  {
    songmid: 'local_001',
    name: '夜曲',
    singer: '周杰伦',
    albumName: '十一月的萧邦',
    albumId: 'album_001',
    interval: '3:37', // 使用 interval 而不是 duration
    source: 'local',
    img: '',
    lrc: null,
    types: ['mp3'],
    _types: {},
    typeUrl: {},
    path: '/music/夜曲.mp3',
    size: '8.5 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    songmid: 'local_002',
    name: '青花瓷',
    singer: '周杰伦',
    albumName: '我很忙',
    albumId: 'album_002',
    interval: '3:58',
    source: 'local',
    img: '',
    lrc: null,
    types: ['mp3'],
    _types: {},
    typeUrl: {},
    path: '/music/青花瓷.mp3',
    size: '9.2 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    songmid: 'local_003',
    name: '稻香',
    singer: '周杰伦',
    albumName: '魔杰座',
    albumId: 'album_003',
    interval: '3:43',
    source: 'local',
    img: '',
    lrc: null,
    types: ['mp3'],
    _types: {},
    typeUrl: {},
    path: '/music/稻香.mp3',
    size: '8.8 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    songmid: 'local_004',
    name: '告白气球',
    singer: '周杰伦',
    albumName: '周杰伦的床边故事',
    albumId: 'album_004',
    interval: '3:34',
    source: 'local',
    img: '',
    lrc: null,
    types: ['mp3'],
    _types: {},
    typeUrl: {},
    path: '/music/告白气球.mp3',
    size: '8.4 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  },
  {
    songmid: 'local_005',
    name: '七里香',
    singer: '周杰伦',
    albumName: '七里香',
    albumId: 'album_005',
    interval: '4:05',
    source: 'local',
    img: '',
    lrc: null,
    types: ['mp3'],
    _types: {},
    typeUrl: {},
    path: '/music/七里香.mp3',
    size: '9.6 MB',
    format: 'MP3',
    bitrate: '320 kbps'
  }
])

// 歌单列表
const playlists = ref<SongList[]>([])
const loading = ref(false)

// 对话框状态
const showCreatePlaylistDialog = ref(false)
const showImportDialog = ref(false)
const showEditPlaylistDialog = ref(false)

// 表单数据
const newPlaylistForm = ref({
  name: '我的歌单',
  description: '这是我创建的歌单'
})

// 编辑歌单表单数据
const editPlaylistForm = ref({
  name: '',
  description: ''
})

// 当前编辑的歌单
const currentEditingPlaylist = ref<SongList | null>(null)

// 将时长字符串转换为秒数
const parseInterval = (interval: string): number => {
  if (!interval) return 0
  const parts = interval.split(':')
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]) || 0
    const seconds = parseInt(parts[1]) || 0
    return minutes * 60 + seconds
  }
  return 0
}

// 格式化时长（从秒数转换为 mm:ss 格式）
const formatDuration = (seconds: number): string => {
  if (!seconds) return '0:00'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// 统计信息
const stats = computed(() => {
  const totalDurationSeconds = localSongs.value.reduce((sum, song) => {
    return sum + parseInterval(song.interval || '0:00')
  }, 0)

  const totalSize = localSongs.value.reduce((sum, song) => {
    const sizeStr = song.size || '0 MB'
    const sizeNum = parseFloat(sizeStr.replace(/[^\d.]/g, ''))
    return sum + sizeNum
  }, 0)

  return {
    totalSongs: localSongs.value.length,
    totalDuration: formatDuration(totalDurationSeconds),
    totalSize: `${totalSize.toFixed(1)} MB`
  }
})

// 加载歌单列表
const loadPlaylists = async () => {
  loading.value = true
  try {
    const result = await songListAPI.getAll()
    if (result.success) {
      playlists.value = result.data || []
    } else {
      MessagePlugin.error(result.error || '加载歌单失败')
    }
  } catch (error) {
    console.error('加载歌单失败:', error)
    MessagePlugin.error('加载歌单失败')
  } finally {
    loading.value = false
  }
}

// 创建新歌单
const createPlaylist = async () => {
  if (!newPlaylistForm.value.name.trim()) {
    MessagePlugin.warning('歌单名称不能为空')
    return
  }

  try {
    const result = await songListAPI.create(
      newPlaylistForm.value.name,
      newPlaylistForm.value.description,
      'local'
    )

    if (result.success) {
      MessagePlugin.success('歌单创建成功')
      showCreatePlaylistDialog.value = false
      newPlaylistForm.value = {
        name: '我的歌单',
        description: '这是我创建的歌单'
      }
      await loadPlaylists()
    } else {
      MessagePlugin.error(result.error || '创建歌单失败')
    }
  } catch (error) {
    console.error('创建歌单失败:', error)
    MessagePlugin.error('创建歌单失败')
  }
}

// 编辑歌单
const editPlaylist = (playlist: SongList) => {
  currentEditingPlaylist.value = playlist
  editPlaylistForm.value = {
    name: playlist.name,
    description: playlist.description || ''
  }
  showEditPlaylistDialog.value = true
}

// 保存歌单编辑
const savePlaylistEdit = async () => {
  if (!currentEditingPlaylist.value) return

  if (!editPlaylistForm.value.name.trim()) {
    MessagePlugin.warning('歌单名称不能为空')
    return
  }

  try {
    const result = await songListAPI.edit(currentEditingPlaylist.value.id, {
      name: editPlaylistForm.value.name.trim(),
      description: editPlaylistForm.value.description.trim()
    })

    if (result.success) {
      MessagePlugin.success('歌单信息更新成功')
      showEditPlaylistDialog.value = false
      currentEditingPlaylist.value = null
      await loadPlaylists()
    } else {
      MessagePlugin.error(result.error || '更新歌单信息失败')
    }
  } catch (error) {
    console.error('更新歌单信息失败:', error)
    MessagePlugin.error('更新歌单信息失败')
  }
}

// 取消编辑歌单
const cancelPlaylistEdit = () => {
  showEditPlaylistDialog.value = false
  currentEditingPlaylist.value = null
  editPlaylistForm.value = {
    name: '',
    description: ''
  }
}

// 删除歌单
const deletePlaylist = async (playlist: SongList) => {
  const confirmDialog = DialogPlugin.confirm({
    header: '确认删除',
    body: `确定要删除歌单"${playlist.name}"吗？此操作不可撤销。`,
    confirmBtn: '删除',
    cancelBtn: '取消',
    theme: 'danger',
    onConfirm: async () => {
      try {
        const result = await songListAPI.delete(playlist.id)
        if (result.success) {
          MessagePlugin.success('歌单删除成功')
          await loadPlaylists()

          // 歌单删除成功，无需额外处理
        } else {
          MessagePlugin.error(result.error || '删除歌单失败')
        }
      } catch (error) {
        console.error('删除歌单失败:', error)
        MessagePlugin.error('删除歌单失败')
      }
      confirmDialog.destroy()
    },
    onCancel: () => {
      confirmDialog.destroy()
    }
  })
}

// 初始化路由
const router = useRouter()

// 查看歌单详情
const viewPlaylist = (playlist: SongList) => {
  // 跳转到 list 页面，传递歌单信息作为查询参数
  router.push({
    name: 'list',
    params: { id: playlist.id },
    query: {
      title: playlist.name,
      author: 'local',
      cover: playlist.coverImgUrl || '',
      total: '0', // 这里可以后续优化为实际歌曲数量
      source: 'local',
      type: 'local' // 标识这是本地歌单
    }
  })
}

// 播放歌单
const playPlaylist = async (playlist: SongList) => {
  try {
    const result = await songListAPI.getSongs(playlist.id)
    if (result.success) {
      const songs = result.data || []
      if (songs.length === 0) {
        MessagePlugin.warning('歌单中没有歌曲')
        return
      }

      // 调用播放器的方法替换播放列表
      if ((window as any).musicEmitter) {
        ;(window as any).musicEmitter.emit(
          'replacePlaylist',
          songs.map((song) => toRaw(song))
        )
      }
      console.log('播放歌单:', playlist.name, '共', songs.length, '首歌曲')
      MessagePlugin.success(`已将播放列表替换为歌单"${playlist.name}"`)
    } else {
      MessagePlugin.error(result.error || '获取歌单歌曲失败')
    }
  } catch (error) {
    console.error('播放歌单失败:', error)
    MessagePlugin.error('播放歌单失败')
  }
}

// 添加歌曲到歌单
const addToPlaylist = async (song: Songs, playlist: SongList) => {
  try {
    const result = await songListAPI.addSongs(playlist.id, [song])
    if (result.success) {
      MessagePlugin.success(`已将"${song.name}"添加到歌单"${playlist.name}"`)
    } else {
      MessagePlugin.error(result.error || '添加歌曲失败')
    }
  } catch (error) {
    console.error('添加歌曲失败:', error)
    MessagePlugin.error('添加歌曲失败')
  }
}

// 播放歌曲
const playSong = (song: Songs): void => {
  console.log('播放歌曲:', song.name)
  // 调用播放器的方法添加到播放列表并播放
  if ((window as any).musicEmitter) {
    ;(window as any).musicEmitter.emit('addToPlaylistAndPlay', toRaw(song))
  }
}

// 导入功能
const handleImport = () => {
  showImportDialog.value = true
}

// 从播放列表导入
const importFromPlaylist = async () => {
  showImportDialog.value = false

  // 获取当前播放列表
  const localUserStore = LocalUserDetailStore()
  const currentPlaylist = JSON.parse(JSON.stringify(localUserStore.list))

  if (!currentPlaylist || currentPlaylist.length === 0) {
    MessagePlugin.warning('当前播放列表为空，无法导入')
    return
  }

  try {
    // 创建歌单名称（基于当前时间）
    const now = new Date()
    const playlistName = `播放列表 ${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    // 创建新歌单
    const createResult = await songListAPI.create(
      playlistName,
      `从播放列表导入，共 ${currentPlaylist.length} 首歌曲`,
      'local'
    )

    if (!createResult.success || !createResult.data) {
      MessagePlugin.error(createResult.error || '创建歌单失败')
      return
    }

    // 等待一小段时间确保文件系统操作完成
    await new Promise((resolve) => setTimeout(resolve, 200))

    // 将播放列表中的歌曲添加到新歌单
    const addResult = await songListAPI.addSongs(createResult.data.id, currentPlaylist)

    if (addResult.success) {
      MessagePlugin.success(
        `成功从播放列表导入 ${currentPlaylist.length} 首歌曲到歌单"${playlistName}"`
      )
      // 刷新歌单列表
      await loadPlaylists()
    } else {
      MessagePlugin.error(addResult.error || '添加歌曲到歌单失败')
    }
  } catch (error) {
    console.error('从播放列表导入失败:', error)
    MessagePlugin.error('从播放列表导入失败')
  }
}

// 网络歌单导入对话框状态
const showNetworkImportDialog = ref(false)
const networkPlaylistUrl = ref('')

// 从网络歌单导入
const importFromNetwork = () => {
  showImportDialog.value = false
  showNetworkImportDialog.value = true
  networkPlaylistUrl.value = ''
}

// 确认网络歌单导入
const confirmNetworkImport = async () => {
  if (!networkPlaylistUrl.value || !networkPlaylistUrl.value.trim()) {
    MessagePlugin.warning('请输入有效的歌单链接')
    return
  }

  showNetworkImportDialog.value = false
  await handleNetworkPlaylistImport(networkPlaylistUrl.value.trim())
}

// 取消网络歌单导入
const cancelNetworkImport = () => {
  showNetworkImportDialog.value = false
  networkPlaylistUrl.value = ''
}

// 处理网络歌单导入
const handleNetworkPlaylistImport = async (input: string) => {
  try {
    const load1 = MessagePlugin.loading('正在解析歌单链接...')

    // 使用正则表达式匹配网易云音乐歌单ID
    const playlistIdRegex = /(?:music\.163\.com\/.*[?&]id=|playlist\?id=|playlist\/|id=)(\d+)/i
    const match = input.match(playlistIdRegex)

    let playlistId: string

    if (match && match[1]) {
      // 从链接中提取到歌单ID
      playlistId = match[1]
    } else {
      // 检查是否直接输入的是纯数字ID
      const numericMatch = input.match(/^\d+$/)
      if (numericMatch) {
        playlistId = input
      } else {
        MessagePlugin.error('无法识别的歌单链接或ID格式，请输入网易云音乐歌单链接或歌单ID')
        return
      }
    }

    // 验证歌单ID是否有效
    if (!playlistId || playlistId.length < 6) {
      MessagePlugin.error('歌单ID格式不正确')
      load1.then((res) => res.close())

      return
    }

    // 关闭加载提示
    load1.then((res) => res.close())

    // 获取歌单详情
    const load2 = MessagePlugin.loading('正在获取歌单信息...')
    let detailResult: any
    try {
      detailResult = (await window.api.music.requestSdk('getPlaylistDetail', {
        source: 'wy',
        id: playlistId,
        page: 1
      })) as any
    } catch {
      MessagePlugin.error('获取歌单详情失败：歌曲信息可能有误')
      load2.then((res) => res.close())

      return
    }
    if (detailResult.error) {
      MessagePlugin.error('获取歌单详情失败：' + detailResult.error)
      load2.then((res) => res.close())

      return
    }
    const playlistInfo = detailResult.info
    const songs = detailResult.list || []

    if (songs.length === 0) {
      MessagePlugin.warning('该歌单没有歌曲')
      load2.then((res) => res.close())

      return
    }

    const createResult = await songListAPI.create(
      `${playlistInfo.name} (导入)`,
      `从网易云音乐导入 - 原歌单：${playlistInfo.name}`,
      'wy'
    )
    const newPlaylistId = createResult.data!.id
    await songListAPI.updateCover(newPlaylistId, detailResult.info.img)
    if (!createResult.success) {
      MessagePlugin.error('创建本地歌单失败：' + createResult.error)
      return
    }

    const addResult = await songListAPI.addSongs(newPlaylistId, songs)

    let successCount = 0
    let failCount = 0

    if (addResult.success) {
      successCount = songs.length
      failCount = 0
    } else {
      successCount = 0
      failCount = songs.length
      console.error('批量添加歌曲失败:', addResult.error)
    }
    load2.then((res) => res.close())

    // 刷新歌单列表
    await loadPlaylists()

    // 显示导入结果
    if (successCount > 0) {
      MessagePlugin.success(
        `导入完成！成功导入 ${successCount} 首歌曲` +
          (failCount > 0 ? `，${failCount} 首歌曲导入失败` : '')
      )
    } else {
      MessagePlugin.error('导入失败，没有成功导入任何歌曲')
    }
  } catch (error) {
    console.error('网络歌单导入失败:', error)
    MessagePlugin.error('导入失败：' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 打开音乐文件夹
// const openMusicFolder = (): void => {
//   console.log('打开音乐文件夹')
//   // TODO: 调用 Electron 的文件夹打开功能
//   MessagePlugin.info('打开音乐文件夹功能开发中...')
// }

// 导入音乐文件
const importMusic = (): void => {
  console.log('导入音乐文件')
  // TODO: 调用 Electron 的文件选择对话框
  MessagePlugin.info('导入音乐文件功能开发中...')
}

// 删除本地歌曲
const deleteSong = (song: Songs): void => {
  const confirmDialog = DialogPlugin.confirm({
    header: '确认删除',
    body: `确定要删除歌曲"${song.name}"吗？`,
    confirmBtn: '删除',
    cancelBtn: '取消',
    theme: 'danger',
    onConfirm: () => {
      // TODO: 实现删除本地歌曲的功能
      console.log('删除歌曲:', song.name)
      MessagePlugin.success(`已删除歌曲"${song.name}"`)
      confirmDialog.destroy()
    },
    onCancel: () => {
      confirmDialog.destroy()
    }
  })
}

// 组件挂载时加载数据
onMounted(() => {
  loadPlaylists()
})
</script>

<template>
  <div>
    <div class="local-container">
      <!-- 页面标题和操作 -->
      <div class="page-header">
        <div class="header-left">
          <h2>本地歌单</h2>
          <div class="stats">
            <span>{{ stats.totalSongs }} 首本地歌曲</span>
            <span>总时长 {{ stats.totalDuration }}</span>
            <span>总大小 {{ stats.totalSize }}</span>
          </div>
        </div>
        <div class="header-actions">
          <!-- <t-button theme="default" @click="openMusicFolder">
            <i class="iconfont icon-shouye"></i>
            打开文件夹
          </t-button>
          <t-button theme="primary" @click="importMusic">
            <i class="iconfont icon-zengjia"></i>
            导入音乐
          </t-button> -->
          <t-button theme="primary" variant="outline" @click="showCreatePlaylistDialog = true">
            <i class="iconfont icon-zengjia"></i>
            新建歌单
          </t-button>
          <t-button theme="primary" @click="handleImport">
            <i class="iconfont icon-daoru"></i>
            导入
          </t-button>
        </div>
      </div>

      <!-- 歌单区域 -->
      <div class="playlists-section">
        <div class="section-header">
          <h3>我的歌单 ({{ playlists.length }})</h3>
          <div class="section-actions">
            <t-button
              theme="primary"
              variant="text"
              size="small"
              :loading="loading"
              @click="loadPlaylists"
            >
              <i class="iconfont icon-shuaxin"></i>
              刷新
            </t-button>
          </div>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="loading-state">
          <t-loading size="large" text="加载中..." />
        </div>

        <!-- 歌单网格 -->
        <div v-else-if="playlists.length > 0" class="playlists-grid">
          <div v-for="playlist in playlists" :key="playlist.id" class="playlist-card">
            <div class="playlist-cover" @click="viewPlaylist(playlist)">
              <img
                v-if="playlist.coverImgUrl"
                :src="
                  playlist.coverImgUrl === 'default-cover' ? defaultCover : playlist.coverImgUrl
                "
                :alt="playlist.name"
                class="cover-image"
              />
              <div class="cover-overlay">
                <i class="iconfont icon-bofang"></i>
              </div>
            </div>
            <div class="playlist-info">
              <div class="playlist-name" @click="viewPlaylist(playlist)" :title="playlist.name">
                {{ playlist.name }}
              </div>
              <div
                class="playlist-description"
                v-if="playlist.description"
                :title="playlist.description"
              >
                {{ playlist.description }}
              </div>
              <div class="playlist-meta">
                <span>{{ playlist.source }}</span>
                <span>创建于 {{ new Date(playlist.createTime).toLocaleDateString() }}</span>
              </div>
            </div>
            <div class="playlist-actions">
              <t-tooltip content="播放歌单">
                <t-button
                  shape="circle"
                  theme="primary"
                  variant="text"
                  size="small"
                  @click="playPlaylist(playlist)"
                >
                  <i class="iconfont icon-bofang"></i>
                </t-button>
              </t-tooltip>
              <t-tooltip content="查看详情">
                <t-button
                  shape="circle"
                  theme="default"
                  variant="text"
                  size="small"
                  @click="viewPlaylist(playlist)"
                >
                  <ListIcon />
                </t-button>
              </t-tooltip>
              <t-tooltip content="编辑歌单">
                <t-button
                  shape="circle"
                  theme="success"
                  variant="text"
                  size="small"
                  @click="editPlaylist(playlist)"
                >
                  <Edit2Icon />
                </t-button>
              </t-tooltip>

              <t-tooltip content="删除歌单">
                <t-button
                  shape="circle"
                  theme="danger"
                  variant="text"
                  size="small"
                  @click="deletePlaylist(playlist)"
                >
                  <i class="iconfont icon-shanchu"></i>
                </t-button>
              </t-tooltip>
            </div>
          </div>
        </div>

        <!-- 歌单空状态 -->
        <div v-else class="empty-playlists">
          <div class="empty-icon">
            <i class="iconfont icon-gedan"></i>
          </div>
          <h4>暂无歌单</h4>
          <p>创建您的第一个歌单来管理音乐</p>
          <t-button theme="primary" @click="showCreatePlaylistDialog = true">
            <i class="iconfont icon-zengjia"></i>
            创建歌单
          </t-button>
        </div>
      </div>

      <!-- 本地音乐列表 -->
      <div class="music-section">
        <div class="section-header">
          <h3>本地音乐库</h3>
        </div>

        <div v-if="localSongs.length > 0" class="music-list">
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
              :key="song.songmid"
              class="song-row"
              @dblclick="playSong(song)"
            >
              <div class="row-item index">{{ index + 1 }}</div>
              <div class="row-item title">
                <div class="song-title">{{ song.name }}</div>
              </div>
              <div class="row-item artist">{{ song.singer }}</div>
              <div class="row-item album">{{ song.albumName }}</div>
              <div class="row-item duration">{{ song.interval || '0:00' }}</div>
              <div class="row-item size">{{ (song as any).size || '-' }}</div>
              <div class="row-item format">
                <span class="format-badge">{{ (song as any).format || 'MP3' }}</span>
                <span class="bitrate">{{ (song as any).bitrate || '320kbps' }}</span>
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
                  <i class="iconfont icon-bofang"></i>
                </t-button>
                <t-dropdown
                  v-if="playlists.length > 0"
                  :options="playlists.map((p) => ({ content: p.name, value: p.id }))"
                  @click="
                    (playlistId) => addToPlaylist(song, playlists.find((p) => p.id === playlistId)!)
                  "
                >
                  <t-button
                    shape="circle"
                    theme="default"
                    variant="text"
                    size="small"
                    title="添加到歌单"
                  >
                    <i class="iconfont icon-zengjia"></i>
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

        <!-- 本地音乐空状态 -->
        <div v-else class="empty-state">
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
    </div>

    <!-- 创建歌单对话框 -->
    <t-dialog
      placement="center"
      v-model:visible="showCreatePlaylistDialog"
      header="创建新歌单"
      width="500px"
      :confirm-btn="{ content: '创建', theme: 'primary' }"
      :cancel-btn="{ content: '取消' }"
      @confirm="createPlaylist"
    >
      <div class="create-form">
        <t-form :data="newPlaylistForm" layout="vertical">
          <t-form-item label="歌单名称" name="name" required>
            <t-input
              v-model="newPlaylistForm.name"
              placeholder="请输入歌单名称"
              clearable
              @keyup.enter="createPlaylist"
            />
          </t-form-item>
          <t-form-item label="歌单描述" name="description">
            <t-textarea
              v-model="newPlaylistForm.description"
              placeholder="请输入歌单描述（可选）"
              :maxlength="200"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </t-form-item>
        </t-form>
      </div>
    </t-dialog>

    <!-- 导入选择对话框 -->
    <t-dialog
      placement="center"
      v-model:visible="showImportDialog"
      header="选择导入方式"
      width="400px"
      :footer="false"
    >
      <div class="import-options">
        <div class="import-option" @click="importFromPlaylist">
          <div class="option-icon">
            <i class="iconfont icon-liebiao"></i>
          </div>
          <div class="option-content">
            <h4>从播放列表</h4>
            <p>将当前播放列表保存为歌单</p>
          </div>
          <div class="option-arrow">
            <i class="iconfont icon-youjiantou"></i>
          </div>
        </div>
        <div class="import-option" @click="importFromNetwork">
          <div class="option-icon">
            <i class="iconfont icon-wangluo"></i>
          </div>
          <div class="option-content">
            <h4>从网络歌单</h4>
            <p>导入网易云、QQ音乐等平台歌单</p>
            <span class="coming-soon">实验性功能</span>
          </div>
          <div class="option-arrow">
            <i class="iconfont icon-youjiantou"></i>
          </div>
        </div>
      </div>
    </t-dialog>
    <!-- 网络歌单导入对话框 -->
    <t-dialog
      placement="center"
      v-model:visible="showNetworkImportDialog"
      header="导入网易云音乐歌单"
      :confirm-btn="{ content: '开始导入', theme: 'primary' }"
      :cancel-btn="{ content: '取消', variant: 'outline' }"
      @confirm="confirmNetworkImport"
      @cancel="cancelNetworkImport"
      width="500px"
    >
      <div class="network-import-content">
        <p class="import-description">
          请输入网易云音乐歌单链接或歌单ID，系统将自动识别格式并导入歌单中的所有歌曲到本地歌单。
        </p>

        <t-input
          v-model="networkPlaylistUrl"
          placeholder="支持链接或ID：https://music.163.com/playlist?id=123456789 或 123456789"
          clearable
          autofocus
          class="url-input"
          @enter="confirmNetworkImport"
        />

        <div class="import-tips">
          <p class="tip-title">支持的输入格式：</p>
          <ul class="tip-list">
            <li>完整链接：https://music.163.com/playlist?id=123456789</li>
            <li>手机链接：https://music.163.com/m/playlist?id=123456789</li>
            <li>分享链接：https://y.music.163.com/m/playlist/123456789</li>
            <li>纯数字ID：123456789</li>
            <li>其他包含ID的网易云链接格式</li>
          </ul>
          <p class="tip-note">智能识别：系统会自动从输入中提取歌单ID</p>
        </div>
      </div>
    </t-dialog>

    <!-- 编辑歌单对话框 -->
    <t-dialog
      placement="center"
      v-model:visible="showEditPlaylistDialog"
      header="编辑歌单信息"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      :cancel-btn="{ content: '取消', variant: 'outline' }"
      @confirm="savePlaylistEdit"
      @cancel="cancelPlaylistEdit"
      width="500px"
    >
      <div class="edit-playlist-content">
        <div class="form-item">
          <label class="form-label">歌单名称</label>
          <t-input
            v-model="editPlaylistForm.name"
            placeholder="请输入歌单名称"
            clearable
            autofocus
            maxlength="50"
            show-word-limit
          />
        </div>

        <div class="form-item">
          <label class="form-label">歌单描述</label>
          <t-textarea
            v-model="editPlaylistForm.description"
            placeholder="请输入歌单描述（可选）"
            :autosize="{ minRows: 3, maxRows: 6 }"
            maxlength="200"
            show-word-limit
          />
        </div>
      </div>
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

// 编辑歌单对话框样式
.edit-playlist-content {
  .form-item {
    margin-bottom: 1.5rem;

    &:last-child {
      margin-bottom: 0;
    }

    .form-label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
      color: #374151;
      font-size: 14px;
    }
  }

  .form-tips {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #f3f4f6;
    border-radius: 6px;
    border-left: 3px solid #10b981;

    .tip-note {
      margin: 0;
      color: #6b7280;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .iconfont {
        color: #10b981;
        font-size: 14px;
      }
    }
  }
}

// 网络歌单导入对话框样式
.network-import-content {
  .import-description {
    margin-bottom: 1rem;
    color: #666;
    font-size: 14px;
    line-height: 1.5;
  }

  .url-input {
    margin-bottom: 1.5rem;
  }

  .import-tips {
    background: #f8f9fa;
    border-radius: 6px;
    padding: 1rem;
    border-left: 3px solid #507daf;

    .tip-title {
      margin: 0 0 0.5rem 0;
      font-weight: 500;
      color: #333;
      font-size: 14px;
    }

    .tip-list {
      margin: 0 0 0.5rem 0;
      padding-left: 1.2rem;

      li {
        color: #666;
        font-size: 13px;
        margin-bottom: 0.25rem;
        font-family: 'Consolas', 'Monaco', monospace;
      }
    }

    .tip-note {
      margin: 0;
      color: #999;
      font-size: 12px;
      font-style: italic;
    }
  }
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

/* 歌单区域样式 */
.playlists-section {
  margin-bottom: 3rem;

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;

    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
    }

    .section-actions {
      display: flex;
      gap: 0.5rem;
    }
  }
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4rem 2rem;
}

.playlists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.5rem;
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
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);

    .playlist-cover .cover-overlay {
      opacity: 1;
    }
  }

  .playlist-cover {
    height: 180px;
    background: linear-gradient(135deg, var(--td-brand-color-4) 0%, var(--td-brand-color-6) 100%);
    position: relative;
    cursor: pointer;
    overflow: hidden;

    .cover-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
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
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      font-size: 1rem;

      &:hover {
        color: #4f46e5;
      }
    }

    .playlist-description {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playlist-meta {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: #9ca3af;

      span {
        &:first-child {
          text-transform: uppercase;
          font-weight: 500;
          color: #4f46e5;
        }
      }
    }
  }

  .playlist-actions {
    display: flex;
    justify-content: flex-end;
    padding: 0 1rem 1rem;
    gap: 0.5rem;
  }
}

.empty-playlists {
  text-align: center;
  padding: 4rem 2rem;

  .empty-icon {
    margin-bottom: 1.5rem;

    .iconfont {
      font-size: 4rem;
      color: #d1d5db;
    }
  }

  h4 {
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  p {
    color: #6b7280;
    margin-bottom: 2rem;
  }
}

/* 本地音乐区域 */
.music-section {
  .section-header {
    margin-bottom: 1rem;

    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
    }
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
  grid-template-columns: 0.5fr 2fr 1fr 2fr 1fr 1fr 1fr 1fr;
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
    grid-template-columns: 0.5fr 2fr 1fr 2fr 1fr 1fr 1fr 1fr;
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

/* 创建歌单表单 */
.create-form {
  padding: 1rem 0;
}

/* 导入选择对话框 */
.import-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.import-option {
  display: flex;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--td-brand-color-4);
    background-color: #f8fafc;
  }

  .option-icon {
    margin-right: 1rem;

    .iconfont {
      font-size: 1.5rem;
      color: var(--td-brand-color-4);
    }
  }

  .option-content {
    flex: 1;

    h4 {
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 0.25rem;
    }

    p {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0;
    }

    .coming-soon {
      display: inline-block;
      background: #fef3c7;
      color: #d97706;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      margin-top: 0.5rem;
    }
  }

  .option-arrow {
    .iconfont {
      font-size: 1rem;
      color: #9ca3af;
    }
  }
}
</style>
