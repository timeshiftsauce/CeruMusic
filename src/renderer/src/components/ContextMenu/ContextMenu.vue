<template>
  <Teleport v-if="visible" to="body">
    <!-- 遮罩层 -->
    <div
      class="context-menu-backdrop"
      @click="handleBackdropClick"
      @contextmenu="handleBackdropContextMenu"
    ></div>

    <!-- 右键菜单容器 -->
    <div
      ref="menuRef"
      class="context-menu"
      :class="[className, { 'context-menu--scrolling': isScrolling }]"
      :style="menuStyle"
      @mouseleave="handleMouseLeave"
      @wheel="handleWheel"
    >
      <!-- 菜单项列表容器 -->
      <div
        ref="scrollContainer"
        class="context-menu__scroll-container"
        :style="scrollContainerStyle"
      >
        <!-- 菜单项列表 -->
        <ul class="context-menu__list">
          <li
            v-for="item in visibleItems"
            :key="item.id"
            class="context-menu__item"
            :class="[
              {
                'context-menu__item--disabled': item.disabled,
                'context-menu__item--separator': item.separator,
                'context-menu__item--has-children': item.children && item.children.length > 0
              },
              item.className
            ]"
            @mouseenter="handleItemMouseEnter(item, $event)"
            @mouseleave="handleItemMouseLeave(item)"
            @click="handleItemClick(item, $event)"
          >
            <!-- 分隔线 -->
            <div v-if="item.separator" class="context-menu__separator"></div>

            <!-- 普通菜单项 -->
            <template v-else>
              <!-- 图标 -->
              <div v-if="item.icon" class="context-menu__icon">
                <component :is="item.icon" size="16" />
              </div>

              <!-- 标签 -->
              <span class="context-menu__label">{{ item.label }}</span>

              <!-- 子菜单箭头 -->
              <div v-if="item.children && item.children.length > 0" class="context-menu__arrow">
                <chevron-right-icon :fill-color="'transparent'" :stroke-width="1.5" />
              </div>
            </template>
          </li>
        </ul>
      </div>

      <!-- 滚动指示器 -->
      <div v-if="showScrollIndicator" class="context-menu__scroll-indicator">
        <div
          class="context-menu__scroll-indicator-top"
          :class="{ 'context-menu__scroll-indicator--visible': canScrollUp }"
        ></div>
        <div
          class="context-menu__scroll-indicator-bottom"
          :class="{ 'context-menu__scroll-indicator--visible': canScrollDown }"
        ></div>
      </div>

      <!-- 子菜单 -->
      <div
        v-if="activeSubmenu"
        class="context-menu__submenu-wrapper"
        :style="submenuWrapperStyle"
        @mouseenter="handleSubmenuMouseEnter"
        @mouseleave="handleSubmenuMouseLeave"
      >
        <ContextMenu
          :visible="true"
          :position="submenuPosition"
          :items="activeSubmenu.children || []"
          :width="width"
          :max-height="Math.min(maxHeight, 300)"
          :z-index="zIndex + 1"
          @item-click="handleSubmenuItemClick"
          @close="closeSubmenu"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, type CSSProperties } from 'vue'
import type {
  ContextMenuProps,
  ContextMenuItem,
  ContextMenuPosition,
  EdgeDetectionConfig,
  AnimationConfig,
  ScrollConfig
} from './types'
import { ChevronRightIcon } from 'tdesign-icons-vue-next'

// 默认配置
const DEFAULT_EDGE_CONFIG: EdgeDetectionConfig = {
  threshold: 10,
  enabled: true
}

const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  duration: 200,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  enabled: true
}

const DEFAULT_SCROLL_CONFIG: ScrollConfig = {
  scrollbarWidth: 6,
  scrollSpeed: 40,
  showScrollbar: true
}

