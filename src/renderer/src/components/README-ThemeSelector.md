# 主题切换组件使用说明

## 概述

ThemeSelector 是一个现代化的主题切换组件，支持在多个预设主题色之间切换。组件与现有的 TDesign 主题系统完全兼容。

## 功能特性

- ✅ 支持多种预设主题色（默认、粉色、蓝色、青色、橙色）
- ✅ 使用 `theme-mode` 属性实现主题切换
- ✅ 自动保存用户选择到本地存储
- ✅ 现代化的下拉选择界面
- ✅ 平滑的过渡动画效果
- ✅ 响应式设计，支持移动端
- ✅ 与 TDesign 主题系统完全兼容

## 使用方法

### 1. 基本使用

```vue
<template>
  <div>
    <!-- 在任何需要的地方使用主题切换器 -->
    <ThemeSelector />
  </div>
</template>

<script setup>
import ThemeSelector from '@/components/ThemeSelector.vue'
</script>
```

### 2. 在导航栏中使用

```vue
<template>
  <header class="app-header">
    <h1>应用标题</h1>
    <div class="header-actions">
      <ThemeSelector />
    </div>
  </header>
</template>
```

### 3. 在设置页面中使用

```vue
<template>
  <div class="settings-page">
    <div class="setting-item">
      <label>主题色</label>
      <ThemeSelector />
    </div>
  </div>
</template>
```

## 主题切换原理

组件通过以下方式实现主题切换：

1. **默认主题**: 移除 `theme-mode` 属性
   ```javascript
   document.documentElement.removeAttribute('theme-mode')
   ```

2. **其他主题**: 设置对应的 `theme-mode` 属性
   ```javascript
   document.documentElement.setAttribute('theme-mode', 'pink')
   ```

## 支持的主题

| 主题名称 | 属性值 | 主色调 |
|---------|--------|--------|
| 默认 | `default` | #57b4ff |
| 粉色 | `pink` | #fc5e7e |
| 蓝色 | `blue` | #57b4ff |
| 青色 | `cyan` | #3ac2b8 |
| 橙色 | `orange` | #fb9458 |

## 自定义配置

如果需要添加新的主题，请按以下步骤操作：

### 1. 创建主题CSS文件

在 `src/renderer/src/assets/theme/` 目录下创建新的主题文件，例如 `green.css`：

```css
:root[theme-mode="green"] {
  --td-brand-color: #10b981;
  --td-brand-color-hover: #059669;
  /* 其他主题变量... */
}
```

### 2. 更新组件配置

在 `ThemeSelector.vue` 中添加新主题：

```javascript
const themes = [
  // 现有主题...
  { name: 'green', label: '绿色', color: '#10b981' }
]
```

## 样式自定义

组件使用 TDesign 的 CSS 变量，可以通过覆盖这些变量来自定义样式：

```css
.theme-selector {
  /* 自定义触发器样式 */
  --td-radius-medium: 8px;
}

.theme-dropdown {
  /* 自定义下拉菜单样式 */
  --td-shadow-2: 0 8px 25px rgba(0, 0, 0, 0.15);
}
```

## 事件和回调

组件会自动处理主题切换和本地存储，无需额外配置。如果需要监听主题变化，可以监听 `localStorage` 的变化：

```javascript
// 监听主题变化
window.addEventListener('storage', (e) => {
  if (e.key === 'selected-theme') {
    console.log('主题已切换到:', e.newValue)
  }
})
```

## 注意事项

1. 确保项目中已引入对应的主题CSS文件
2. 组件会自动加载用户上次选择的主题
3. 主题切换是全局的，会影响整个应用
4. 建议在应用的主入口处使用，避免重复渲染

## 演示组件

项目还包含一个 `ThemeDemo.vue` 组件，展示了主题切换的效果：

```vue
<template>
  <ThemeDemo />
</template>

<script setup>
import ThemeDemo from '@/components/ThemeDemo.vue'
</script>
```

这个演示组件展示了不同UI元素在各种主题下的表现。