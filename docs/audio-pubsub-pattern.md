# 音频发布-订阅模式使用指南

## 概述

这个改进的发布-订阅模式解决了原有实现中无法单个删除订阅者的问题。新的实现提供了以下特性：

- ✅ 支持单个订阅者的精确取消
- ✅ 自动生成唯一订阅ID
- ✅ 类型安全的事件系统
- ✅ 错误处理和日志记录
- ✅ 内存泄漏防护

## 核心特性

### 1. 精确的订阅管理
每个订阅都会返回一个取消订阅函数，调用该函数即可精确取消对应的订阅：

```typescript
// 订阅事件
const unsubscribe = audioStore.subscribe('ended', () => {
  console.log('音频播放结束')
})

// 取消订阅
unsubscribe()
```

### 2. 支持的事件类型
- `ended`: 音频播放结束
- `seeked`: 音频拖拽完成
- `timeupdate`: 音频时间更新
- `play`: 音频开始播放
- `pause`: 音频暂停播放

### 3. 类型安全
所有的事件类型和回调函数都有完整的TypeScript类型定义，确保编译时类型检查。

## 使用方法

### 基础订阅

```typescript
import { ControlAudioStore } from '@renderer/store/ControlAudio'

const audioStore = ControlAudioStore()

// 订阅播放结束事件
const unsubscribeEnded = audioStore.subscribe('ended', () => {
  console.log('音频播放结束了')
})

// 订阅时间更新事件
const unsubscribeTimeUpdate = audioStore.subscribe('timeupdate', () => {
  console.log('当前时间:', audioStore.Audio.currentTime)
})
```

### 在Vue组件中使用

```vue
<script setup lang="ts">
import { inject, onMounted, onUnmounted } from 'vue'
import type { AudioSubscribeMethod, UnsubscribeFunction } from '@renderer/types/audio'

// 注入订阅方法
const audioSubscribe = inject<AudioSubscribeMethod>('audioSubscribe')

// 存储取消订阅函数
const unsubscribeFunctions: UnsubscribeFunction[] = []

onMounted(() => {
  if (!audioSubscribe) return

  // 订阅多个事件
  unsubscribeFunctions.push(
    audioSubscribe('play', () => console.log('开始播放')),
    audioSubscribe('pause', () => console.log('暂停播放')),
    audioSubscribe('ended', () => console.log('播放结束'))
  )
})

onUnmounted(() => {
  // 组件卸载时取消所有订阅
  unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
})
</script>
```

### 条件订阅和取消

```typescript
let endedUnsubscribe: UnsubscribeFunction | null = null

// 条件订阅
const subscribeToEnded = () => {
  if (!endedUnsubscribe) {
    endedUnsubscribe = audioStore.subscribe('ended', handleAudioEnded)
  }
}

// 条件取消订阅
const unsubscribeFromEnded = () => {
  if (endedUnsubscribe) {
    endedUnsubscribe()
    endedUnsubscribe = null
  }
}
```

## 高级功能

### 批量管理订阅

```typescript
// 清空特定事件的所有订阅者
audioStore.clearEventSubscribers('ended')

// 清空所有事件的所有订阅者
audioStore.clearAllSubscribers()
```

### 错误处理

系统内置了错误处理机制，如果某个回调函数执行出错，不会影响其他订阅者：

```typescript
audioStore.subscribe('ended', () => {
  throw new Error('这个错误不会影响其他订阅者')
})

audioStore.subscribe('ended', () => {
  console.log('这个回调仍然会正常执行')
})
```

## 最佳实践

### 1. 及时清理订阅
```typescript
// ✅ 好的做法：组件卸载时清理
onUnmounted(() => {
  unsubscribeFunctions.forEach(unsubscribe => unsubscribe())
})

// ❌ 不好的做法：忘记清理，可能导致内存泄漏
```

### 2. 使用数组管理多个订阅
```typescript
// ✅ 好的做法：统一管理
const unsubscribeFunctions: UnsubscribeFunction[] = []

unsubscribeFunctions.push(
  audioStore.subscribe('play', handlePlay),
  audioStore.subscribe('pause', handlePause)
)

// 统一清理
unsubscribeFunctions.forEach(fn => fn())
```

### 3. 避免在高频事件中执行重操作
```typescript
// ❌ 不好的做法：在timeupdate中执行重操作
audioStore.subscribe('timeupdate', () => {
  // 这会每秒执行多次，影响性能
  updateComplexUI()
})

// ✅ 好的做法：使用节流或防抖
let lastUpdate = 0
audioStore.subscribe('timeupdate', () => {
  const now = Date.now()
  if (now - lastUpdate > 100) { // 限制更新频率
    updateUI()
    lastUpdate = now
  }
})
```

## 迁移指南

### 从旧版本迁移

旧版本：
```typescript
// 旧的实现方式
provide('setAudioEnd', setEndCallback)

function setEndCallback(fn: Function): void {
  endCallback.push(fn)
}
```

新版本：
```typescript
// 新的实现方式
provide('audioSubscribe', audioStore.subscribe)

// 使用时
const unsubscribe = audioSubscribe('ended', () => {
  // 处理播放结束
})

// 可以精确取消
unsubscribe()
```

## 性能优化

1. **避免重复订阅**：在订阅前检查是否已经订阅
2. **及时取消订阅**：组件卸载或不再需要时立即取消
3. **合理使用事件**：避免在高频事件中执行重操作
4. **批量操作**：需要清理多个订阅时使用批量清理方法

这个改进的发布-订阅模式为Ceru Music应用提供了更加灵活和可靠的音频事件管理机制。