// 组件属性
const props = withDefaults(defineProps<ContextMenuProps>(), {
  visible: false,
  position: () => ({ x: 0, y: 0 }),
  items: () => [],
  className: '',
  width: 200,
  maxHeight: 400,
  zIndex: 1000
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  close: []
  'item-click': [item: ContextMenuItem, event: MouseEvent]
}>()

// 响应式引用
const menuRef = ref<HTMLElement>()
const scrollContainer = ref<HTMLElement>()

// 状态管理
const isScrolling = ref(false)
const scrollTop = ref(0)
const scrollHeight = ref(0)
const clientHeight = ref(0)
const activeSubmenu = ref<ContextMenuItem | null>(null)
const submenuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 })
const submenuTimer = ref<NodeJS.Timeout>()
const submenuMaxHeight = ref(300)

// 计算属性
const menuStyle = computed((): CSSProperties => {
  const style: CSSProperties = {
    '--menu-width': `${props.width}px`,
    '--menu-max-height': `${props.maxHeight}px`,
    '--menu-z-index': props.zIndex,
    '--animation-duration': `${DEFAULT_ANIMATION_CONFIG.duration}ms`,
    '--animation-easing': DEFAULT_ANIMATION_CONFIG.easing
  }

  if (!menuRef.value) {
    return {
      ...style,
      left: `${props.position.x}px`,
      top: `${props.position.y}px`
    }
  }

  const adjustedPosition = adjustMenuPosition(props.position)
  return {
    ...style,
    left: `${adjustedPosition.x}px`,
    top: `${adjustedPosition.y}px`
  }
})

const scrollContainerStyle = computed((): CSSProperties => {
  return {
    maxHeight: `${props.maxHeight}px`,
    transform: `translateY(-${scrollTop.value}px)`
  }
})

const visibleItems = computed(() => {
  return props.items.filter((item) => {
    // 显示所有非分隔线项目
    if (!item.separator) return true
    // 显示所有分隔线项目（无论是否有label）
    return true
  })
})

const showScrollIndicator = computed(() => {
  return DEFAULT_SCROLL_CONFIG.showScrollbar && scrollHeight.value > clientHeight.value
})

const canScrollUp = computed(() => scrollTop.value > 0)
const canScrollDown = computed(() => scrollTop.value < scrollHeight.value - clientHeight.value)

const submenuWrapperStyle = computed((): CSSProperties => {
  return {
    position: 'fixed',
    zIndex: props.zIndex + 1,
    maxHeight: `${submenuMaxHeight.value}px`
  }
})

// 监听器
watch(
  () => props.visible,
  (newVisible) => {
    if (newVisible) {
      nextTick(() => {
        initializeScroll()
        updateSubmenuPosition()
      })
    } else {
      closeSubmenu()
      resetScroll()
    }
  }
)

watch(
  () => props.items,
  () => {
    if (props.visible) {
      nextTick(initializeScroll)
    }
  }
)

// 生命周期
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleWindowResize)
  clearTimeout(submenuTimer.value)
})

// 方法定义
const adjustMenuPosition = (position: ContextMenuPosition): ContextMenuPosition => {
  if (!DEFAULT_EDGE_CONFIG.enabled || !menuRef.value) {
    return position
  }

  const menuRect = menuRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const threshold = DEFAULT_EDGE_CONFIG.threshold

  let adjustedX = position.x
  let adjustedY = position.y

  // 水平边缘检测
  if (position.x + menuRect.width > viewportWidth - threshold) {
    adjustedX = viewportWidth - menuRect.width - threshold
  } else if (position.x < threshold) {
    adjustedX = threshold
  }

  // 垂直边缘检测
  if (position.y + menuRect.height > viewportHeight - threshold) {
    adjustedY = viewportHeight - menuRect.height - threshold
  } else if (position.y < threshold) {
    adjustedY = threshold
  }

  return { x: adjustedX, y: adjustedY }
}

