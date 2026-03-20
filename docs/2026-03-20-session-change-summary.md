# 2026-03-20 会话变更概要

**主题**

- 完成 `CeruMusic-main` 的 P0、P1、P2 内存优化任务
- 修复根级缓存接入后的 `App.vue` 路由过渡结构问题
- 补齐本次会话所有关键改动的仓库内留档，便于后续追溯与 GitHub 查看

**架构与内存优化**

- 根级缓存改为仅缓存 `home` 路由，避免 `settings`、`profile` 等顶层页面长期常驻
- `GlobalPlayStatus` 改为最小持久化快照，只保留恢复播放所需的基础字段
- `LocalUserDetail` 改为最小歌曲快照写盘，并为写入增加 debounce，降低序列化频率
- `local-music:scan` 不再同时走事件和 `JSON.stringify(allSongs)` 双重传输，`invoke` 仅返回 `{ success, count }`

**IPC 与边界收口**

- `preload` 不再向主路径暴露 raw `ipcRenderer`
- 补了 `appInfo`、`appEvents`、`desktopLyric`、`recognitionWorker` 等 typed API
- AI 流、扫描、本地识曲、桌面歌词等订阅全部改为返回 `unsubscribe`
- 移除了 renderer 主路径中对 `window.electron.ipcRenderer` 的直接依赖

**页面与重组件优化**

- `SongVirtualList` 默认封面并发从 `30` 下调到 `12`
- `PlayMusic` 中的 `FullPlay` 与 `PlaylistDrawer` 改为按需挂载
- `FullPlay` 中的 `CommentsOverlay` 改为显示时再挂载

**测试与验证**

- `jest --runInBand`
- `tsc --noEmit -p tsconfig.node.json --composite false`
- `vue-tsc --noEmit -p tsconfig.web.json --composite false`
- `electron-vite build`

**本次新增或重点调整文件**

- `src/renderer/src/App.vue`
- `src/renderer/src/router/rootCachePolicy.ts`
- `src/renderer/src/store/globalPlayPersistence.ts`
- `src/renderer/src/store/localUserPersistence.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/preload/localMusicScan.ts`
- `src/main/events/localMusic.ts`
- `src/renderer/src/components/Play/PlayMusic.vue`
- `src/renderer/src/components/Play/FullPlay.vue`
- `src/renderer/src/components/Music/SongVirtualList.vue`
- `docs/2026-03-20-memory-reduction-plan.md`
