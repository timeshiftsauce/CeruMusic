# 本地音乐封面按需加载与缓存迁移说明

## 变更摘要

- 索引文件不再持久化 base64 封面，改为：
  - `hasCover: boolean`：是否存在内嵌封面
  - `coverKey: string`：由 `filePath + mtimeMs` 计算的哈希，用于缓存失效
- 新增主进程封面获取通道（带 LRU 内存缓存 + 可选磁盘缓存）：
  - `local-music:get-cover(trackId: string) => Promise<string>`
  - `local-music:get-covers(trackIds: string[]) => Promise<Record<string,string>>`
- 渲染进程在 `local.vue` 引入虚拟列表与按需拉取封面，滚动离开即取消请求并释放引用。

## 使用方式

### 渲染进程 API 示例

```ts
// 单张封面
const dataUrl = await window.api.localMusic.getCoverBase64(song.songmid)

// 批量封面
const map = await window.api.localMusic.getCoversBase64(songIds)
```

返回值均为带前缀的 `data:image/jpeg;base64,`，可直接绑定到 `<img src>`。

### 缓存策略

- 内存 LRU：上限 50 MB，按最近最少使用淘汰。
- Key：`filePath + mtimeMs`，文件变更（时间戳变化）后缓存自动失效。
- 磁盘缓存：`%USER_DATA%/covers-cache/<md5(key)>.txt`，存储 `dataUrl` 字符串。

### 虚拟列表

- 组件：`n-virtual-list`
- 参数：`item-size=60`，容器高度 `height: 100%`
- 仅在行组件挂载时请求封面，卸载时 `AbortController.abort()` 并清理引用。

## 安装与依赖

- 已使用 Naive UI（项目内已有），无需新增依赖。
- `node-taglib-sharp` 为读取内嵌封面依赖，保持不变。

## 性能基线（目标）

- 10,000 首：索引 JSON < 5 MB；首屏 < 600 ms；滚动并发 ≤ 30；主进程 CPU 峰值 < 15%。

## 变更文件

- `src/main/events/localMusic.ts`
- `src/main/services/LocalMusicIndex.ts`
- `src/main/services/CoverCache.ts`（新增）
- `src/preload/index.ts`
- `src/renderer/src/views/music/local.vue`