const initializeScroll = () => {
  if (!scrollContainer.value) return

  const container = scrollContainer.value
  scrollHeight.value = container.scrollHeight
  clientHeight.value = container.clientHeight
  scrollTop.value = 0
}

const resetScroll = () => {
  scrollTop.value = 0
  scrollHeight.value = 0
  clientHeight.value = 0
}

const scrollTo = (targetScrollTop: number) => {
  const maxScrollTop = scrollHeight.value - clientHeight.value
  scrollTop.value = Math.max(0, Math.min(targetScrollTop, maxScrollTop))
}

const scrollBy = (delta: number) => {
  scrollTo(scrollTop.value + delta)
}

const handleWheel = (event: WheelEvent) => {
  if (!showScrollIndicator.value) return

  event.preventDefault()
  event.stopPropagation()

  const delta =
    event.deltaY > 0 ? DEFAULT_SCROLL_CONFIG.scrollSpeed : -DEFAULT_SCROLL_CONFIG.scrollSpeed
  scrollBy(delta)
  isScrolling.value = true

  clearTimeout(submenuTimer.value)
  submenuTimer.value = setTimeout(() => {
    isScrolling.value = false
  }, 150)
}

const handleItemMouseEnter = (item: ContextMenuItem, event: MouseEvent) => {
  if (item.disabled || item.separator) return

  // 清除之前的子菜单定时器
  clearTimeout(submenuTimer.value)

  if (item.children && item.children.length > 0) {
    submenuTimer.value = setTimeout(() => {
      openSubmenu(item, event)
    }, 200)
  } else {
    closeSubmenu()
  }
}

const handleItemMouseLeave = (item: ContextMenuItem) => {
  if (item.children && item.children.length > 0) {
    clearTimeout(submenuTimer.value)
  }
}

const handleItemClick = (item: ContextMenuItem, event: MouseEvent) => {
  if (item.disabled || item.separator) return

  // 调用菜单项的点击回调
  if (item.onClick) {
    item.onClick(item, event)
  }

  // 发射组件事件
  emit('item-click', item, event)

  // 如果没有子菜单，关闭菜单
  if (!item.children || item.children.length === 0) {
    closeMenu()
  }
}

const handleSubmenuItemClick = (item: ContextMenuItem, event: MouseEvent) => {
  emit('item-click', item, event)
  closeMenu()
}

const openSubmenu = (item: ContextMenuItem, _event: MouseEvent) => {
  if (!menuRef.value) return

  // 如果是相同的子菜单，不需要重新计算位置
  if (activeSubmenu.value && activeSubmenu.value.id === item.id) {
    return
  }

  // 移除未使用的变量声明
  activeSubmenu.value = item

  nextTick(() => {
    updateSubmenuPosition()
  })
}

