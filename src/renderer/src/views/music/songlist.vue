<script lang="ts" setup>
import {
  playlistImporters,
  playlistImportMenus,
  pluginImportRequest,
  libraryRevision
} from '@renderer/services/pluginState'
import { toAppTrack } from '@common/pluginMusic'
import PluginPlaylistSections from '@renderer/components/PluginPlaylistSections.vue'
import { ref, onMounted, computed, toRaw, h, nextTick, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { NIcon, NDropdown } from 'naive-ui'
import {
  Edit2Icon,
  PlayCircleIcon,
  DeleteIcon,
  ViewListIcon,
  DownloadIcon,
  ShareIcon,
  RefreshIcon,
  FileExportIcon
} from 'tdesign-icons-vue-next'
import { createQualityDialog } from '@renderer/utils/audio/download'
import { calculateBestQuality } from '@common/utils/quality'
import { pluginQualityOrder, batchQualityChoices } from '@renderer/utils/pluginQuality'
import songListAPI from '@renderer/api/songList'
import type { SongList, Songs } from '@common/types/songList'
import defaultCover from '/default-cover.png'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
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
import SharePlaylistDialog from '@renderer/components/Share/SharePlaylistDialog.vue'
import { useAuthStore } from '@renderer/store'

const settingsStore = useSettingsStore()

// 歌单列表
const playlists = ref<SongList[]>([])
const loading = ref(false)
// 喜欢歌单ID（用于排序与标记）
const favoritesId = ref<string | null>(null)

const updatePlaylistState = (id: string, payload: Partial<SongList>) => {
  const idx = playlists.value.findIndex((p) => p.id === id)
  if (idx !== -1) {
    playlists.value[idx] = { ...playlists.value[idx], ...payload }
  }
}
const addPlaylistState = (pl: SongList) => {
  playlists.value.unshift(pl)
}
const removePlaylistState = (id: string) => {
  const idx = playlists.value.findIndex((p) => p.id === id)
  if (idx !== -1) playlists.value.splice(idx, 1)
}

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

// 封面 URL(空或占位时回退到 defaultCover) - 用于 hover 模糊背板
const getCoverUrl = (p: SongList): string =>
  p.coverImgUrl && p.coverImgUrl !== 'default-cover' ? p.coverImgUrl : defaultCover

const formatLocalTime = (input: string | number | Date): string => {
  const d = new Date(input)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuPlaylist = ref<SongList | null>(null)
const sharePlaylistDialogVisible = ref(false)
const shareTargetPlaylist = ref<SongList | null>(null)
const shareTargetPlaylistSongCount = ref(0)
const songlistFileInputRef = ref<HTMLInputElement | null>(null)
const songlistUploadedFile = ref<File | null>(null)

// 渲染图标辅助函数
const renderIcon = (icon: Component) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}

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
      addPlaylistState({
        id: createRes.data.id,
        name: finalName,
        description: '从本地歌单文件导入',
        coverImgUrl: 'default-cover',
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        source: 'local',
        meta: {}
      } as SongList)
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

// 加载歌单列表
const loadPlaylists = async () => {
  loading.value = true
  const authStore = useAuthStore()
  console.log('authStore.isAuthenticated', authStore.isAuthenticated)
  try {
    async function getCloudSongList() {
      if (!authStore.isAuthenticated) {
        console.log('未登录跳过云歌单')
        return []
      }
      return await cloudSongListAPI.getUserSongLists().catch((err) => {
        MessagePlugin.error(err.message || '获取云歌单失败')
        return []
      })
    }
    const [localRes, cloudRes] = await Promise.all([songListAPI.getAll(), getCloudSongList()])

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
      const created = {
        id: result.data!.id,
        name: newPlaylistForm.value.name,
        description: newPlaylistForm.value.description,
        coverImgUrl: 'default-cover',
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        source: 'local' as const,
        meta: {}
      } as SongList
      addPlaylistState(created)
      newPlaylistForm.value = { name: '我的歌单', description: '这是我创建的歌单' }
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
        const resp = await cloudSongListAPI.updateUserSongList({
          listId: currentEditingPlaylist.value.id,
          name: editPlaylistForm.value.name.trim(),
          describe: editPlaylistForm.value.description.trim()
        })
        updatePlaylistState(currentEditingPlaylist.value.id, {
          name: editPlaylistForm.value.name.trim(),
          description: editPlaylistForm.value.description.trim(),
          meta: {
            ...(currentEditingPlaylist.value.meta || {}),
            cloudUpdatedAt: resp.updatedAt
          }
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
      if (result.success) {
        updatePlaylistState(currentEditingPlaylist.value.id, {
          name: editPlaylistForm.value.name.trim(),
          description: editPlaylistForm.value.description.trim()
        })
      }
    }

    if (success) {
      MessagePlugin.success('歌单信息更新成功')
      showEditPlaylistDialog.value = false
      currentEditingPlaylist.value = null
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
          removePlaylistState(playlist.id)
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

// 获取来源名称
const getSourceName = (source: string | undefined): string => {
  const sourceMap: Record<string, string> = {
    qq: 'QQ音乐',
    wy: '网易云',
    kg: '酷狗',
    kw: '酷我',
    mg: '咪咕',
    local: '本地'
  }
  return sourceMap[source || ''] || source || '未知'
}

// 同步平台歌单 - 跳转到详情页并自动触发同步
const syncPlatformPlaylist = (playlist: SongList) => {
  router.push({
    name: 'list',
    params: { id: playlist.id },
    query: {
      title: playlist.name,
      author: 'local',
      cover: playlist.coverImgUrl || '',
      total: '0',
      source: playlist.source,
      type: 'local',
      meta: JSON.stringify(playlist.meta),
      description: playlist.description || '',
      cloudId: playlist.meta?.cloudId,
      autoSync: '1' // 标记自动触发同步
    }
  })
}

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
        description: playlist.description || '',
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
      description: playlist.description || '',
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
      addPlaylistState({
        id: createResult.data!.id,
        name: playlistName,
        description: `从播放列表导入，共 ${currentPlaylist.length} 首歌曲`,
        coverImgUrl: 'default-cover',
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        source: 'local',
        meta: {}
      } as SongList)
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
const importPlatformType = ref('')
const importOwner = ref('')
const importDialogTitle = ref('导入歌单')
const availableImporters = computed(() =>
  playlistImporters.value.filter((item) => item.pluginId === importOwner.value)
)
const importMenuBusy = ref(false)
const importAuth = useAuthStore()
const visibleImportMenus = computed(() =>
  playlistImportMenus.value.filter(
    (item) =>
      (!item.when?.loggedIn || importAuth.isAuthenticated) &&
      (!item.when?.kinds?.length || item.when.kinds.includes('playlist'))
  )
)
const selectedImporter = computed(() =>
  availableImporters.value.find((item) => item.value === importPlatformType.value)
)
watch(availableImporters, (importers) => {
  if (!importers.length) {
    showNetworkImportDialog.value = false
    importPlatformType.value = ''
  } else if (!importers.some((item) => item.value === importPlatformType.value)) {
    importPlatformType.value = importers[0].value
  }
})
watch(
  pluginImportRequest,
  (request) => {
    if (!request) return
    const importers = playlistImporters.value.filter((item) => item.pluginId === request.pluginId)
    const selected = request.importerId
      ? importers.find((item) => item.id === request.importerId)
      : importers[0]
    if (!selected) {
      pluginImportRequest.value = null
      MessagePlugin.warning('该歌单导入功能已不可用，请先使用对应插件')
      return
    }
    importOwner.value = request.pluginId
    importDialogTitle.value = request.title || '导入歌单'
    importPlatformType.value = selected.value
    showImportDialog.value = false
    networkPlaylistUrl.value = request.initialValue || ''
    showNetworkImportDialog.value = true
    pluginImportRequest.value = null
  },
  { immediate: true }
)
watch(libraryRevision, () => {
  void loadPlaylists()
})

// 从网络歌单导入
const openPluginImport = async (entry: { pluginId: string; id: string }) => {
  if (importMenuBusy.value) return
  importMenuBusy.value = true
  try {
    await window.api.plugins.openPlaylistImportMenu(entry.pluginId, entry.id)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '打开导入方式失败')
  } finally {
    importMenuBusy.value = false
  }
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
  importPlatformType.value = availableImporters.value[0]?.value || ''
}

// Platform parsing, signatures and pagination are implemented by the selected plugin.
const handleNetworkPlaylistImport = async (input: string) => {
  const importer = availableImporters.value.find((item) => item.value === importPlatformType.value)
  if (!importer) {
    MessagePlugin.warning('请先使用提供歌单导入功能的插件')
    return
  }
  const loading = await MessagePlugin.loading('正在获取歌单信息...', 0)
  let createdId: string | undefined
  try {
    const seen = new Set<string>()
    const tracks = new Map<string, any>()
    let cursor: string | undefined
    let name = importer.title
    let description = ''
    let artwork = ''
    do {
      const result = await window.api.plugins.importerTracks(importer.pluginId, importer.id, {
        value: input,
        cursor,
        limit: 100
      })
      name = result.name || name
      description = result.playlist?.description || description
      artwork = result.playlist?.artworkUrl || artwork
      for (const item of result.items)
        tracks.set(
          item.ref.pluginId + ':' + item.ref.providerId + ':' + item.ref.id,
          toAppTrack(item)
        )
      cursor = result.nextCursor
      if (cursor && seen.has(cursor)) throw new Error('插件返回了重复的分页游标，已停止导入')
      if (cursor) seen.add(cursor)
      if (seen.size > 1000 || tracks.size > 100000) throw new Error('歌单过大，请分批导入')
    } while (cursor)
    if (!tracks.size) {
      MessagePlugin.warning('该歌单没有歌曲')
      return
    }
    const created = await songListAPI.create(
      name + ' (导入)',
      description || '从' + importer.title + '导入',
      importer.providerId || 'local',
      { playlistId: input, pluginId: importer.pluginId, importerId: importer.id }
    )
    if (!created.success || !created.data) throw new Error(created.error || '创建歌单失败')
    createdId = created.data.id
    const result = await songListAPI.addSongs(createdId, [...tracks.values()])
    if (!result.success) throw new Error(result.error || '保存歌曲失败')
    if (artwork) await songListAPI.updateCover(createdId, artwork)
    createdId = undefined
    await loadPlaylists()
    MessagePlugin.success('歌单导入完成，共 ' + tracks.size + ' 首歌曲')
  } catch (error) {
    if (createdId) await songListAPI.delete(createdId)
    MessagePlugin.error(error instanceof Error ? error.message : String(error))
  } finally {
    loading.close()
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
    const allPossibleTypes = batchQualityChoices(songs)

    // 2. 弹出音质选择框
    const userQuality = await createQualityDialog(
      allPossibleTypes,
      LocalUserDetail.userSource.quality || '128k',
      '选择批量下载音质(自动降级)'
    )

    if (!userQuality) return

    const tasks: any[] = []
    const d = new Date()
    for (const song of songs) {
      if (song.source === 'local') continue

      let qualityToUse = userQuality
      if (song.types && song.types.length > 0) {
        const best = calculateBestQuality(song.types, userQuality, pluginQualityOrder(song.source))
        if (best) qualityToUse = best
      }

      const songInfoWithTemplate = {
        ...toRaw(song),
        template: settingsStore.settings.filenameTemplate || '%t - %s',
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      tasks.push({
        pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
        source: song.source,
        quality: qualityToUse,
        songInfo: songInfoWithTemplate as any,
        tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
        lazy: true
      })
    }

    if (tasks.length === 0) {
      MessagePlugin.warning('没有可下载的在线歌曲')
      return
    }

    await window.api.music.requestSdk('downloadBatchSongs', {
      source: songs[0]?.source || 'wy',
      tasks
    })
    MessagePlugin.success(`已添加 ${tasks.length} 首歌曲到下载队列`)
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

const openPlaylistShareDialog = async (pl: SongList) => {
  shareTargetPlaylist.value = pl
  try {
    const res = await songListAPI.getSongs(pl.id)
    shareTargetPlaylistSongCount.value = res.success
      ? (res.data || []).filter((s) => s.source !== 'local').length
      : 0
  } catch {
    shareTargetPlaylistSongCount.value = 0
  }
  sharePlaylistDialogVisible.value = true
}

const handleSharePlaylist = async (pl: SongList) => {
  if (pl.meta?.cloudId) {
    openPlaylistShareDialog(pl)
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '先上传到云端',
    body: `歌单"${pl.name}"需要先上传到云端后才能分享，是否继续？`,
    confirmBtn: '上传并分享',
    cancelBtn: '取消',
    onConfirm: async () => {
      dialog.destroy()
      let songs: any[] = []
      try {
        const res = await songListAPI.getSongs(pl.id)
        if (!res.success) throw new Error(res.error || '获取歌曲失败')
        songs = [...(res.data || [])]
      } catch (e: any) {
        MessagePlugin.error('获取歌曲失败: ' + (e.message || '未知错误'))
        return
      }

      try {
        const newMeta = await handleUploadToCloudHelper(
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
        const patched = {
          ...pl,
          meta: {
            ...(pl.meta || {}),
            ...(newMeta || {})
          }
        }
        updatePlaylistState(pl.id, { meta: patched.meta })
        openPlaylistShareDialog(patched as SongList)
      } catch {
        // helper 内已提示
      }
    },
    onCancel: () => dialog.destroy()
  })
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
    removePlaylistState(pl.id)
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
        removePlaylistState(pl.id)
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
          removePlaylistState(pl.id)
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

// 右键菜单项配置 (Naive UI Dropdown 格式)
const contextMenuOptions = computed(() => {
  if (!contextMenuPlaylist.value) return []
  const pl = contextMenuPlaylist.value
  const isCloudOnly = pl.meta?.isCloudOnly
  const isSynced = pl.meta?.isSynced

  // ========== 云端歌单菜单 ==========
  if (isCloudOnly) {
    return [
      { label: '播放歌单', key: 'play', icon: renderIcon(PlayCircleIcon) },
      { label: '查看详情', key: 'view', icon: renderIcon(ViewListIcon) },
      { type: 'divider', key: 'd1' },
      { label: '分享歌单', key: 'share-playlist', icon: renderIcon(ShareIcon) },
      { label: '下载到本地', key: 'download-cloud', icon: renderIcon(CloudDownloadIcon) },
      { type: 'divider', key: 'd2' },
      { label: '删除云端歌单', key: 'delete-cloud', icon: renderIcon(DeleteIcon) }
    ]
  }

  // ========== 本地/已同步歌单菜单 ==========
  const items: any[] = [
    { label: '播放歌单', key: 'play', icon: renderIcon(PlayCircleIcon) },
    { label: '查看详情', key: 'view', icon: renderIcon(ViewListIcon) }
  ]

  // 同步平台歌单 - 仅对有 playlistId 的歌单显示
  const hasPlatformPlaylistId = pl.meta && 'playlistId' in pl.meta
  if (hasPlatformPlaylistId) {
    const sourceName = getSourceName(pl.meta?.source || pl.source)
    items.push({
      label: `同步平台歌单(${sourceName})`,
      key: 'sync-platform',
      icon: renderIcon(RefreshIcon)
    })
  }

  items.push({ type: 'divider', key: 'd1' })

  // 云端操作
  if (isSynced) {
    items.push({ label: '同步到云端', key: 'sync-cloud', icon: renderIcon(CloudUploadIcon) })
  } else {
    items.push({ label: '上传到云端', key: 'upload-cloud', icon: renderIcon(CloudUploadIcon) })
  }

  items.push(
    { label: '分享歌单', key: 'share-playlist', icon: renderIcon(ShareIcon) },
    { label: '全部下载', key: 'download-all', icon: renderIcon(DownloadIcon) },
    { type: 'divider', key: 'd2' },
    { label: '编辑歌单', key: 'edit', icon: renderIcon(Edit2Icon) },
    { label: '导出歌单', key: 'export', icon: renderIcon(FileExportIcon) },
    { type: 'divider', key: 'd3' }
  )

  // 删除操作 - 已同步歌单显示二级菜单，普通本地歌单直接删除
  if (isSynced) {
    items.push({
      label: '删除',
      key: 'delete-menu',
      icon: renderIcon(DeleteIcon),
      children: [
        { label: '删除本地歌单', key: 'delete-local' },
        { label: '删除云端歌单', key: 'delete-cloud-only' },
        { label: '删除(双端)', key: 'delete-both' }
      ]
    })
  } else {
    items.push({ label: '删除歌单', key: 'delete', icon: renderIcon(DeleteIcon) })
  }

  return items
})

// 处理右键菜单选择
const handleContextMenuSelect = async (key: string) => {
  const pl = contextMenuPlaylist.value
  if (!pl) return

  contextMenuVisible.value = false

  switch (key) {
    case 'play':
      playPlaylist(pl)
      break
    case 'view':
      viewPlaylist(pl)
      break
    case 'sync-platform':
      syncPlatformPlaylist(pl)
      break
    case 'sync-cloud':
      handleSyncToCloud(pl)
      break
    case 'upload-cloud':
      handleUploadToCloud(pl)
      break
    case 'share-playlist':
      handleSharePlaylist(pl)
      break
    case 'download-all':
      downloadPlaylist(pl)
      break
    case 'download-cloud':
      handleDownloadCloudPlaylist(pl)
      break
    case 'edit':
      editPlaylist(pl)
      break
    case 'export':
      await handleExportPlaylist(pl)
      break
    case 'delete':
    case 'delete-local':
      handleDeletePlaylist(pl)
      break
    case 'delete-cloud':
    case 'delete-cloud-only':
      handleDeleteCloudPlaylist(pl)
      break
    case 'delete-both':
      handleDeleteBoth(pl)
      break
  }
}

// 导出歌单处理函数
const handleExportPlaylist = async (pl: SongList) => {
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

// 处理歌单右键菜单
const handlePlaylistContextMenu = (event: MouseEvent, playlist: SongList) => {
  event.preventDefault()
  event.stopPropagation()

  // 先关闭再打开，确保位置更新
  contextMenuVisible.value = false
  nextTick(() => {
    contextMenuPlaylist.value = playlist
    contextMenuX.value = event.clientX
    contextMenuY.value = event.clientY
    contextMenuVisible.value = true
  })
}

// 关闭右键菜单
const closeContextMenu = () => {
  contextMenuVisible.value = false
}

// 滚动位置保持
const scrollRef = ref<HTMLElement>()
const scrollTop = ref(0)

// 组件挂载时加载数据
onMounted(() => {
  loadPlaylists()
  // 监听页面滚动，关闭右键菜单
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.addEventListener('scroll', handleScrollCloseMenu, { passive: true })
    }
  })
})

onBeforeUnmount(() => {
  if (scrollRef.value) {
    scrollRef.value.removeEventListener('scroll', handleScrollCloseMenu)
  }
})

// 滚动时关闭右键菜单
const handleScrollCloseMenu = () => {
  if (contextMenuVisible.value) {
    closeContextMenu()
  }
}

onActivated(() => {
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollTop.value
  }
})

onDeactivated(() => {
  if (scrollRef.value) {
    scrollTop.value = scrollRef.value.scrollTop
  }
})
</script>

<template>
  <div ref="scrollRef" class="page">
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
          <h2>歌单</h2>
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
            :class="{ 'custom-bg': settingsStore.settings.globalBackground?.enable }"
            :style="{ '--cover-url': `url('${getCoverUrl(playlist)}')` }"
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
                <span v-if="playlist.meta?.cloudUpdatedAt"
                  >更新于 {{ formatLocalTime(playlist.meta.cloudUpdatedAt) }}</span
                >
                <span v-else-if="playlist.createTime"
                  >创建于 {{ formatLocalTime(playlist.createTime) }}</span
                >
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
      <PluginPlaylistSections :ready="!loading" />
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
        <div
          v-for="entry in visibleImportMenus"
          :key="entry.value"
          :aria-disabled="importMenuBusy"
          class="import-option"
          role="button"
          tabindex="0"
          @click="openPluginImport(entry)"
          @keydown.enter="openPluginImport(entry)"
          @keydown.space.prevent="openPluginImport(entry)"
        >
          <div class="option-icon">
            <t-icon name="internet" />
          </div>
          <div class="option-content">
            <h4>{{ entry.title }}</h4>
            <p v-if="entry.description">{{ entry.description }}</p>
            <small class="import-provider">{{ entry.pluginName }}</small>
          </div>
          <div class="option-arrow">
            <t-icon name="chevron-right" />
          </div>
        </div>
      </div>
    </t-dialog>
    <!-- 网络歌单导入对话框 -->
    <t-dialog
      v-model:visible="showNetworkImportDialog"
      :destroy-on-close="false"
      :lazy="false"
      :cancel-btn="{ content: '取消', variant: 'outline' }"
      :confirm-btn="{ content: '开始导入', theme: 'primary' }"
      :style="{ maxHeight: '80vh' }"
      :header="importDialogTitle"
      placement="center"
      width="600px"
      @cancel="cancelNetworkImport"
      @confirm="confirmNetworkImport"
    >
      <div class="network-import-content">
        <div class="platform-selector">
          <label class="form-label">选择导入平台</label>
          <t-radio-group v-model="importPlatformType" variant="primary-filled">
            <t-radio-button
              v-for="item in availableImporters"
              :key="item.value"
              :value="item.value"
              >{{ item.title }}</t-radio-button
            >
          </t-radio-group>
        </div>
        <div class="import-content-wrapper">
          <div class="import-content">
            <p class="import-description">
              {{ selectedImporter?.description || '粘贴歌单链接或 ID，将歌曲导入到本地歌单。' }}
            </p>
            <t-input
              v-model="networkPlaylistUrl"
              :placeholder="selectedImporter?.placeholder || '请输入歌单链接或 ID'"
              autofocus
              clearable
              class="url-input"
              @enter="confirmNetworkImport"
            />
            <div class="import-tips">
              <p class="tip-title">
                {{ selectedImporter?.examples?.length ? '支持的输入格式' : '导入说明' }}
              </p>
              <ul v-if="selectedImporter?.examples?.length" class="tip-list">
                <li v-for="example in selectedImporter?.examples || []" :key="example.value">
                  {{ example.label }}：{{ example.value }}
                </li>
              </ul>
              <p v-else class="tip-fallback">
                {{ selectedImporter?.placeholder || '从所选平台复制歌单分享链接，或输入歌单 ID。' }}
              </p>
              <p v-for="note in selectedImporter?.instructions || []" :key="note" class="tip-note">
                {{ note }}
              </p>
              <p v-if="!selectedImporter?.instructions?.length" class="tip-note">
                请使用可公开访问的歌单；具体支持的链接格式以当前插件为准。
              </p>
            </div>
          </div>
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
    <n-dropdown
      placement="bottom-start"
      trigger="manual"
      :x="contextMenuX"
      :y="contextMenuY"
      :options="contextMenuOptions"
      :show="contextMenuVisible"
      @select="handleContextMenuSelect"
      @clickoutside="closeContextMenu"
    />

    <SharePlaylistDialog
      v-model="sharePlaylistDialogVisible"
      :playlist="shareTargetPlaylist"
      :song-count="shareTargetPlaylistSongCount"
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
  padding: 0 2rem;
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
  padding: 0 4px;

  .platform-selector {
    margin-bottom: 20px;

    .form-label {
      display: block;
      margin-bottom: 10px;
      font-weight: 600;
      color: var(--td-text-color-primary);
      font-size: 14px;
    }

    :deep(.t-radio-group) {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      height: auto;
      grid-auto-rows: 36px;
      gap: 6px;
      padding: 6px;
      border-radius: 10px;
      background: var(--td-bg-color-secondarycontainer);
    }

    :deep(.t-radio-button) {
      min-width: 0;
      height: 36px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 6px;

      &::before,
      &::after {
        display: none;
      }

      .t-radio-button__label {
        font-weight: 500;
        text-align: center;
      }
    }
  }

  .import-content {
    .import-description {
      margin-bottom: 12px;
      color: var(--td-text-color-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .url-input {
      margin-bottom: 16px;
    }

    .import-tips {
      background: var(--td-bg-color-secondarycontainer);
      border-radius: 10px;
      padding: 16px;
      border: 1px solid var(--td-component-stroke);

      .tip-title {
        margin: 0 0 10px;
        font-weight: 600;
        color: var(--td-text-color-primary);
        font-size: 14px;
      }

      .tip-list {
        margin: 0;
        padding: 0;
        list-style: none;

        li {
          color: var(--td-text-color-secondary);
          font-size: 13px;
          line-height: 1.7;
          margin-bottom: 6px;
          overflow-wrap: anywhere;
        }
      }

      .tip-fallback {
        color: var(--td-text-color-secondary);
        font-size: 13px;
        line-height: 1.7;
        overflow-wrap: anywhere;
      }

      .tip-note {
        margin: 10px 0 0;
        color: var(--td-text-color-secondary);
        font-size: 12px;
        line-height: 1.7;
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

  &.custom-bg {
    background-color: var(--td-bg-color-component);
    backdrop-filter: blur(8px);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--local-card-shadow-hover);

    .playlist-cover .cover-overlay {
      opacity: 1;
    }
    .playlist-cover .cover-image {
      transform: scale(1.06);
    }
    .playlist-info::before {
      opacity: 1;
    }
    .playlist-info {
      .playlist-name-text {
        color: #fff !important;
      }
      .playlist-description {
        color: rgba(255, 255, 255, 0.85);
      }
      .playlist-meta {
        color: rgba(255, 255, 255, 0.85);
        span:first-child {
          color: #fff;
        }
      }
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
      transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
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
    position: relative;
    z-index: 0;
    transition: color 0.3s ease;

    // GPU-only hover backdrop:用封面本身做模糊背板,无需 JS 算色
    // filter/transform 基线挂在 ::before 上(不在 hover 时切换),
    // 避免 hover-out 时 blur(40px) → none 离散复位导致原图露出闪一帧。
    // 仅切换 opacity,过渡平滑统一。
    &::before {
      content: '';
      position: absolute;
      inset: 0;
      background-image: var(--cover-url);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      filter: blur(40px) brightness(0.55) saturate(1.6);
      transform: scale(1.6);
      opacity: 0;
      transition: opacity 0.35s ease;
      z-index: -1;
      pointer-events: none;
    }
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

    .import-provider {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      color: var(--local-text-tertiary);
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
