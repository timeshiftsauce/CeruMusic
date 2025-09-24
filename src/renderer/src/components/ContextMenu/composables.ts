import { ref, computed, type Ref } from 'vue'
import type { ContextMenuItem, ContextMenuPosition } from './types'
import { createMenuItem, createSeparator } from './utils'

/**
 * 右键菜单组合式函数
 */
export function useContextMenu() {
  const visible = ref(false)
  const position = ref<ContextMenuPosition>({ x: 0, y: 0 })
  const items = ref<ContextMenuItem[]>([])
  const currentData = ref<any>(null)

  /**
   * 显示菜单
   */
  const show = (event: MouseEvent, menuItems: ContextMenuItem[], data?: any) => {
    event.preventDefault()
    event.stopPropagation()

    position.value = {
      x: event.clientX,
      y: event.clientY
    }

    items.value = menuItems
    currentData.value = data
    visible.value = true
  }

  /**
   * 隐藏菜单
   */
  const hide = () => {
    visible.value = false
    currentData.value = null
  }

  /**
   * 更新菜单位置
   */
  const updatePosition = (newPosition: ContextMenuPosition) => {
    position.value = newPosition
  }

  /**
   * 更新菜单项
   */
  const updateItems = (newItems: ContextMenuItem[]) => {
    items.value = newItems
  }

  /**
   * 处理菜单项点击
   */
  const handleItemClick = (item: ContextMenuItem, event: MouseEvent) => {
    if (item.onClick) {
      item.onClick(item, event)
    }
    hide()
  }

  return {
    // 状态
    visible: computed(() => visible.value),
    position: computed(() => position.value),
    items: computed(() => items.value),
    currentData: computed(() => currentData.value),

    // 方法
    show,
    hide,
    updatePosition,
    updateItems,
    handleItemClick
  }
}

/**
 * 歌曲相关的右键菜单配置
 */
export function useSongContextMenu() {
  const { show, hide, ...rest } = useContextMenu()

  /**
   * 显示歌曲右键菜单
   */
  const showSongMenu = (
    event: MouseEvent,
    song: any,
    options?: {
      showPlay?: boolean
      showAddToPlaylist?: boolean
      showDownload?: boolean
      showAddToSongList?: boolean
      playlists?: any[]
      onPlay?: (song: any) => void
      onAddToPlaylist?: (song: any) => void
      onDownload?: (song: any) => void
      onAddToSongList?: (song: any, playlist: any) => void
    }
  ) => {
    const {
      showPlay = true,
      showAddToPlaylist = true,
      showDownload = true,
      showAddToSongList = true,
      playlists = [],
      onPlay,
      onAddToPlaylist,
      onDownload,
      onAddToSongList
    } = options || {}

    const menuItems: ContextMenuItem[] = []

    // 播放
    if (showPlay) {
      menuItems.push(
        createMenuItem('play', '播放', {
          onClick: () => onPlay?.(song)
        })
      )
    }

    // 添加到播放列表
    if (showAddToPlaylist) {
      menuItems.push(
        createMenuItem('addToPlaylist', '添加到播放列表', {
          onClick: () => onAddToPlaylist?.(song)
        })
      )
    }

    // 添加到歌单（如果有歌单）
    if (showAddToSongList && playlists.length > 0) {
      menuItems.push(
        createMenuItem('addToSongList', '加入歌单', {
          children: playlists.map((playlist) =>
            createMenuItem(`playlist_${playlist.id}`, playlist.name, {
              onClick: () => onAddToSongList?.(song, playlist)
            })
          )
        })
      )
    }

    // 分隔线
    if (menuItems.length > 0) {
      menuItems.push(createSeparator())
    }

    // 下载
    if (showDownload) {
      menuItems.push(
        createMenuItem('download', '下载', {
          onClick: () => onDownload?.(song)
        })
      )
    }

    show(event, menuItems, song)
  }

  return {
    ...rest,
    showSongMenu,
    hide
  }
}

/**
 * 列表项右键菜单配置
 */