const closeSubmenu = () => {
  activeSubmenu.value = null
  clearTimeout(submenuTimer.value)
}
const updateSubmenuPosition = () => {
  if (!menuRef.value || !activeSubmenu.value) return

  const menuRect = menuRef.value.getBoundingClientRect()
  // 初始位置：显示在右侧
  const x = menuRect.right
  const y = menuRect.top

  // 先设置初始位置，让子菜单渲染
  submenuPosition.value = { x, y }

  // 等待子菜单渲染完成后调整位置
  setTimeout(() => {
    // 子菜单通过 Teleport 渲染到 body 中，需要在 body 中查找
    // 查找所有的 context-menu 元素，找到 z-index 最高的（即子菜单）
    const allMenus = document.querySelectorAll('.context-menu')
    console.log('All menus found:', allMenus.length)

    let submenuEl: Element | null = null
    let maxZIndex = props.zIndex

    allMenus.forEach((menu) => {
      const style = window.getComputedStyle(menu)
      const zIndex = parseInt(style.zIndex) || 0
      console.log('Menu z-index:', zIndex, 'Current max:', maxZIndex)

      if (zIndex > maxZIndex) {
        maxZIndex = zIndex
        submenuEl = menu as Element
      }
    })

    console.log('Found submenu:', submenuEl)

    if (submenuEl) {
      const submenuRect = (submenuEl as HTMLElement).getBoundingClientRect()
      console.log('submenuRect:', submenuRect)

      if (submenuRect.width > 0) {
        // 计算包含滚动条的实际宽度
        const scrollContainer = (submenuEl as HTMLElement).querySelector(
          '.context-menu__scroll-container'
        ) as HTMLElement | null
        let actualWidth = submenuRect.width

        if (scrollContainer) {
          // 检查是否有滚动条
          const hasScrollbar = scrollContainer.scrollHeight > scrollContainer.clientHeight
          if (hasScrollbar) {
            // 添加滚动条宽度（通常是6-17px，这里使用默认的6px）
            const scrollbarWidth = scrollContainer.offsetWidth - scrollContainer.clientWidth
            actualWidth += scrollbarWidth
            console.log('Added scrollbar width:', scrollbarWidth, 'Total width:', actualWidth)
          }
        }

        adjustSubmenuPosition(actualWidth)
      } else {
        // 如果宽度为0，再等一下
        setTimeout(() => {
          const retryRect = (submenuEl as HTMLElement).getBoundingClientRect()
          console.log('retryRect:', retryRect)
          if (retryRect.width > 0) {
            // 重试时也要考虑滚动条
            const scrollContainer = (submenuEl as HTMLElement).querySelector(
              '.context-menu__scroll-container'
            ) as HTMLElement | null
            let actualWidth = retryRect.width

            if (scrollContainer) {
              const hasScrollbar = scrollContainer.scrollHeight > scrollContainer.clientHeight
              if (hasScrollbar) {
                const scrollbarWidth = scrollContainer.offsetWidth - scrollContainer.clientWidth
                actualWidth += scrollbarWidth
              }
            }

            adjustSubmenuPosition(actualWidth)
          }
        }, 50)
      }
    }
  }, 0)
}

// 提取位置调整逻辑为独立函数
const adjustSubmenuPosition = (submenuWidth: number) => {
  if (!menuRef.value || !activeSubmenu.value) return

  const menuRect = menuRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const threshold = 10

  // 重新计算位置
  let adjustedX = menuRect.right
  const y = menuRect.top

  // 检查右侧是否有足够空间显示子菜单
  if (adjustedX + submenuWidth > viewportWidth - threshold) {
    // 如果右侧空间不足，显示在左侧：父元素的left - 子菜单宽度
    adjustedX = menuRect.left - submenuWidth
  }

  // 确保子菜单不会超出左边界
  if (adjustedX < threshold) {
    adjustedX = threshold
  }

  console.log('Final position:', { x: adjustedX, y })
  // 更新最终位置
  submenuPosition.value = { x: adjustedX, y }
}

const handleBackdropClick = () => {
  closeMenu()
}

const handleBackdropContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  closeMenu()
}

const handleMouseLeave = () => {
  clearTimeout(submenuTimer.value)
}

const handleSubmenuMouseEnter = () => {
  // 鼠标进入子菜单区域，清除关闭定时器
  clearTimeout(submenuTimer.value)
}

const handleSubmenuMouseLeave = () => {
  // 鼠标离开子菜单区域，延迟关闭子菜单
  submenuTimer.value = setTimeout(() => {
    closeSubmenu()
  }, 100)
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (!props.visible) return

  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      closeMenu()
      break
    case 'ArrowUp':
      event.preventDefault()
      scrollBy(-DEFAULT_SCROLL_CONFIG.scrollSpeed)
      break
    case 'ArrowDown':
      event.preventDefault()
      scrollBy(DEFAULT_SCROLL_CONFIG.scrollSpeed)
      break
  }
}

const handleWindowResize = () => {
  if (props.visible) {
    closeMenu()
  }
}

const closeMenu = () => {
  emit('update:visible', false)
  emit('close')
}

