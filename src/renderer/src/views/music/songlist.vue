<script lang="ts" setup>
import { ref, onMounted, computed, toRaw } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import {
  Edit2Icon,
  PlayCircleIcon,
  DeleteIcon,
  ViewListIcon,
  DownloadIcon
} from 'tdesign-icons-vue-next'
import { createQualityDialog } from '@renderer/utils/audio/download'
import { calculateBestQuality, QUALITY_ORDER } from '@common/utils/quality'
import songListAPI from '@renderer/api/songList'
import type { SongList, Songs } from '@common/types/songList'
import defaultCover from '/default-cover.png'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import ContextMenu from '@renderer/components/ContextMenu/ContextMenu.vue'
import {
  createMenuItem,
  createSeparator,
  calculateMenuPosition
} from '@renderer/components/ContextMenu/utils'
import type { ContextMenuItem, ContextMenuPosition } from '@renderer/components/ContextMenu/types'
import {
  importPlaylistFromFile,
  validateImportedPlaylist,
  exportPlaylistToFile
} from '@renderer/utils/playlist/playlistExportImport'
import {
  cloudSongListAPI,
  type CloudSongList,
  type CloudSongDto
} from '@renderer/api/cloudSongList'
import { getPersistentMeta } from '@renderer/utils/playlist/meta'
import { CloudIcon, CloudUploadIcon, CloudDownloadIcon } from 'tdesign-icons-vue-next'
import { mapCloudSongToLocal } from '@renderer/utils/playlist/cloudList'
import {
  handleUploadToCloudHelper,
  handleSyncToCloudHelper
} from '@renderer/utils/playlist/cloudSyncHelper'

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
// 喜欢歌单ID（用于排序与标记）
const favoritesId = ref<string | null>(null)

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

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 })
const contextMenuPlaylist = ref<SongList | null>(null)
const songlistFileInputRef = ref<HTMLInputElement | null>(null)
const songlistUploadedFile = ref<File | null>(null)
const triggerSonglistFileInput = () => {
  if (songlistFileInputRef.value) songlistFileInputRef.value.click()
}
const handleSonglistFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    songlistUploadedFile.value = input.files[0]
    importSonglistFromFile()
  }
}
const importSonglistFromFile = async () => {
  try {
    showImportDialog.value = false
    if (!songlistUploadedFile.value) {
      MessagePlugin.warning('请先选择文件')
      return
    }
    const imported = await importPlaylistFromFile(songlistUploadedFile.value)
    if (!validateImportedPlaylist(imported)) {
      MessagePlugin.error('导入的歌单格式不正确')
      return
    }
    const rawName = songlistUploadedFile.value.name.replace(/\.(cmpl|cpl)$/i, '')
    let parsedName: string | null = null
    const mSonglist = rawName.match(/^cerumusic-songlist-(.+?)-\d{4}-\d{2}-\d{2}$/i)
    if (mSonglist) parsedName = mSonglist[1]
    else {
      const mSimple = rawName.match(/^cerumusic-(.+)$/i)
      if (mSimple) parsedName = mSimple[1]
    }
    const finalName = parsedName || rawName
    const createRes = await songListAPI.create(finalName, '从本地歌单文件导入', 'local')
    if (!createRes.success || !createRes.data) {
      MessagePlugin.error(createRes.error || '创建歌单失败')
      return
    }
    const addRes = await songListAPI.addSongs(createRes.data.id, imported)
    if (addRes.success) {
      const added = (addRes.data && (addRes.data as any).added) ?? imported.length
      const skipped =
        (addRes.data && (addRes.data as any).skipped) ?? Math.max(0, imported.length - added)
      MessagePlugin.success(
        skipped > 0
          ? `成功导入 ${added} 首歌曲到歌单“${finalName}”，跳过 ${skipped} 首重复`
          : `成功导入 ${added} 首歌曲到歌单“${finalName}”`
      )
      await loadPlaylists()
    } else {
      MessagePlugin.error(addRes.error || '添加歌曲到歌单失败')
    }
  } catch (err) {
    MessagePlugin.error(`导入失败: ${(err as Error).message}`)
  } finally {
    songlistUploadedFile.value = null
    if (songlistFileInputRef.value) songlistFileInputRef.value.value = ''
  }
}

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
    const [localRes, cloudRes] = await Promise.all([
      songListAPI.getAll(),
      cloudSongListAPI.getUserSongLists().catch((e) => {
        console.error('Failed to fetch cloud lists', e)
        return []
      }) // Fail safe
    ])

    const localLists = (localRes.success ? localRes.data : []) || []
    const cloudLists: CloudSongList[] = Array.isArray(cloudRes) ? cloudRes : []

    console.log('Local Lists:', localLists)
    console.log('Cloud Lists:', cloudLists)

    // Merge Logic
    const mergedLists: SongList[] = []
    const localMap = new Map<string, SongList>()

    // 1. Process Local Lists
    localLists.forEach((l) => {
      // Ensure meta exists
      if (!l.meta) l.meta = {}
      localMap.set(l.id, l)
      mergedLists.push(l)
    })

    // 2. Process Cloud Lists
    cloudLists.forEach((c) => {
      // Try to find matching local list
      // Match by localId (if cloud knows about it) OR by meta.cloudId (if local knows about it)
      let match = localMap.get(c.localId)

      if (!match) {
        // Try reverse lookup
        match = mergedLists.find((l) => l.meta && l.meta.cloudId === c.id)
      }

      if (match) {
        console.log('Matched:', c.name, match.name)
        // Mark as synced
        match.meta.cloudId = c.id
        match.meta.isSynced = true
        match.meta.cloudUpdatedAt = c.updatedAt
      } else {
        console.log('Not Matched (Cloud Only):', c.name)
        // Cloud only list
        mergedLists.push({
          id: c.id, // Use cloud ID temporarily (or handle distinction)
          name: c.name,
          description: c.describe,
          coverImgUrl: c.cover,
          createTime: '',
          updateTime: c.updatedAt,
          source: 'local', // Or 'cloud'? But SongList source enum is specific. Let's keep 'local' but mark meta.
          meta: {
            isCloudOnly: true,
            cloudId: c.id,
            cloudUpdatedAt: c.updatedAt
          }
        })
      }
    })

    playlists.value = mergedLists

    // 读取“我的喜欢”ID并置顶与标记
    try {
      const favRes = await (window as any).api?.songList?.getFavoritesId?.()
      favoritesId.value = (favRes && favRes.data) || null
      if (favoritesId.value) {
        const idx = playlists.value.findIndex((p) => p.id === favoritesId.value)
        if (idx > 0) {
          const fav = playlists.value.splice(idx, 1)[0]
          playlists.value.unshift(fav)
        }
      }
    } catch {}
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
      // 触发歌单更新事件
      window.dispatchEvent(new Event('playlist-updated'))
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
    let success = false
    let errorMsg = ''

    if (currentEditingPlaylist.value.meta?.isCloudOnly) {
      try {
        await cloudSongListAPI.updateUserSongList({
          listId: currentEditingPlaylist.value.id,
          name: editPlaylistForm.value.name.trim(),
          describe: editPlaylistForm.value.description.trim()
        })
        success = true
      } catch (e) {
        success = false
        errorMsg = (e as Error).message
      }
    } else {
      const result = await songListAPI.edit(currentEditingPlaylist.value.id, {
        name: editPlaylistForm.value.name.trim(),
        description: editPlaylistForm.value.description.trim()
      })
      success = result.success
      errorMsg = result.error || '更新歌单信息失败'
    }

    if (success) {
      MessagePlugin.success('歌单信息更新成功')
      showEditPlaylistDialog.value = false
      currentEditingPlaylist.value = null
      await loadPlaylists()
      // 触发歌单更新事件
      window.dispatchEvent(new Event('playlist-updated'))
    } else {
      MessagePlugin.error(errorMsg || '更新歌单信息失败')
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
        let success = false
        let errorMsg = ''

        if (playlist.meta?.isCloudOnly) {
          try {
            await cloudSongListAPI.deleteUserSongList(playlist.id)
            success = true
          } catch (e) {
            success = false
            errorMsg = (e as Error).message
          }
        } else {
          const result = await songListAPI.delete(playlist.id)
          success = result.success
          errorMsg = result.error || '删除歌单失败'
        }

        if (success) {
          MessagePlugin.success('歌单删除成功')
          await loadPlaylists()
          // 触发歌单更新事件
          window.dispatchEvent(new Event('playlist-updated'))
        } else {
          MessagePlugin.error(errorMsg || '删除歌单失败')
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
  if (playlist.meta?.isCloudOnly) {
    router.push({
      name: 'list',
      params: { id: playlist.id },
      query: {
        title: playlist.name,
        author: 'cloud',
        cover: playlist.coverImgUrl || '',
        total: '0',
        source: 'cloud',
        type: 'cloud_user',
        meta: JSON.stringify(playlist.meta)
      }
    })
    return
  }

  // 跳转到 list 页面，传递歌单信息作为查询参数
  router.push({
    name: 'list',
    params: { id: playlist.id },
    query: {
      title: playlist.name,
      author: 'local',
      cover: playlist.coverImgUrl || '',
      total: '0', // 这里可以后续优化为实际歌曲数量
      source: playlist.source,
      type: 'local', // 标识这是本地歌单
      meta: JSON.stringify(playlist.meta), // 歌单元数据
      cloudId: playlist.meta?.cloudId // 显式传递 cloudId，防止 meta 被覆盖后丢失
    }
  })
}

// 播放歌单
const playPlaylist = async (playlist: SongList) => {
  try {
    let songs: Songs[] = []

    if (playlist.meta?.isCloudOnly) {
      try {
        songs = (await cloudSongListAPI.getSongListDetail(playlist.id)).list.map(
          mapCloudSongToLocal
        )
      } catch (e) {
        MessagePlugin.error((e as Error).message || '获取歌单歌曲失败')
        return
      }
    } else {
      const result = await songListAPI.getSongs(playlist.id)
      if (result.success) {
        songs = [...(result.data || [])]
      } else {
        MessagePlugin.error(result.error || '获取歌单歌曲失败')
        return
      }
    }

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
  } catch (error) {
    console.error('播放歌单失败:', error)
    MessagePlugin.error('播放歌单失败')
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
      const added = (addResult.data && (addResult.data as any).added) ?? currentPlaylist.length
      const skipped =
        (addResult.data && (addResult.data as any).skipped) ??
        Math.max(0, currentPlaylist.length - added)
      MessagePlugin.success(
        skipped > 0
          ? `成功从播放列表导入 ${added} 首歌曲到歌单"${playlistName}"，跳过 ${skipped} 首重复`
          : `成功从播放列表导入 ${added} 首歌曲到歌单"${playlistName}"`
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
const importPlatformType = ref('wy') // 默认选择网易云音乐

// 从网络歌单导入
const importFromNetwork = () => {
  showImportDialog.value = false
  showNetworkImportDialog.value = true
  networkPlaylistUrl.value = ''
  importPlatformType.value = 'wy' // 重置为默认平台
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
  importPlatformType.value = 'wy'
}

// 为歌单歌曲获取封面图片
const setPicForPlaylist = async (songs: any[], source: string) => {
  // 筛选出需要获取封面的歌曲
  const songsNeedPic = songs.filter((song) => !song.img)

  if (songsNeedPic.length === 0) return

  // 批量请求封面
  const picPromises = songsNeedPic.map(async (song, index) => {
    try {
      const url = await window.api.music.requestSdk('getPic', {
        source,
        songInfo: toRaw(song)
      })
      return {
        song,
        url: typeof url !== 'object' ? url : ''
      }
    } catch (e) {
      console.log('获取封面失败 index' + index, e)
      return {
        song,
        url: ''
      }
    }
  })

  // 等待所有请求完成
  const results = await Promise.all(picPromises)

  // 更新歌曲封面
  results.forEach((result) => {
    result.song.img = result.url
  })
}

// 处理网络歌单导入
const handleNetworkPlaylistImport = async (input: string) => {
  try {
    const load1 = MessagePlugin.loading('正在解析歌单链接...', 0)

    let playlistId: string = ''
    let platformName: string = ''

    if (importPlatformType.value === 'wy') {
      // 网易云音乐歌单ID解析
      const playlistIdRegex = /(?:music\.163\.com\/.*[?&]id=|playlist\?id=|playlist\/|id=)(\d+)/i
      const match = input.match(playlistIdRegex)

      if (match && match[1]) {
        playlistId = match[1]
      } else {
        const numericMatch = input.match(/^\d+$/)
        if (numericMatch) {
          playlistId = input
        } else {
          MessagePlugin.error('无法识别的网易云音乐歌单链接或ID格式')
          load1.then((res) => res.close())
          return
        }
      }
      platformName = '网易云音乐'
    } else if (importPlatformType.value === 'tx') {
      // QQ音乐歌单ID解析：优先通过 SDK 解析，失败再回退到正则
      let parsedId = ''
      try {
        const parsed: any = await window.api.music.requestSdk('parsePlaylistId', {
          source: 'tx',
          url: input
        })
        console.log('QQ音乐歌单解析结果', parsed)
        if (parsed) parsedId = parsed
      } catch (e) {}

      if (parsedId) {
        playlistId = parsedId
      } else {
        const qqPlaylistRegexes = [
          // 标准歌单链接(强烈推荐)
          /(?:y\.qq\.com\/n\/ryqq\/playlist\/|music\.qq\.com\/.*[?&]id=|playlist[?&]id=)(\d+)/i,
          // 分享链接格式
          /(?:i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html.*[?&]id=)(\d+)/i,
          // 其他可能的分享格式 https:\/\/c\d+\.y\.qq\.com\/base\/fcgi-bin\/u\?.*__=([A-Za-z0-9]+)/i,
          // 手机版链接
          /(?:i\.y\.qq\.com\/v8\/playsquare\/playlist\.html.*[?&]id=)(\d+)/i,
          // 通用ID提取 - 匹配 id= 或 &id= 参数
          /[?&]id=(\d+)/i
        ]

        let match: RegExpMatchArray | null = null
        for (const regex of qqPlaylistRegexes) {
          match = input.match(regex)
          if (match && match[1]) {
            playlistId = match[1]
            break
          }
        }

        if (!match || !match[1]) {
          // 检查是否直接输入的是纯数字ID
          const numericMatch = input.match(/^\d+$/)
          if (numericMatch) {
            playlistId = input
          } else {
            MessagePlugin.error('无法识别的QQ音乐歌单链接或ID格式，请检查链接是否正确')
            load1.then((res) => res.close())
            return
          }
        }
      }
      platformName = 'QQ音乐'
    } else if (importPlatformType.value === 'kw') {
      // 酷我音乐歌单ID解析
      const kwPlaylistRegexes = [
        // 标准歌单链接
        /(?:kuwo\.cn\/playlist_detail\/|kuwo\.cn\/.*[?&]pid=)(\d+)/i,
        // 手机版歌单链接（旧格式）
        /(?:m\.kuwo\.cn\/h5app\/playlist\/|kuwo\.cn\/.*[?&]id=)(\d+)/i,
        // 手机版歌单链接 (新格式)
        /m\.kuwo\.cn\/newh5app\/playlist_detail\/(\d+)/i,
        // 通用ID提取
        /[?&](?:pid|id)=(\d+)/i
      ]

      let match: RegExpMatchArray | null = null
      for (const regex of kwPlaylistRegexes) {
        match = input.match(regex)
        if (match && match[1]) {
          playlistId = match[1]
          break
        }
      }

      if (!match || !match[1]) {
        const numericMatch = input.match(/^\d+$/)
        if (numericMatch) {
          playlistId = input
        } else {
          MessagePlugin.error('无法识别的酷我音乐歌单链接或ID格式，请检查链接是否正确')
          load1.then((res) => res.close())
          return
        }
      }
      platformName = '酷我音乐'
    } else if (importPlatformType.value === 'bd') {
      // 波点音乐歌单ID解析
      const bdPlaylistRegexes = [
        // 手机版歌单链接
        /h5app\.kuwo\.cn\/m\/bodian\/collection\.html.*[?&]playlistId=(\d+)/i,
        // 通用ID提取
        /[?&]playlistId=(\d+)/i
      ]

      let match: RegExpMatchArray | null = null
      for (const regex of bdPlaylistRegexes) {
        match = input.match(regex)
        if (match && match[1]) {
          playlistId = match[1]
          break
        }
      }

      if (!match || !match[1]) {
        const numericMatch = input.match(/^\d+$/)
        if (numericMatch) {
          playlistId = input
        } else {
          MessagePlugin.error('无法识别的波点音乐歌单链接或ID格式，请检查链接是否正确')
          load1.then((res) => res.close())
          return
        }
      }
      platformName = '波点音乐'
    } else if (importPlatformType.value === 'kg') {
      // 酷狗音乐链接处理 - 传递完整链接给getUserListDetail
      const kgPlaylistRegexes = [
        // 标准歌单链接
        /kugou\.com\/yy\/special\/single\/\d+/i,
        // 手机版歌单链接 (新格式)
        /m\.kugou\.com\/songlist\/gcid_[a-zA-Z0-9]+/i,
        // 手机版链接 (旧格式)
        /m\.kugou\.com\/.*[?&]id=\d+/i,
        // 参数链接
        /kugou\.com\/.*[?&](?:specialid|id)=\d+/i,
        // 通用酷狗链接
        /kugou\.com\/.*playlist/i
      ]

      let isValidLink = false
      for (const regex of kgPlaylistRegexes) {
        if (regex.test(input)) {
          isValidLink = true
          playlistId = input // 传递完整链接
          break
        }
      }

      if (!isValidLink) {
        // 检查是否为纯数字ID
        const numericMatch = input.match(/^\d+$/)
        if (numericMatch) {
          playlistId = input
        } else {
          MessagePlugin.error('无法识别的酷狗音乐歌单链接或ID格式，请检查链接是否正确')
          load1.then((res) => res.close())
          return
        }
      }
      platformName = '酷狗音乐'
    } else if (importPlatformType.value === 'mg') {
      // 咪咕音乐歌单ID解析
      const mgPlaylistRegexes = [
        // 标准歌单链接
        /(?:music\.migu\.cn\/.*[?&]id=)(\d+)/i,
        // 手机版链接
        /(?:m\.music\.migu\.cn\/.*[?&]id=)(\d+)/i,
        // 通用ID提取
        /[?&]id=(\d+)/i
      ]

      let match: RegExpMatchArray | null = null
      for (const regex of mgPlaylistRegexes) {
        match = input.match(regex)
        if (match && match[1]) {
          playlistId = match[1]
          break
        }
      }

      if (!match || !match[1]) {
        const numericMatch = input.match(/^\d+$/)
        if (numericMatch) {
          playlistId = input
        } else {
          MessagePlugin.error('无法识别的咪咕音乐歌单链接或ID格式，请检查链接是否正确')
          load1.then((res) => res.close())
          return
        }
      }
      platformName = '咪咕音乐'
    } else {
      MessagePlugin.error('不支持的平台类型')
      load1.then((res) => res.close())
      return
    }

    // 关闭加载提示
    load1.then((res) => res.close())

    // 获取歌单详情
    const load2 = MessagePlugin.loading('正在获取歌单信息,请不要离开页面...', 0)

    const getListDetail = async (page: number) => {
      let detailResult: any
      try {
        detailResult = (await window.api.music.requestSdk('getPlaylistDetail', {
          source: importPlatformType.value,
          id: playlistId,
          page: page
        })) as any
        console.log('list', detailResult)
      } catch {
        MessagePlugin.error(`获取${platformName}歌单详情失败：歌曲信息可能有误`)
        load2.then((res) => res.close())
        return
      }

      if (detailResult.error) {
        MessagePlugin.error(`获取${platformName}歌单详情失败：` + detailResult.error)
        load2.then((res) => res.close())
        return
      }

      return detailResult
    }

    let page: number = 1
    const detailResult = await getListDetail(page)
    const playlistInfo = detailResult.info
    let songs: Array<any> = detailResult.list || []

    if (songs.length === 0) {
      MessagePlugin.warning('该歌单没有歌曲')
      load2.then((res) => res.close())
      return
    }

    while (true) {
      if (detailResult.total < songs.length) break
      page++
      const { list: songsList } = await getListDetail(page)
      if (!(songsList && songsList.length)) {
        break
      }
      songs = songs.concat(songsList)
    }

    // 处理导入结果
    let successCount = 0
    let failCount = 0

    // 为酷狗音乐获取封面图片
    if (importPlatformType.value === 'kg') {
      load2.then((res) => res.close())
      const load3 = MessagePlugin.loading('正在获取歌曲封面...')
      if (songs.length > 100) MessagePlugin.info('歌曲较多，封面获取可能较慢')

      try {
        await setPicForPlaylist(songs, importPlatformType.value)
      } catch (error) {
        console.warn('获取封面失败，但继续导入:', error)
      }

      load3.then((res) => res.close())
      const load4 = MessagePlugin.loading('正在创建本地歌单...')

      const createResult = await songListAPI.create(
        `${playlistInfo.name} (导入)`,
        playlistInfo.desc
          ? playlistInfo.desc
          : `从${platformName}导入 - 原歌单：${playlistInfo.name}`,
        importPlatformType.value,
        {
          playlistId
        }
      )

      const newPlaylistId = createResult.data!.id
      await songListAPI.updateCover(newPlaylistId, detailResult.info.img)

      if (!createResult.success) {
        MessagePlugin.error('创建本地歌单失败：' + createResult.error)
        load4.then((res) => res.close())
        return
      }

      const addResult = await songListAPI.addSongs(newPlaylistId, songs)
      load4.then((res) => res.close())

      if (addResult.success) {
        const added = (addResult.data && (addResult.data as any).added) ?? songs.length
        successCount = added
        failCount = Math.max(0, songs.length - added)
      } else {
        successCount = 0
        failCount = songs.length
        console.error('批量添加歌曲失败:', addResult.error)
      }
    } else {
      const createResult = await songListAPI.create(
        `${playlistInfo.name} (导入)`,
        playlistInfo.desc
          ? playlistInfo.desc
          : `从${platformName}导入 - 原歌单：${playlistInfo.name}`,
        importPlatformType.value,
        {
          playlistId
        }
      )

      const newPlaylistId = createResult.data!.id
      await songListAPI.updateCover(newPlaylistId, detailResult.info.img)

      if (!createResult.success) {
        MessagePlugin.error('创建本地歌单失败：' + createResult.error)
        load2.then((res) => res.close())
        return
      }

      const addResult = await songListAPI.addSongs(newPlaylistId, songs)
      load2.then((res) => res.close())

      if (addResult.success) {
        const added = (addResult.data && (addResult.data as any).added) ?? songs.length
        successCount = added
        failCount = Math.max(0, songs.length - added)
      } else {
        successCount = 0
        failCount = songs.length
        console.error('批量添加歌曲失败:', addResult.error)
      }
    }

    // 刷新歌单列表
    await loadPlaylists()

    // 显示导入结果
    if (successCount > 0) {
      MessagePlugin.success(
        `从${platformName}导入完成！成功导入 ${successCount} 首歌曲` +
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

const downloadPlaylist = async (playlist: SongList) => {
  try {
    const res = await songListAPI.getSongs(playlist.id)
    if (!res.success) {
      MessagePlugin.error(res.error || '获取歌单歌曲失败')
      return
    }
    const songs = res.data || []
    if (songs.length === 0) {
      MessagePlugin.warning('歌单中没有可下载的歌曲')
      return
    }

    const settingsStore = useSettingsStore()
    const LocalUserDetail = LocalUserDetailStore()

    // 1. 收集所有可能的音质选项
    // 我们使用标准的 QUALITY_ORDER 作为基础，展示所有可能的选项
    // 或者，我们可以收集当前歌单中所有歌曲支持的音质合集
    const allPossibleTypes = QUALITY_ORDER.map((t) => ({ type: t, size: '' }))

    // 2. 弹出音质选择框
    const userQuality = await createQualityDialog(
      allPossibleTypes,
      LocalUserDetail.userSource.quality || '128k',
      '选择批量下载音质(自动降级)'
    )

    if (!userQuality) return

    let count = 0
    for (const song of songs) {
      // Skip local songs
      if (song.source === 'local') continue

      // 3. 计算每首歌的最佳匹配音质
      // 如果歌曲有 types 信息，使用 calculateBestQuality
      // 如果没有 types 信息（可能还没获取详情），尝试使用 userQuality，或者默认降级逻辑
      // 注意：song 对象可能没有 types 属性，取决于 API 返回的详情程度。
      // 如果没有 types，这里可能无法准确降级。
      // 但是 requestSdk('downloadSingleSong') 内部通常会处理单个歌曲的下载。
      // 如果我们在这里直接调用 requestSdk，我们需要传 quality。
      // 如果 song.types 存在：
      let qualityToUse = userQuality
      if (song.types && song.types.length > 0) {
        const best = calculateBestQuality(song.types, userQuality)
        if (best) qualityToUse = best
      }

      // 如果 song.types 不存在，我们只能传 userQuality，
      // 并期望后端或 downloadSingleSong 在下载前能获取详情并做降级？
      // 但 downloadSingleSong 需要 songInfo。
      // 实际上，如果批量下载时 song 对象没有 types，可能需要先 fetch 详情。
      // 不过目前的逻辑似乎是直接调用的。
      // 假设 song 对象已经有了必要信息。

      window.api.music
        .requestSdk('downloadSingleSong', {
          pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
          source: song.source,
          quality: qualityToUse,
          songInfo: toRaw(song),
          tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
          lazy: true // Enable lazy loading
        })
        .catch((err) => {
          console.error('Download failed for song:', song.name, err)
        })
      count++
    }

    if (count > 0) {
      MessagePlugin.success(`已添加 ${count} 首歌曲到下载队列`)
    } else {
      MessagePlugin.warning('没有可下载的在线歌曲')
    }
  } catch (error) {
    console.error('Download playlist failed:', error)
    MessagePlugin.error('下载失败')
  }
}

const handleUploadToCloud = async (pl: SongList) => {
  let songs: any[] = []
  try {
    const res = await songListAPI.getSongs(pl.id)
    if (!res.success) throw new Error(res.error || '获取歌曲失败')
    songs = [...(res.data || [])]
  } catch (e: any) {
    console.error(e)
    MessagePlugin.error('获取歌曲失败: ' + (e.message || '未知错误'))
    return
  }

  try {
    await handleUploadToCloudHelper(
      {
        id: pl.id,
        name: pl.name,
        description: pl.description || '',
        cover: pl.coverImgUrl,
        meta: pl.meta
      },
      songs,
      loadPlaylists
    )
  } catch (e) {
    // Error handled in helper
  }
}

const handleSyncToCloud = async (pl: any) => {
  let songs: any[] = []
  try {
    const res = await songListAPI.getSongs(pl.id)
    if (!res.success) throw new Error(res.error || '获取歌曲失败')
    songs = [...(res.data || [])]
  } catch (e: any) {
    console.error(e)
    MessagePlugin.error('获取歌曲失败: ' + (e.message || '未知错误'))
    return
  }

  try {
    await handleSyncToCloudHelper(
      {
        id: pl.id,
        name: pl.name,
        description: pl.description || '',
        cover: pl.coverImgUrl,
        meta: pl.meta
      },
      songs,
      loadPlaylists
    )
  } catch (e) {
    // Error handled in helper
  }
}

const handleDownloadCloudPlaylist = async (pl: any) => {
  const loadingMsg = MessagePlugin.loading('正在下载到本地...', 0)
  try {
    // 循环分页拉取所有歌曲
    let allCloudSongs: CloudSongDto[] = []
    let pos: number | undefined = undefined
    const limit = 100

    while (true) {
      const { list: batch, total } = await cloudSongListAPI.getSongListDetail(
        pl.id,
        'asc',
        limit,
        pos
      )
      if (!batch || batch.length === 0) break

      allCloudSongs = [...allCloudSongs, ...batch]

      if (allCloudSongs.length >= total || batch.length < limit) break
      pos = batch[batch.length - 1].pos
    }

    const localSongs = allCloudSongs.map(mapCloudSongToLocal)

    // Create local playlist
    const createRes = await songListAPI.create(pl.name, pl.description, 'local')
    if (!createRes.success || !createRes.data) throw new Error(createRes.error || '创建歌单失败')

    const localId = createRes.data.id

    // Add songs
    await songListAPI.addSongs(localId, localSongs)

    // Update meta
    const newMeta = getPersistentMeta({
      ...pl.meta,
      cloudUpdatedAt: pl.meta.cloudUpdatedAt
    })
    await songListAPI.edit(localId, { meta: newMeta })

    // If cover is URL, update it
    if (pl.coverImgUrl) {
      await songListAPI.updateCover(localId, pl.coverImgUrl)
    }

    // 重要：通知云端更新 localId，建立双向绑定
    await cloudSongListAPI.updateUserSongList({
      listId: pl.id,
      localId: localId
    })

    loadingMsg.then((inst) => inst.close())
    MessagePlugin.success('下载成功')
    await loadPlaylists()
  } catch (e: any) {
    loadingMsg.then((inst) => inst.close())
    console.error(e)
    MessagePlugin.error('下载失败: ' + (e.message || '未知错误'))
  }
}

const handleDeleteCloudPlaylist = async (pl: SongList) => {
  const confirm = DialogPlugin.confirm({
    header: '删除云端歌单',
    body: `确定要删除云端歌单 "${pl.name}" 吗？此操作不可恢复。`,
    onConfirm: async () => {
      confirm.destroy()
      try {
        await cloudSongListAPI.deleteUserSongList(pl.id)
        MessagePlugin.success('删除成功')
        loadPlaylists()
      } catch (e: any) {
        MessagePlugin.error('删除失败: ' + e.message)
      }
    },
    onCancel: () => confirm.destroy()
  })
}

const handleDeletePlaylist = async (pl: SongList) => {
  const isSynced = pl.meta?.isSynced && pl.meta?.cloudId

  const dialog = DialogPlugin.confirm({
    header: '删除歌单',
    body: `确定要删除歌单 "${pl.name}" 吗？` + (isSynced ? ' (云端副本将保留)' : ''),
    onConfirm: async () => {
      dialog.destroy()
      try {
        const result = await songListAPI.delete(pl.id)
        if (result.success) {
          MessagePlugin.success('歌单删除成功')
          await loadPlaylists()
        } else {
          MessagePlugin.error(result.error || '删除歌单失败')
        }
      } catch (error) {
        console.error('删除歌单失败:', error)
        MessagePlugin.error('删除歌单失败')
      }
    },
    onCancel: () => dialog.destroy()
  })
}

const handleDeleteBoth = async (pl: SongList) => {
  const dialog = DialogPlugin.confirm({
    header: '删除歌单',
    body: `确定要删除歌单 "${pl.name}" (本地和云端) 吗？`,
    onConfirm: async () => {
      dialog.destroy()
      try {
        // Delete cloud
        if (pl.meta?.cloudId) {
          await cloudSongListAPI
            .deleteUserSongList(pl.meta.cloudId)
            .catch((e) => console.error('Cloud delete failed', e))
        }

        // Delete local
        const result = await songListAPI.delete(pl.id)
        if (result.success) {
          MessagePlugin.success('删除成功')
          await loadPlaylists()
        } else {
          MessagePlugin.error(result.error || '删除本地歌单失败')
        }
      } catch (error) {
        MessagePlugin.error('删除失败')
      }
    },
    onCancel: () => dialog.destroy()
  })
}

// 右键菜单项配置
const contextMenuItems = computed((): ContextMenuItem[] => {
  if (!contextMenuPlaylist.value) return []
  const pl = contextMenuPlaylist.value
  const isCloudOnly = pl.meta?.isCloudOnly
  const isSynced = pl.meta?.isSynced

  const items: ContextMenuItem[] = []

  // Cloud Actions
  if (isCloudOnly) {
    items.push(
      createMenuItem('download-cloud', '下载到本地', {
        icon: CloudDownloadIcon,
        onClick: () => handleDownloadCloudPlaylist(pl)
      })
    )
    items.push(
      createMenuItem('delete-cloud', '删除云端歌单', {
        icon: DeleteIcon,
        onClick: () => handleDeleteCloudPlaylist(pl)
      })
    )
    return items // Cloud only lists have limited options
  }

  // Standard items for local/synced
  items.push(
    createMenuItem('play', '播放歌单', {
      icon: PlayCircleIcon,
      onClick: () => {
        if (contextMenuPlaylist.value) {
          playPlaylist(contextMenuPlaylist.value)
        }
      }
    })
  )

  items.push(
    createMenuItem('view', '查看详情', {
      icon: ViewListIcon,
      onClick: () => {
        if (contextMenuPlaylist.value) {
          viewPlaylist(contextMenuPlaylist.value)
        }
      }
    })
  )

  items.push(
    createMenuItem('download-all', '全部下载', {
      icon: DownloadIcon,
      onClick: () => {
        if (contextMenuPlaylist.value) {
          downloadPlaylist(contextMenuPlaylist.value)
        }
      }
    })
  )

  items.push(createSeparator())

  // Sync Actions
  if (isSynced) {
    items.push(
      createMenuItem('sync-cloud', '同步到云端', {
        icon: CloudUploadIcon,
        onClick: () => handleSyncToCloud(pl)
      })
    )
    items.push(
      createMenuItem('delete-both', '删除(双端)', {
        icon: DeleteIcon,
        onClick: () => handleDeleteBoth(pl)
      })
    )
  } else {
    items.push(
      createMenuItem('upload-cloud', '上传到云端', {
        icon: CloudUploadIcon,
        onClick: () => handleUploadToCloud(pl)
      })
    )
  }

  items.push(
    createMenuItem('export', '导出歌单', {
      onClick: async () => {
        // ... export logic ...
        if (!contextMenuPlaylist.value) return
        const pl = contextMenuPlaylist.value
        try {
          const res = await songListAPI.getSongs(pl.id)
          if (!res.success) {
            MessagePlugin.error(res.error || '获取歌单歌曲失败')
            return
          }
          const songs = res.data || []
          if (songs.length === 0) {
            MessagePlugin.warning('歌单中没有可导出的歌曲')
            return
          }
          const filtered = songs.filter((s) => s.source !== 'local')
          const removed = songs.length - filtered.length
          const safeName = pl.name.replace(/[\\/:*?"<>|]+/g, '_')
          const fileName = `CeruMusic-${safeName}.cmpl`
          const saved = await exportPlaylistToFile(filtered, fileName)
          if (removed > 0) MessagePlugin.info(`已筛除 ${removed} 首本地歌曲`)
          MessagePlugin.success(`歌单已导出为 ${saved}`)
        } catch (e) {
          MessagePlugin.error(`导出失败: ${(e as Error).message}`)
        }
      }
    })
  )

  items.push(
    createMenuItem('edit', '编辑歌单', {
      icon: Edit2Icon,
      onClick: () => {
        if (contextMenuPlaylist.value) {
          editPlaylist(contextMenuPlaylist.value)
        }
      }
    })
  )

  items.push(
    createMenuItem('delete', '删除歌单(本地)', {
      icon: DeleteIcon,
      onClick: () => handleDeletePlaylist(pl)
    })
  )

  return items
})

// 处理歌单右键菜单
const handlePlaylistContextMenu = (event: MouseEvent, playlist: SongList) => {
  event.preventDefault()
  event.stopPropagation()

  contextMenuPlaylist.value = playlist
  contextMenuPosition.value = calculateMenuPosition(event)
  contextMenuVisible.value = true
}

// 处理右键菜单项点击
const handleContextMenuItemClick = (_item: ContextMenuItem, _event: MouseEvent) => {
  // 菜单项的 onClick 回调已经在 ContextMenuItem 组件中调用
  // 这里不需要额外处理
}

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
  contextMenuPlaylist.value = null
}

// 组件挂载时加载数据
onMounted(() => {
  loadPlaylists()
})
</script>

<template>
  <div class="page">
    <input
      ref="songlistFileInputRef"
      accept=".cmpl,.cpl"
      style="display: none"
      type="file"
      @change="handleSonglistFileChange"
    />
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
              :loading="loading"
              size="small"
              theme="primary"
              variant="text"
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
          <div
            v-for="playlist in playlists"
            :key="playlist.id"
            class="playlist-card"
            @contextmenu="handlePlaylistContextMenu($event, playlist)"
          >
            <div class="playlist-cover" @click="viewPlaylist(playlist)">
              <img
                v-if="playlist.coverImgUrl"
                :alt="playlist.name"
                :src="
                  playlist.coverImgUrl === 'default-cover' ? defaultCover : playlist.coverImgUrl
                "
                class="cover-image"
              />
              <div class="cover-overlay">
                <i class="iconfont icon-bofang"></i>
              </div>
            </div>
            <div class="playlist-info">
              <div class="playlist-name-row" @click="viewPlaylist(playlist)">
                <div :title="playlist.name" class="playlist-name-text">
                  {{ playlist.name }}
                </div>
                <div
                  v-if="
                    playlist.id === favoritesId ||
                    playlist.meta?.isSynced ||
                    playlist.meta?.isCloudOnly
                  "
                  class="playlist-tags"
                >
                  <t-tag
                    v-if="playlist.id === favoritesId"
                    size="small"
                    theme="danger"
                    variant="light-outline"
                    >我的喜欢</t-tag
                  >
                  <t-tooltip
                    v-if="playlist.meta?.isSynced || playlist.meta?.isCloudOnly"
                    :content="playlist.meta?.isSynced ? '已同步' : '仅云端'"
                  >
                    <span style="display: inline-flex; vertical-align: middle">
                      <CloudIcon
                        v-if="playlist.meta?.isSynced"
                        style="color: var(--td-brand-color); font-size: 16px"
                      />
                      <CloudIcon v-else style="color: #999; font-size: 16px" />
                    </span>
                  </t-tooltip>
                </div>
              </div>
              <div :title="playlist.description" class="playlist-description">
                {{ playlist.description || '这个人很懒并没有留下任何描述...' }}
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
                  size="small"
                  theme="primary"
                  variant="text"
                  @click="playPlaylist(playlist)"
                >
                  <i class="iconfont icon-bofang"></i>
                </t-button>
              </t-tooltip>
              <t-tooltip content="查看详情">
                <t-button
                  shape="circle"
                  size="small"
                  theme="default"
                  variant="text"
                  @click="viewPlaylist(playlist)"
                >
                  <view-list-icon
                    :fill-color="'transparent'"
                    :stroke-color="'#000000'"
                    :stroke-width="1.5"
                  />
                </t-button>
              </t-tooltip>
              <t-tooltip content="编辑歌单">
                <t-button
                  shape="circle"
                  size="small"
                  theme="success"
                  variant="text"
                  @click="editPlaylist(playlist)"
                >
                  <Edit2Icon />
                </t-button>
              </t-tooltip>

              <t-tooltip content="删除歌单">
                <t-button
                  shape="circle"
                  size="small"
                  theme="danger"
                  variant="text"
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
    </div>

    <!-- 创建歌单对话框 -->
    <t-dialog
      v-model:visible="showCreatePlaylistDialog"
      :cancel-btn="{ content: '取消' }"
      :confirm-btn="{ content: '创建', theme: 'primary' }"
      header="创建新歌单"
      placement="center"
      width="500px"
      @confirm="createPlaylist"
    >
      <div class="create-form">
        <t-form :data="newPlaylistForm" layout="vertical">
          <t-form-item label="歌单名称" name="name" required>
            <t-input
              v-model="newPlaylistForm.name"
              clearable
              placeholder="请输入歌单名称"
              @keyup.enter="createPlaylist"
            />
          </t-form-item>
          <t-form-item label="歌单描述" name="description">
            <t-textarea
              v-model="newPlaylistForm.description"
              :autosize="{ minRows: 3, maxRows: 5 }"
              :maxlength="200"
              placeholder="请输入歌单描述（可选）"
            />
          </t-form-item>
        </t-form>
      </div>
    </t-dialog>

    <!-- 导入选择对话框 -->
    <t-dialog
      v-model:visible="showImportDialog"
      :footer="false"
      header="选择导入方式"
      placement="center"
      width="400px"
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
        <div class="import-option" @click="triggerSonglistFileInput">
          <div class="option-icon">
            <i class="iconfont icon-daoru"></i>
          </div>
          <div class="option-content">
            <h4>从本地歌单文件</h4>
            <p>导入加密歌单文件（.cmpl/.cpl）</p>
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
            <p>导入网易云音乐、QQ音乐等平台歌单</p>
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
      v-model:visible="showNetworkImportDialog"
      :cancel-btn="{ content: '取消', variant: 'outline' }"
      :confirm-btn="{ content: '开始导入', theme: 'primary' }"
      :style="{ maxHeight: '80vh' }"
      header="导入网络歌单"
      placement="center"
      width="600px"
      @cancel="cancelNetworkImport"
      @confirm="confirmNetworkImport"
    >
      <div class="network-import-content">
        <!-- 平台选择 -->
        <div class="platform-selector">
          <label class="form-label">选择导入平台</label>
          <t-radio-group v-model="importPlatformType" variant="primary-filled">
            <t-radio-button value="wy"> 网易云音乐 </t-radio-button>
            <t-radio-button value="tx"> QQ音乐 </t-radio-button>
            <t-radio-button value="kw"> 酷我音乐 </t-radio-button>
            <t-radio-button value="bd"> 波点音乐 </t-radio-button>
            <t-radio-button value="kg"> 酷狗音乐 </t-radio-button>
            <t-radio-button value="mg"> 咪咕音乐 </t-radio-button>
          </t-radio-group>
        </div>

        <!-- 内容区域 - 添加过渡动画 -->
        <div class="import-content-wrapper">
          <transition mode="out-in" name="fade-slide">
            <div :key="importPlatformType" class="import-content">
              <div style="margin-bottom: 1em">
                请输入{{
                  importPlatformType === 'wy'
                    ? '网易云音乐'
                    : importPlatformType === 'tx'
                      ? 'QQ音乐'
                      : importPlatformType === 'kw'
                        ? '酷我音乐'
                        : importPlatformType === 'bd'
                          ? '波点音乐'
                          : importPlatformType === 'kg'
                            ? '酷狗音乐'
                            : importPlatformType === 'mg'
                              ? '咪咕音乐'
                              : '音乐平台'
                }}歌单链接或歌单ID，系统将自动识别格式并导入歌单中的所有歌曲到本地歌单。
              </div>
              <t-input
                v-model="networkPlaylistUrl"
                :placeholder="
                  importPlatformType === 'wy'
                    ? '支持链接或ID：https://music.163.com/playlist?id=123456789 或 123456789'
                    : importPlatformType === 'tx'
                      ? '支持链接或ID：https://y.qq.com/n/ryqq/playlist/123456789 或 123456789'
                      : importPlatformType === 'kw'
                        ? '支持链接或ID：http://www.kuwo.cn/playlist_detail/123456789 或 123456789'
                        : importPlatformType === 'bd'
                          ? '支持链接或ID：https://h5app.kuwo.cn/m/bodian/collection.html?playlistId=123456789 或 123456789'
                          : importPlatformType === 'kg'
                            ? '手机链接或酷狗码：https://www.kugou.com/yy/special/single/123456789 或 123456789'
                            : importPlatformType === 'mg'
                              ? '支持链接或ID：https://music.migu.cn/v3/music/playlist/123456789 或 123456789'
                              : '请输入歌单链接或ID'
                "
                autofocus
                class="url-input"
                clearable
                @enter="confirmNetworkImport"
              />

              <div class="import-tips">
                <p class="tip-title">
                  {{
                    importPlatformType === 'wy'
                      ? '网易云音乐'
                      : importPlatformType === 'tx'
                        ? 'QQ音乐'
                        : importPlatformType === 'kw'
                          ? '酷我音乐'
                          : importPlatformType === 'bd'
                            ? '波点音乐'
                            : importPlatformType === 'kg'
                              ? '酷狗音乐'
                              : importPlatformType === 'mg'
                                ? '咪咕音乐'
                                : '音乐平台'
                  }}支持的输入格式：
                </p>
                <ul v-if="importPlatformType === 'wy'" class="tip-list">
                  <li>完整链接：https://music.163.com/playlist?id=123456789</li>
                  <li>手机链接：https://music.163.com/m/playlist?id=123456789</li>
                  <li>分享链接：https://y.music.163.com/m/playlist/123456789</li>
                  <li>纯数字ID：123456789</li>
                  <li>其他包含ID的网易云链接格式</li>
                </ul>
                <ul v-else-if="importPlatformType === 'tx'" class="tip-list">
                  <li>完整链接：https://y.qq.com/n/ryqq/playlist/123456789</li>
                  <li>手机链接：https://i.y.qq.com/v8/playsquare/playlist.html?id=123456789</li>
                  <li>分享链接：https://i.y.qq.com/n2/m/share/details/taoge.html?id=123456789</li>
                  <li>其他分享：https://c.y.qq.com/base/fcgi-bin/u?__=123456789</li>
                  <li>纯数字ID：123456789</li>
                </ul>
                <ul v-else-if="importPlatformType === 'kw'" class="tip-list">
                  <li>完整链接：http://www.kuwo.cn/playlist_detail/123456789</li>
                  <li>手机链接：http://m.kuwo.cn/h5app/playlist/123456789</li>
                  <li>参数链接：http://www.kuwo.cn/playlist?pid=123456789</li>
                  <li>纯数字ID：123456789</li>
                  <li>其他包含ID的酷我音乐链接格式</li>
                </ul>
                <ul v-else-if="importPlatformType === 'bd'" class="tip-list">
                  <li>
                    手机链接：https://h5app.kuwo.cn/m/bodian/collection.html?playlistId=123456789
                  </li>
                  <li>纯数字ID：123456789</li>
                  <li>其他包含ID的波点音乐链接格式</li>
                </ul>
                <ul v-else-if="importPlatformType === 'kg'" class="tip-list">
                  <li>酷狗码（推荐）：123456789</li>
                  <li>完整链接：https://www.kugou.com/yy/special/single/123456789</li>
                  <li>手机版链接：https://m.kugou.com/songlist/gcid_3z9vj0yqz4bz00b</li>
                  <li>旧版手机链接：https://m.kugou.com/playlist?id=123456789</li>
                  <li>参数链接：https://www.kugou.com/playlist?specialid=123456789</li>
                </ul>
                <ul v-else-if="importPlatformType === 'mg'" class="tip-list">
                  <li>完整链接：https://music.migu.cn/v3/music/playlist/123456789</li>
                  <li>手机链接：https://m.music.migu.cn/playlist?id=123456789</li>
                  <li>参数链接：https://music.migu.cn/playlist?id=123456789</li>
                  <li>纯数字ID：123456789</li>
                  <li>其他包含ID的咪咕音乐链接格式</li>
                </ul>
                <p class="tip-note">智能识别：系统会自动从输入中提取歌单ID</p>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </t-dialog>

    <!-- 编辑歌单对话框 -->
    <t-dialog
      v-model:visible="showEditPlaylistDialog"
      :cancel-btn="{ content: '取消', variant: 'outline' }"
      :confirm-btn="{ content: '保存', theme: 'primary' }"
      header="编辑歌单信息"
      placement="center"
      width="500px"
      @cancel="cancelPlaylistEdit"
      @confirm="savePlaylistEdit"
    >
      <div class="edit-playlist-content">
        <div class="form-item">
          <label class="form-label">歌单名称</label>
          <t-input
            v-model="editPlaylistForm.name"
            autofocus
            clearable
            maxlength="50"
            placeholder="请输入歌单名称"
            show-word-limit
          />
        </div>

        <div class="form-item">
          <label class="form-label">歌单描述</label>
          <t-textarea
            v-model="editPlaylistForm.description"
            :autosize="{ minRows: 3, maxRows: 6 }"
            maxlength="200"
            placeholder="请输入歌单描述（可选）"
            show-word-limit
          />
        </div>
      </div>
    </t-dialog>

    <!-- 歌单右键菜单 -->
    <ContextMenu
      v-model:visible="contextMenuVisible"
      :items="contextMenuItems"
      :position="contextMenuPosition"
      @close="closeContextMenu"
      @item-click="handleContextMenuItemClick"
    />
  </div>
</template>

<style lang="scss" scoped>
.page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
}
.local-container {
  padding: 2rem;
  padding-top: 1rem;
  margin: 0 auto;
  width: 100%;
  position: relative;
  // background: var(--local-bg);
  color: var(--local-text-primary);
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
      color: var(--local-text-primary);
      font-size: 14px;
    }
  }

  .form-tips {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--local-tips-bg);
    border-radius: 6px;
    border-left: 3px solid var(--td-success-color);

    .tip-note {
      margin: 0;
      color: var(--local-text-secondary);
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 0.5rem;

      .iconfont {
        color: var(--td-success-color);
        font-size: 14px;
      }
    }
  }
}

// 网络歌单导入对话框样式
.network-import-content {
  max-height: 60vh;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 0 10px;
  // 自定义滚动条样式
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 3px;

    &:hover {
      background: #a8a8a8;
    }
  }

  .platform-selector {
    margin-bottom: 2rem;
    position: sticky;
    top: 0;
    background: var(--td-bg-color-container);
    z-index: 10;
    padding: 0.5rem 0;
    margin: -0.5rem 0 1.5rem 0;
    border-bottom: 1px solid var(--local-border);

    .form-label {
      display: block;
      margin-bottom: 1rem;
      font-weight: 600;
      color: var(--local-text-primary);
      font-size: 15px;
    }

    :deep(.t-radio-group) {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
    }

    :deep(.t-radio-button) {
      display: flex;
      justify-content: center;
      align-items: center;

      .t-radio-button__label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-weight: 500;
        text-align: center;

        .iconfont {
          font-size: 16px;
          transition: all 0.2s ease;
        }
      }

      &.t-is-checked .t-radio-button__label .iconfont {
        transform: scale(1.1);
      }
    }
  }

  .import-content-wrapper {
    position: relative;
    min-height: 200px;
    flex: 1;
  }

  .import-content {
    .import-description {
      margin-bottom: 1.25rem;
      color: var(--local-text-secondary);
      font-size: 14px;
      line-height: 1.6;
      padding: 1rem;
      background: var(--local-tips-bg);
      border-radius: 8px;
      border-left: 4px solid var(--td-brand-color-4);
    }

    .url-input {
      margin-bottom: 1.5rem;
    }

    .import-tips {
      background: var(--local-tips-bg);
      border-radius: 12px;
      padding: 1.25rem;
      border: 1px solid var(--local-border);
      position: relative;
      overflow: hidden;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(to bottom, var(--td-brand-color-4), var(--td-brand-color-6));
      }

      .tip-title {
        margin: 0 0 0.75rem 0;
        font-weight: 600;
        color: var(--local-text-primary);
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 0.5rem;

        &::before {
          content: '💡';
          font-size: 16px;
        }
      }

      .tip-list {
        margin: 0 0 0.75rem 0;
        padding-left: 1.5rem;

        li {
          color: var(--local-text-secondary);
          font-size: 13px;
          margin-bottom: 0.5rem;
          font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
          padding: 0.25rem 0.5rem;
          background: var(--local-code-bg);
          border-radius: 4px;
          transition: all 0.2s ease;

          &:hover {
            background: var(--local-code-hover-bg);
            transform: translateX(4px);
          }
        }
      }

      .tip-note {
        margin: 0;
        color: var(--local-text-tertiary);
        font-size: 12px;
        font-style: italic;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--local-note-bg);
        border-radius: 6px;

        &::before {
          content: '✨';
          font-size: 14px;
        }
      }
    }
  }

  // 过渡动画
  .fade-slide-enter-active,
  .fade-slide-leave-active {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .fade-slide-enter-from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }

  .fade-slide-leave-to {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }

  .fade-slide-enter-to,
  .fade-slide-leave-from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
  font-family: Arial, Helvetica, sans-serif;

  .header-left {
    h2 {
      border-left: 8px solid var(--td-brand-color-3);
      padding-left: 12px;
      border-radius: 8px;
      line-height: 1.5em;
      color: var(--local-text-primary);
      margin-bottom: 0.5rem;
      font-size: 1.875rem;
      font-weight: 600;
    }

    .stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--local-text-secondary);

      span {
        &:not(:last-child)::after {
          content: '•';
          margin-left: 1rem;
          color: var(--local-border);
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
      color: var(--local-text-primary);
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
  display: flex;
  flex-direction: column;
  background: var(--local-card-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: var(--local-card-shadow);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--local-card-shadow-hover);

    .playlist-cover .cover-overlay {
      opacity: 1;
    }
  }

  .playlist-cover {
    height: 180px;
    background: #e4e4e4;
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
    flex: 1;
    display: flex;
    flex-direction: column;
    .playlist-name-row {
      display: flex;
      align-items: flex-start;
      margin-bottom: 0.5rem;
      cursor: pointer;
      gap: 6px;

      &:hover .playlist-name-text {
        color: var(--td-brand-color);
      }

      .playlist-name-text {
        font-weight: 600;
        color: var(--local-text-primary);
        font-size: 1rem;

        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: break-all;
        line-height: 1.4;
      }

      .playlist-tags {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        height: 1.4em;
        margin-top: 1px;
      }
    }

    .playlist-description {
      flex: 1;
      font-size: 0.78rem;
      color: var(--local-text-secondary);
      margin-bottom: 0.5rem;
      display: -webkit-box;

      -webkit-line-clamp: 2;
      // white-space: nowrap;
      overflow: hidden;
      -webkit-box-orient: vertical;

      text-overflow: ellipsis;
    }

    .playlist-meta {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--local-text-tertiary);

      span {
        &:first-child {
          text-transform: uppercase;
          font-weight: 500;
          color: var(--td-brand-color);
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
      color: var(--local-text-tertiary);
    }
  }

  h4 {
    color: var(--local-text-primary);
    margin-bottom: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
  }

  p {
    color: var(--local-text-secondary);
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
  background: var(--local-card-bg);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: var(--local-card-shadow);
}

.list-header {
  display: grid;
  width: 100%;
  grid-template-columns: 0.5fr 2fr 1fr 2fr 1fr 1fr 1fr 1fr;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: var(--local-header-bg);
  border-bottom: 1px solid var(--local-border);

  .header-item {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--local-text-secondary);
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
    border-bottom: 1px solid var(--local-border);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: var(--local-hover-bg);

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
        color: var(--local-text-secondary);
        font-weight: 500;
      }

      &.title {
        .song-title {
          font-weight: 500;
          color: var(--local-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      &.artist,
      &.album {
        color: var(--local-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      &.duration,
      &.size {
        color: var(--local-text-secondary);
        font-variant-numeric: tabular-nums;
      }

      &.format {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.125rem;

        .format-badge {
          background: var(--local-badge-bg);
          color: var(--local-text-secondary);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .bitrate {
          font-size: 0.75rem;
          color: var(--local-text-tertiary);
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
      color: var(--local-text-tertiary);
    }
  }

  h3 {
    color: var(--local-text-primary);
    margin-bottom: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
  }

  p {
    color: var(--local-text-secondary);
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
  border: 1px solid var(--local-border);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--local-card-bg);

  &:hover {
    border-color: var(--td-brand-color-4);
    background-color: var(--local-hover-bg);
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
      color: var(--local-text-primary);
      margin-bottom: 0.25rem;
    }

    p {
      font-size: 0.875rem;
      color: var(--local-text-secondary);
      margin: 0;
    }

    .coming-soon {
      display: inline-block;
      background: var(--local-warning-bg);
      color: var(--local-warning-text);
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
      color: var(--local-text-tertiary);
    }
  }
}
</style>
