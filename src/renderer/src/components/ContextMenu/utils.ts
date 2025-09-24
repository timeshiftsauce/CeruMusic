import type { ContextMenuItem, ContextMenuPosition } from './types'

/**
 * 创建标准菜单项
 */
export function createMenuItem(
  id: string,
  label: string,
  options?: {
    icon?: any
    disabled?: boolean
    separator?: boolean
    children?: ContextMenuItem[]
    onClick?: (item: ContextMenuItem, event: MouseEvent) => void
    className?: string
  }
): ContextMenuItem {
  return {
    id,
    label,
    icon: options?.icon,
    disabled: options?.disabled || false,
    separator: options?.separator || false,
    children: options?.children,
    onClick: options?.onClick,
    className: options?.className
  }
}

/**
 * 创建分隔线菜单项
 */
export function createSeparator(): ContextMenuItem {
  return {
    id: `separator-${Date.now()}`,
    label: '',
    separator: true
  }
}

/**
 * 计算菜单位置，确保在可视区域内
 */
export function calculateMenuPosition(
  event: MouseEvent,
  menuWidth: number = 200,
  menuHeight: number = 400
): ContextMenuPosition {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const threshold = 10

  let x = event.clientX
  let y = event.clientY

  // 水平边缘检测
  if (x + menuWidth > viewportWidth - threshold) {
    x = viewportWidth - menuWidth - threshold
  } else if (x < threshold) {
    x = threshold
  }

  // 垂直边缘检测
  if (y + menuHeight > viewportHeight - threshold) {
    y = viewportHeight - menuHeight - threshold
  } else if (y < threshold) {
    y = threshold
  }

  return { x, y }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 深度克隆菜单项（避免引用问题）
 */
export function cloneMenuItem(item: ContextMenuItem): ContextMenuItem {
  return {
    ...item,
    children: item.children ? item.children.map(cloneMenuItem) : undefined
  }
}

/**
 * 扁平化菜单项（用于搜索等功能）
 */
export function flattenMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  const result: ContextMenuItem[] = []

  items.forEach((item) => {
    result.push(item)
    if (item.children && item.children.length > 0) {
      result.push(...flattenMenuItems(item.children))
    }
  })

  return result
}

/**
 * 根据ID查找菜单项
 */
export function findMenuItemById(items: ContextMenuItem[], id: string): ContextMenuItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item
    }
    if (item.children && item.children.length > 0) {
      const found = findMenuItemById(item.children, id)
      if (found) {
        return found
      }
    }
  }
  return null
}

/**
 * 验证菜单项配置
 */
export function validateMenuItem(item: ContextMenuItem): boolean {
  if (!item.id || typeof item.id !== 'string') {
    console.warn('菜单项必须包含有效的id字段')
    return false
  }

  if (!item.separator && (!item.label || typeof item.label !== 'string')) {
    console.warn('非分隔线菜单项必须包含有效的label字段')
    return false
  }

  if (item.children && !Array.isArray(item.children)) {
    console.warn('children字段必须是数组')
    return false
  }

  return true
}

/**
 * 验证菜单项列表
 */
export function validateMenuItems(items: ContextMenuItem[]): boolean {
  if (!Array.isArray(items)) {
    console.warn('菜单项列表必须是数组')
    return false
  }

  return items.every(validateMenuItem)
}

/**
 * 过滤可见菜单项（移除禁用项和空分隔线）
 */
export function filterVisibleItems(items: ContextMenuItem[]): ContextMenuItem[] {
  return items.filter((item) => {
    if (item.disabled) return false
    if (item.separator && !item.label) return true // 保留纯分隔线
    return true
  })
}

/**
 * 菜单项排序工具
 */
export function sortMenuItems(
  items: ContextMenuItem[],
  compareFn?: (a: ContextMenuItem, b: ContextMenuItem) => number
): ContextMenuItem[] {
  const sorted = [...items]
  sorted.sort(
    compareFn ||
      ((a, b) => {
        if (!a.label || !b.label) return 0
        return a.label.localeCompare(b.label)
      })
  )

  // 递归排序子菜单
  return sorted.map((item) => ({
    ...item,
    children: item.children ? sortMenuItems(item.children, compareFn) : undefined
  }))
}

/**
 * 菜单项分组工具
 */
export function groupMenuItems(items: ContextMenuItem[], groupSize: number = 5): ContextMenuItem[] {
  const result: ContextMenuItem[] = []
  let currentGroup: ContextMenuItem[] = []

  items.forEach((item, index) => {
    currentGroup.push(item)

    if (currentGroup.length >= groupSize || index === items.length - 1) {
      if (currentGroup.length > 0) {
        result.push(...currentGroup)
        if (index < items.length - 1) {
          result.push(createSeparator())
        }
        currentGroup = []
      }
    }
  })

  return result
}

/**
 * 菜单项搜索工具
 */
export function searchMenuItems(items: ContextMenuItem[], searchText: string): ContextMenuItem[] {
  if (!searchText.trim()) return items

  const lowerSearchText = searchText.toLowerCase()

  return items.filter((item) => {
    if (item.separator) return true
    if (!item.label) return false

    const matches = item.label.toLowerCase().includes(lowerSearchText)

    if (matches) return true

    if (item.children && item.children.length > 0) {
      const matchingChildren = searchMenuItems(item.children, searchText)
      if (matchingChildren.length > 0) {
        item.children = matchingChildren
        return true
      }
    }

    return false
  })
}