// 暴露给父组件的方法
defineExpose({
  updatePosition: (_position: ContextMenuPosition) => {
    // 位置更新逻辑
  },
  updateItems: (_items: ContextMenuItem[]) => {
    // 菜单项更新逻辑
  },
  hide: closeMenu
})
</script>

<style scoped lang="scss">
.context-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: calc(var(--menu-z-index) - 1);
  background: transparent;
}

.context-menu {
  position: fixed;
  min-width: var(--menu-width);
  max-width: 300px;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  z-index: var(--menu-z-index);
  overflow: auto;
  animation: contextMenuEnter var(--animation-duration) var(--animation-easing);
}

.context-menu--scrolling {
  pointer-events: auto;
}

.context-menu__scroll-container {
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  /* scrollbar-color: rgba(255, 255, 255, 0.3) transparent; */
  transition: transform 0.15s ease;
}
.context-menu__scroll-container::-webkit-scrollbar {
  width: 6px;
}
/*

.context-menu__scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.context-menu__scroll-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.context-menu__scroll-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
} */

.context-menu__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  min-width: 100%;
}

.context-menu__item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  min-height: 32px;
  box-sizing: border-box;
}

.context-menu__item:hover:not(.context-menu__item--disabled):not(.context-menu__item--separator) {
  background: #f5f5f5;
}

.context-menu__item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.context-menu__item--separator {
  padding: 0;
  margin: 4px 0;
  cursor: default;
  height: auto;
  min-height: auto;
}

.context-menu__item--has-children {
  padding-right: 24px;
}

.context-menu__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  color: #666;
  flex-shrink: 0;
}

.context-menu__label {
  flex: 1;
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-menu__arrow {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  justify-content: center;
  align-items: center;
  display: flex;
  color: #999;
}

.context-menu__arrow-icon {
  font-size: 10px;
  font-style: normal;
}

.context-menu__separator {
  height: 1px;
  width: 100%;
  background: #e0e0e0;
  margin: 0 8px;
  opacity: 0.8;
}

.context-menu__scroll-indicator {
  position: absolute;
  right: 2px;
  top: 4px;
  bottom: 4px;
  width: var(--scrollbar-width, 6px);
  pointer-events: none;
}

.context-menu__scroll-indicator-top,
.context-menu__scroll-indicator-bottom {
  position: absolute;
  left: 0;
  width: 100%;
  height: 20px;
  opacity: 0;
  transition: opacity 0.2s ease;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.9), transparent);
}

.context-menu__scroll-indicator-top {
  top: 0;
  transform: rotate(180deg);
}

.context-menu__scroll-indicator-bottom {
  bottom: 0;
}

.context-menu__scroll-indicator--visible {
  opacity: 1;
}

/* 动画 */
@keyframes contextMenuEnter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .context-menu {
    min-width: 180px;
    max-width: 280px;
    border-radius: 6px;
  }

  .context-menu__item {
    padding: 10px 12px;
    min-height: 36px;
  }

  .context-menu__label {
    font-size: 14px;
  }
}

/* 暗色主题支持 */

html[data-theme='dark'] .context-menu {
  background: #2d2d2d;
  border-color: #404040;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);

  .context-menu__item:hover:not(.context-menu__item--disabled):not(.context-menu__item--separator) {
    background: #404040;
  }

  .context-menu__icon {
    color: #ccc;
  }

  .context-menu__label {
    color: #e0e0e0;
  }

  .context-menu__separator {
    background: #555555;
    opacity: 0.9;
  }

  .context-menu__scroll-indicator-top,
  .context-menu__scroll-indicator-bottom {
    background: linear-gradient(to bottom, rgba(45, 45, 45, 0.9), transparent);
  }
  :deep(.context-menu__arrow) {
    color: #ccc;
    .t-icon {
      color: #f5f5f5;
    }
  }
}
</style>
