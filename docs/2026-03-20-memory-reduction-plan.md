# Memory Reduction Implementation Plan

**目标**

在不改变现有功能和页面表现的前提下，降低 `renderer` 常驻内存、减少扫描峰值内存，并收紧 IPC 与持久化边界。

**执行结果**

- [x] P0-1 根路由缓存收口：仅缓存 `home` 根页面，保留首页内部子路由缓存
- [x] P0-2 `GlobalPlayStatus` 改为最小持久化快照，停止持久化评论/歌词/封面分析结果
- [x] P0-3 `LocalUserDetail` 改为最小歌曲快照写盘，并对持久化写入做 debounce
- [x] P0-4 `local-music:scan` 改为单次大结果传输，去掉事件外的重复 JSON 返回
- [x] P1-1 为欢迎页、设置、桌面歌词、识曲 worker、播放器补 typed preload API
- [x] P1-2 收掉 `removeAllListeners` 风格的清理方式，改为 unsubscribe
- [x] P1-3 从主路径组件移除 direct `window.electron.ipcRenderer` 依赖
- [x] P2-1 下调 `SongVirtualList` 封面并发并保持现有交互不变
- [x] P2-2 继续缩小播放队列与播放状态的持久化边界
- [x] P2-3 对隐藏重组件补空闲释放或不活跃态停用
- [x] 验证 `jest`
- [x] 验证 `tsc --noEmit -p tsconfig.node.json --composite false`
- [x] 验证 `vue-tsc --noEmit -p tsconfig.web.json --composite false`
- [x] 验证 `electron-vite build`

**注意事项**

- 优先新增纯函数 helper 和对应测试，再改生产代码
- 所有改动保持现有页面结构和交互文案不变
- 若现有逻辑依赖旧的持久化结构，新代码必须兼容旧数据读取

**结果摘要**

- 根路由缓存改为只缓存 `home`，保留首页内层缓存以避免从设置页返回时整页重建
- 播放状态与本地播放列表改为最小快照持久化，去掉大对象全量持久化
- `local-music:scan` 改成事件发送大结果，`invoke` 返回摘要，避免重复传大数组
- `preload` 去掉主路径对 raw `ipcRenderer` 的依赖，收口为 typed API + unsubscribe
- 进一步降低长列表封面并发，并对隐藏重组件按需挂载
