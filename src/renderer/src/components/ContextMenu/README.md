# 自定义右键菜单组件

一个功能完整、可扩展的自定义右键菜单组件，专为歌曲列表等场景设计。

## 特性

- ✅ **精确的边缘点击判定** - 智能计算位置，确保菜单始终在可视区域内
- ✅ **滚动支持** - 支持菜单项过多时的滚动选择
- ✅ **可扩展性** - 易于添加新的菜单项和功能
- ✅ **平滑动画** - 流畅的显示/隐藏动画效果
- ✅ **自适应显示** - 在不同屏幕尺寸下自动适配
- ✅ **完整TypeScript支持** - 提供完整的类型定义

## 安装和使用

### 基本使用

```vue
<template>
  <div @contextmenu.prevent="handleContextMenu">
    <!-- 你的内容 -->
  </div>

  <ContextMenu
    v-model:visible="menuVisible"
    :items="menuItems"
    :position="menuPosition"
    @item-click="handleMenuItemClick"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ContextMenu from './ContextMenu/ContextMenu.vue'
import { createMenuItem, createSeparator } from './ContextMenu/utils'
import type { ContextMenuItem } from './ContextMenu/types'

const menuVisible = ref(false)
const menuPosition = ref({ x: 0, y: 0 })
const menuItems = ref<ContextMenuItem[]>([
  createMenuItem('play', '播放', {
    onClick: (item, event) => console.log('播放点击')
  }),
  createSeparator(),
  createMenuItem('download', '下载')
])
</script>
```

### 在歌曲列表中使用

```vue
<template>
  <div class="song-list">
    <div
      v-for="song in songs"
      :key="song.id"
      class="song-item"
      @contextmenu.prevent="handleSongContextMenu(song, $event)"
    >
      {{ song.name }}
    </div>
  </div>

  <ContextMenu
    v-model:visible="contextMenuVisible"
    :items="contextMenuItems"
    :position="contextMenuPosition"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ContextMenu from './ContextMenu/ContextMenu.vue'
import { createMenuItem, createSeparator } from './ContextMenu/utils'

const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const currentSong = ref(null)

const contextMenuItems = computed(() => [
  createMenuItem('play', '播放', {
    onClick: () => playSong(currentSong.value)
  }),
  createMenuItem('addToPlaylist', '添加到播放列表'),
  createSeparator(),
  createMenuItem('download', '下载')
])

const handleSongContextMenu = (song, event) => {
  currentSong.value = song
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}
</script>
```

## API 文档

### ContextMenu 组件属性

| 属性      | 类型                | 默认值    | 说明              |
| --------- | ------------------- | --------- | ----------------- |
| visible   | boolean             | false     | 控制菜单显示/隐藏 |
| items     | ContextMenuItem[]   | []        | 菜单项配置数组    |
| position  | ContextMenuPosition | {x:0,y:0} | 菜单位置坐标      |
| maxHeight | number              | 400       | 菜单最大高度      |
| zIndex    | number              | 1000      | 菜单层级          |

### ContextMenuItem 类型

```typescript
interface ContextMenuItem {
  id: string
  label: string
  icon?: any
  disabled?: boolean
  separator?: boolean
  children?: ContextMenuItem[]
  onClick?: (item: ContextMenuItem, event: MouseEvent) => void
  className?: string
}
```

### 工具函数

#### createMenuItem

创建标准菜单项

```typescript
createMenuItem(id: string, label: string, options?: {
  icon?: any
  disabled?: boolean
  separator?: boolean
  children?: ContextMenuItem[]
  onClick?: (item: ContextMenuItem, event: MouseEvent) => void
  className?: string
}): ContextMenuItem
```

#### createSeparator

创建分隔线

```typescript
createSeparator(): ContextMenuItem
```

#### calculateMenuPosition

智能计算菜单位置

```typescript
calculateMenuPosition(
  event: MouseEvent,
  menuWidth?: number,
  menuHeight?: number
): ContextMenuPosition
```

## 高级用法

### 子菜单支持

```typescript
const menuItems = [
  createMenuItem('playlist', '添加到歌单', {
    children: [
      createMenuItem('playlist1', '我的最爱'),
      createMenuItem('playlist2', '开车音乐'),
      createSeparator(),
      createMenuItem('newPlaylist', '新建歌单')
    ]
  })
]
```

### 动态菜单项

```typescript
const dynamicMenuItems = computed(() => {
  const items = [createMenuItem('play', '播放')]

  if (user.value.isPremium) {
    items.push(createMenuItem('download', '下载高音质'))
  }

  return items
})
```

### 自定义样式

```typescript
const menuItems = [
  createMenuItem('danger', '删除歌曲', {
    className: 'danger-item'
  })
]
```

```css
.danger-item {
  color: #ff4d4f;
}

.danger-item:hover {
  background-color: #fff2f0;
}
```

## 最佳实践

1. **使用防抖处理频繁的右键事件**
2. **合理设置菜单最大高度，避免过长滚动**
3. **为重要操作添加确认对话框**
4. **根据用户权限动态显示菜单项**
5. **在移动端考虑触摸替代方案**

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 故障排除

### 菜单位置不正确

确保使用 `calculateMenuPosition` 函数计算位置。

### 菜单项点击无效

检查 `onClick` 回调函数是否正确绑定。

### 样式冲突

使用 `className` 属性添加自定义样式类。

## 贡献指南

欢迎提交 Issue 和 Pull Request 来改进这个组件。
