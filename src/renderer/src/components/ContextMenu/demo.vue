<template>
  <div class="demo-container">
    <h1>右键菜单组件演示</h1>

    <!-- 测试区域 -->
    <div class="test-area">
      <div
        class="test-box"
        style="width: 300px; height: 200px; border: 2px dashed #ccc; padding: 20px"
        @contextmenu.prevent="handleContextMenu($event)"
      >
        <p>在此区域右键点击测试菜单</p>
        <p>菜单项数量：{{ menuItems.length }}</p>
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      v-model:visible="menuVisible"
      :position="menuPosition"
      :items="menuItems"
      :max-height="200"
      @item-click="handleMenuItemClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ContextMenu from './ContextMenu.vue'
import type { ContextMenuItem } from './types'

const menuVisible = ref(false)
const menuPosition = ref({ x: 0, y: 0 })

// 创建大量菜单项用于测试滚动
const menuItems = ref<ContextMenuItem[]>([
  {
    id: 'play',
    label: '播放',
    icon: '▶'
  },
  {
    id: 'pause',
    label: '暂停',
    icon: '⏸'
  },
  {
    id: 'separator-1',
    separator: true
  },
  {
    id: 'add-to-playlist',
    label: '添加到播放列表',
    icon: '➕'
  },
  {
    id: 'remove-from-playlist',
    label: '从播放列表移除',
    icon: '➖'
  },
  {
    id: 'separator-2',
    separator: true
  },
  {
    id: 'download',
    label: '下载歌曲',
    icon: '⬇️'
  },
  {
    id: 'share',
    label: '分享',
    icon: '↗️'
  },
  {
    id: 'separator-3',
    separator: true
  },
  {
    id: 'info',
    label: '歌曲信息',
    icon: 'ℹ️'
  },
  {
    id: 'edit-tags',
    label: '编辑标签',
    icon: '✏️'
  },
  {
    id: 'separator-4',
    separator: true
  },
  {
    id: 'rate-1',
    label: '评分：★☆☆☆☆',
    icon: '⭐'
  },
  {
    id: 'rate-2',
    label: '评分：★★☆☆☆',
    icon: '⭐'
  },
  {
    id: 'rate-3',
    label: '评分：★★★☆☆',
    icon: '⭐'
  },
  {
    id: 'rate-4',
    label: '评分：★★★★☆',
    icon: '⭐'
  },
  {
    id: 'rate-5',
    label: '评分：★★★★★',
    icon: '⭐'
  },
  {
    id: 'separator-5',
    separator: true
  },
  {
    id: 'create-station',
    label: '创建电台',
    icon: '📻'
  },
  {
    id: 'similar-songs',
    label: '相似歌曲',
    icon: '🎵'
  },
  {
    id: 'separator-6',
    separator: true
  },
  {
    id: 'copy-link',
    label: '复制链接',
    icon: '🔗'
  },
  {
    id: 'properties',
    label: '属性',
    icon: '📋'
  },
  {
    id: 'separator-7',
    separator: true
  },
  {
    id: 'delete',
    label: '删除',
    icon: '🗑️',
    className: 'danger'
  }
])

const handleContextMenu = (event: MouseEvent) => {
  menuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
  menuVisible.value = true
}

const handleMenuItemClick = (item: ContextMenuItem) => {
  console.log('菜单项点击:', item.label)
  // 这里可以添加具体的菜单项处理逻辑
}
</script>

<style scoped>
.demo-container {
  padding: 20px;
  font-family: Arial, sans-serif;
}

.test-area {
  margin: 20px 0;
}

.test-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: background-color 0.2s;
}

.test-box:hover {
  background-color: #f5f5f5;
}

.danger {
  color: #ff4444 !important;
}
</style>