export function useListItemContextMenu() {
  const { show, hide, ...rest } = useContextMenu()

  /**
   * 显示列表项右键菜单
   */
  const showListItemMenu = (
    event: MouseEvent,
    item: any,
    options?: {
      showEdit?: boolean
      showDelete?: boolean
      showCopy?: boolean
      showProperties?: boolean
      onEdit?: (item: any) => void
      onDelete?: (item: any) => void
      onCopy?: (item: any) => void
      onProperties?: (item: any) => void
    }
  ) => {
    const {
      showEdit = true,
      showDelete = true,
      showCopy = false,
      showProperties = false,
      onEdit,
      onDelete,
      onCopy,
      onProperties
    } = options || {}

    const menuItems: ContextMenuItem[] = []

    // 编辑
    if (showEdit) {
      menuItems.push(
        createMenuItem('edit', '编辑', {
          onClick: () => onEdit?.(item)
        })
      )
    }

    // 复制
    if (showCopy) {
      menuItems.push(
        createMenuItem('copy', '复制', {
          onClick: () => onCopy?.(item)
        })
      )
    }

    // 分隔线
    if (menuItems.length > 0 && (showDelete || showProperties)) {
      menuItems.push(createSeparator())
    }

    // 删除
    if (showDelete) {
      menuItems.push(
        createMenuItem('delete', '删除', {
          onClick: () => onDelete?.(item)
        })
      )
    }

    // 属性
    if (showProperties) {
      menuItems.push(
        createMenuItem('properties', '属性', {
          onClick: () => onProperties?.(item)
        })
      )
    }

    show(event, menuItems, item)
  }

  return {
    ...rest,
    showListItemMenu,
    hide
  }
}

/**
 * 文本选择右键菜单配置
 */
export function useTextSelectionContextMenu() {
  const { show, hide, ...rest } = useContextMenu()

  /**
   * 显示文本选择右键菜单
   */
  const showTextSelectionMenu = (
    event: MouseEvent,
    selectedText: string,
    options?: {
      showCopy?: boolean
      showSearch?: boolean
      showTranslate?: boolean
      onCopy?: (text: string) => void
      onSearch?: (text: string) => void
      onTranslate?: (text: string) => void
    }
  ) => {
    const {
      showCopy = true,
      showSearch = true,
      showTranslate = false,
      onCopy,
      onSearch,
      onTranslate
    } = options || {}

    const menuItems: ContextMenuItem[] = []

    // 复制
    if (showCopy) {
      menuItems.push(
        createMenuItem('copy', '复制', {
          onClick: () => onCopy?.(selectedText)
        })
      )
    }

    // 搜索
    if (showSearch) {
      menuItems.push(
        createMenuItem('search', '搜索', {
          onClick: () => onSearch?.(selectedText)
        })
      )
    }

    // 翻译
    if (showTranslate) {
      menuItems.push(
        createMenuItem('translate', '翻译', {
          onClick: () => onTranslate?.(selectedText)
        })
      )
    }

    show(event, menuItems, selectedText)
  }

  return {
    ...rest,
    showTextSelectionMenu,
    hide
  }
}

/**
 * 创建可复用的菜单配置
 */
export function createMenuConfig<T = any>(config: {
  items: ContextMenuItem[]
  onItemClick?: (item: ContextMenuItem, data: T, event: MouseEvent) => void
  onShow?: (data: T) => void
  onHide?: () => void
}) {
  const { items, onItemClick, onShow, onHide } = config

  return {
    items: ref([...items]),

    show: (_event: MouseEvent, data: T) => {
      onShow?.(data)
    },

    handleItemClick: (item: ContextMenuItem, event: MouseEvent, data: T) => {
      onItemClick?.(item, data, event)
    },

    hide: () => {
      onHide?.()
    }
  }
}

/**
 * 菜单项可见性控制
 */
export function useMenuVisibility<T extends ContextMenuItem>(
  items: Ref<T[]>,
  predicate: (item: T) => boolean
) {
  const visibleItems = computed(() => items.value.filter(predicate))

  const hasVisibleItems = computed(() => visibleItems.value.length > 0)

  return {
    visibleItems,
    hasVisibleItems
  }
}

/**
 * 菜单项动态启用/禁用控制
 */
export function useMenuItemsState<T extends ContextMenuItem>(
  items: Ref<T[]>,
  getState: (item: T) => { disabled?: boolean; visible?: boolean }
) {
  const processedItems = computed(() =>
    items.value
      .map((item) => {
        const state = getState(item)
        return {
          ...item,
          disabled: state.disabled ?? item.disabled,
          // 如果visible为false，完全移除该项
          ...(state.visible === false ? { _hidden: true } : {})
        }
      })
      .filter((item) => !(item as any)._hidden)
  )

  return {
    processedItems
  }
}
