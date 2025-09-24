/**
 * 右键菜单位置类型定义
 */
export interface ContextMenuPosition {
  x: number
  y: number
}

/**
 * 右键菜单项类型定义
 */
export interface ContextMenuItem {
  /** 菜单项唯一标识 */
  id: string
  /** 显示文本 */
  label?: string
  /** 图标组件 */
  icon?: any
  /** 是否禁用 */
  disabled?: boolean
  /** 是否显示分隔线 */
  separator?: boolean
  /** 子菜单项 */
  children?: ContextMenuItem[]
  /** 点击回调函数 */
  onClick?: (item: ContextMenuItem, event: MouseEvent) => void
  /** 自定义CSS类名 */
  className?: string
}

/**
 * 右键菜单配置属性
 */
export interface ContextMenuProps {
  /** 是否显示菜单 */
  visible: boolean
  /** 菜单位置 */
  position: ContextMenuPosition
  /** 菜单项列表 */
  items: ContextMenuItem[]
  /** 自定义CSS类名 */
  className?: string
  /** 菜单宽度 */
  width?: number
  /** 最大高度（超出时显示滚动条） */
  maxHeight?: number
  /** 菜单层级 */
  zIndex?: number
  /** 关闭菜单回调 */
  onClose?: () => void
  /** 菜单项点击回调 */
  onItemClick?: (item: ContextMenuItem, event: MouseEvent) => void
}

/**
 * 边缘检测配置
 */
export interface EdgeDetectionConfig {
  /** 距离边缘的阈值（像素） */
  threshold: number
  /** 是否启用边缘检测 */
  enabled: boolean
}

/**
 * 动画配置
 */
export interface AnimationConfig {
  /** 动画持续时间（毫秒） */
  duration: number
  /** 动画缓动函数 */
  easing: string
  /** 是否启用动画 */
  enabled: boolean
}

/**
 * 滚动配置
 */
export interface ScrollConfig {
  /** 滚动条宽度 */
  scrollbarWidth: number
  /** 滚动速度 */
  scrollSpeed: number
  /** 是否显示滚动条 */
  showScrollbar: boolean
}

/**
 * 右键菜单实例方法
 */
export interface ContextMenuInstance {
  /** 显示菜单 */
  show: (position: ContextMenuPosition, items?: ContextMenuItem[]) => void
  /** 隐藏菜单 */
  hide: () => void
  /** 更新菜单位置 */
  updatePosition: (position: ContextMenuPosition) => void
  /** 更新菜单项 */
  updateItems: (items: ContextMenuItem[]) => void
}
