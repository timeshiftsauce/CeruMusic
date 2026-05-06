# 贡献者改动合并清单

> 基线：`v1.9.11`（贡献者下载的 ZIP 版本） → 你的当前 main 已是 `v1.9.13` 并多了若干提交。
> 标记说明：✅ 干净合并 / ⚠️ 有冲突需手工协调 / ❌ 不要合并（会引发问题） / ⏭️ 你已经做了，可跳过

勾选你想合并的项，回复"合并 1、3、5..."我会逐项 apply 并标出冲突部位让你确认。

---

## 🎉 新增功能

- [x] **1. macOS 菜单栏歌词** ✅ _推荐_
      在 Mac 状态栏滚动显示当前歌词 + 托盘弹播放控制菜单（macOS 独有）。
  - 新增 [src/main/services/menuBarLyric.ts](src/main/services/menuBarLyric.ts)（263 行，独立模块零冲突）
  - 改 [src/main/events/lyric.ts](src/main/events/lyric.ts)（你没改过，干净）
  - 改 [src/main/index.ts](src/main/index.ts) ⚠️ 跟你最近的 `Ctrl+W 拦截`、`setupTray` 共享文件，需手工合并 setupTray
  - 改 [src/renderer/src/store/Settings.ts](src/renderer/src/store/Settings.ts)、[src/renderer/src/components/layout/Provider.vue](src/renderer/src/components/layout/Provider.vue)、[src/renderer/src/main.ts](src/renderer/src/main.ts)、[src/renderer/src/views/settings/sections/AppearanceSection.vue](src/renderer/src/views/settings/sections/AppearanceSection.vue)、[src/renderer/src/views/settings/searchIndex.ts](src/renderer/src/views/settings/searchIndex.ts)（都没改过，干净）

- [ ] **2. 缓存系统升级（LRU + 容量限制 + 手动下载保护）** ⚠️ **重大冲突**
      贡献者新建了一个**完全不同实现**的 [src/main/services/musicCache.ts](src/main/services/musicCache.ts)（470 行，JSON 单文件存 URL/歌词）。**会和你现有的 [src/main/services/musicCache/](src/main/services/musicCache/)（346 行，基于 hash 的文件缓存）冲突** —— Node 模块解析下 `musicCache.ts` 会**优先于** `musicCache/index.ts`，等于偷偷换掉了你现有缓存层。

  > 必须先决定：(a) 抛弃旧实现整体替换；(b) 把 LRU/容量管理 port 到现有架构；(c) 共存（不可行，模块路径冲突）。
  > 涉及：[src/main/events/musicCache.ts](src/main/events/musicCache.ts)、[src/renderer/src/components/Settings/MusicCache.vue](src/renderer/src/components/Settings/MusicCache.vue) UI 重写、preload 新增 7 个 API、Settings store 加 3 个字段。
  > **建议**：先单独讨论是否需要这次重构。

- [x] **3. 听歌识曲：UI 重做 + 上传音频文件 + 麦克风权限** ✅
      圆形麦按钮 + 呼吸动画、悬浮提示、文件上传识别。
  - 改 [src/renderer/src/components/Play/AudioMatch.vue](src/renderer/src/components/Play/AudioMatch.vue)（你没改过，干净）
  - ⚠️ **小坑**：贡献者把代码里的 `getElementById('globaAudio')` 改成了 `'globalAudio'`。需要核实 [src/renderer/src/components/Play/GlobalAudio.vue](src/renderer/src/components/Play/GlobalAudio.vue) 实际的 `<audio id="...">` 是什么——若是 `globaAudio`（拼写错误但实际就是这值），合并后这个组件会**直接坏掉**。

- [x] **4. 系统音频采集显式授权流程（安全加固）** ✅
      主进程 PermissionCheck/RequestHandler，每次识曲必须先 `prepareCapture` 拿一次性令牌（10 秒过期、最多 4 次）。防止页面静默调用屏幕采集。
  - 改 [src/main/index.ts](src/main/index.ts) ⚠️ 跟项目 1、9 共享文件
  - 改 [src/preload/index.ts](src/preload/index.ts) ⚠️ 你也动过 preload（添加了 share、close-requested 等 API），手工合并
  - 改 [src/preload/index.d.ts](src/preload/index.d.ts)、[src/renderer/src/views/music/recognize.vue](src/renderer/src/views/music/recognize.vue)（干净）

- [x] **5. closeToTray 渲染→主进程实时同步** ⚠️
      设置变更立刻 IPC 同步到主进程，关闭主窗口时按最新值决定"最小化到托盘 vs `app.exit(0)`"。
  - 改 [src/main/events/index.ts](src/main/events/index.ts) ⚠️ 你已经加了 `InitShareService`；贡献者改了 `mainWindow.on('close')`。重要：**贡献者的实现会和你 commit 2252c1f 加的 `window-close-requested` 拦截机制冲突**。两者目标相似但路径不同——你是渲染端拦截后弹对话框；贡献者是主进程读 config 决定。需要二选一或合并思路。
  - 我决定使用贡献者的 你确保不好坏掉
  - 改 [src/preload/index.ts](src/preload/index.ts)、[src/renderer/src/store/Settings.ts](src/renderer/src/store/Settings.ts)

- [ ] **6. 播放队列抽屉显示歌曲封面** ✅
      PlaylistDrawer 每首歌前面加 40×40 圆角缩略图。
  - 改 [src/renderer/src/components/Play/PlaylistDrawer.vue](src/renderer/src/components/Play/PlaylistDrawer.vue)（你没改过，干净）

- [ ] **7. 插件 host 支持 `getPic` 封面获取** ✅
      事件驱动插件 host 在 `musicUrl` 之外新增 `getPic` 接口。
  - 改 [src/main/services/plugin/manager/converter-event-driven.ts](src/main/services/plugin/manager/converter-event-driven.ts)
  - ⚠️ 你最近 commit `c6dc9b5` 优化了插件管理 + 新加了 `pluginWorker.ts`，需要核实没冲突。

---

## 🔧 优化 / 修复

- [x] **8. macOS 托盘菜单重构（上一首/暂停/下一首 + 单例化）** ⚠️
      贡献者：托盘**复用**已有 (单例)、加 playPrev/playNext 菜单、mac 用 GUID 持久化、mac 上禁用时清空标题/菜单。
  - 改 [src/main/index.ts](src/main/index.ts) `setupTray()`
  - **冲突**：你当前 `setupTray()` 走的是"先销毁再重建"路线，贡献者改成"复用已有"。两条思路不同，需要选一种。建议跟项目 1 一起合并（都改 main/index.ts）。
  - 我决定使用贡献者的 你确保不好坏掉

- [ ] **9. 桌面歌词窗口懒创建 + IPC 防崩溃** ✅
      你当前 [src/main/index.ts:626](src/main/index.ts#L626) 是 `lyricWindow.create()` 立即创建。贡献者改成只有上次开过才创建。同时 lyric.ts 所有 IPC 改用 `getLyricWin()`/`ensureLyricWin()` 防 destroyed。
  - 改 [src/main/events/lyric.ts](src/main/events/lyric.ts)、[src/main/index.ts](src/main/index.ts)
  - 跟项目 1、4、8 共享 main/index.ts

- [ ] **10. 播放逻辑修复（自然结束延迟 1.5s 切歌 + 随机模式自校验 + 启动恢复上次播放）** ⚠️
      歌曲 `ended` 后等 1.5s 再切下一首，避免和无感过渡重叠。`shuffleOrder` 完整性自校验。
  - 改 [src/renderer/src/utils/audio/crossfade.ts](src/renderer/src/utils/audio/crossfade.ts)、[src/renderer/src/utils/audio/globaPlayList.ts](src/renderer/src/utils/audio/globaPlayList.ts)
  - **冲突**：你最近也改了 globaPlayList.ts（commit 历史显示），可能有冲突需手工 merge。

- [ ] **11. 本地音乐封面同步到播放队列/播放信息** ⚠️
      本地歌曲读取内嵌封面后同步到当前播放信息和队列里的同 id 项。
  - 改 [src/renderer/src/store/GlobalPlayStatus.ts](src/renderer/src/store/GlobalPlayStatus.ts)、[src/renderer/src/views/music/local.vue](src/renderer/src/views/music/local.vue)、[src/renderer/src/utils/audio/globaPlayList.ts](src/renderer/src/utils/audio/globaPlayList.ts)
  - **冲突**：你的 [GlobalPlayStatus.ts:230-252](src/renderer/src/store/GlobalPlayStatus.ts#L230-L252) 已经有本地封面读取逻辑了；贡献者多加了**同步到播放队列**那一段。需要选择性合并那 6 行新逻辑。

- [ ] **12. 欢迎页加速（不阻塞插件初始化 + 3 秒超时兜底）** 🤔
      你当前 [welcome/index.vue:115-120](src/renderer/src/views/welcome/index.vue#L115-L120) 还是阻塞 `await invoke('service-plugin-initialize-system')`。但你 [main/index.ts:567](src/main/index.ts#L567) 已经在 createWindow 之前就 `await pluginService.initializePlugins()` ——所以渲染端这个 IPC **本来就 instant return**。这条优化对你来说**意义不大**（除非你想加 3 秒超时兜底防 IPC 卡死）。
  - 改 [src/renderer/src/views/welcome/index.vue](src/renderer/src/views/welcome/index.vue)、[src/main/events/plugins.ts](src/main/events/plugins.ts)
  - 注意：贡献者把 `events/plugins.ts:194` 的 `initializePlugins()` 改成 `getPluginsList()`，这跟你的设计哲学相反。**建议跳过**或只合并 welcome 端的 3 秒超时部分。

- [ ] **13. 音频输出 store 资源释放 + 兼容性** ✅
      组件卸载时正确移除 `devicechange` 监听；`enumerateDevices` 不可用时给明确错误。
  - 改 [src/renderer/src/store/audioOutput.ts](src/renderer/src/store/audioOutput.ts)、[src/renderer/src/components/Settings/AudioOutputSettings.vue](src/renderer/src/components/Settings/AudioOutputSettings.vue)、[src/renderer/src/components/Play/GlobalAudio.vue](src/renderer/src/components/Play/GlobalAudio.vue)
  - 注：贡献者删除了 GlobalAudio.vue 里 onMounted 中的 `audioOutputStore.init()` 调用，改在 AudioOutputSettings 卸载时 `destroy()`。需要确认音频输出的初始化时机不会漏掉。

- [ ] **14. 听歌识曲 starting 中间态** ✅
      [recognize.vue](src/renderer/src/views/music/recognize.vue) 加 `starting` 状态防初始化未完时重复触发；`NotAllowedError` 细分。
      跟项目 4 一起合并最自然。

---

## 🛠 构建 / 打包 / CI

- [x] ⏭️ **15. macOS 打包：拆 x64/arm64 + 麦克风权限 + electron-builder 升级** **已完成**
      你已经：x64/arm64 拆分 ✅、`entitlements.mac.plist` ✅、`NSMicrophoneUsageDescription` ✅、`electron-builder` 26.8.1 ✅、`hardenedRuntime: true` + `notarize: true` ✅。
  - 唯一**未做**的：贡献者加了 `x64ArchFiles: '**/node_modules/@img/**/*'`（sharp 模块架构特定文件）——但你的提交历史显示 commit `e1e3a3f` 已经移除了类似配置改用别的方式。**可全跳过**。

- [x] ⏭️ **16. CI 工作流 actions 版本升级** **已完成**
      你已经：checkout v5、setup-node v5、cache v5、upload-artifact v6、softprops/action-gh-release v3。**全跳过**。

- [ ] **17. dev/preview 改用 [scripts/electron-vite-safe.js](scripts/electron-vite-safe.js) 包装启动** 🤔
      作用：清掉 `ELECTRON_RUN_AS_NODE` 环境变量；preview 模式直接拉起 Electron 二进制跳过 wrapper。属于边角优化，**没遇到具体问题不必合**。
  - 新增 [scripts/electron-vite-safe.js](scripts/electron-vite-safe.js)
  - 改 [package.json](package.json) `dev`、`start` 脚本
  - 改 [electron.vite.config.ts](electron.vite.config.ts)（renderer host=127.0.0.1）

---

## 🧹 清理项

- [ ] ❌ **18. 删除歌单封面更新 IPC `songlist:update-cover`** **绝对不要合并**
      贡献者删了 [`ManageSongList.updateCoverImgById`](src/main/services/songList/ManageSongList.ts)、`songlist:update-cover` IPC handler、preload 的 `updateCover`。

  > **会直接破坏你的分享功能和歌单封面更新**：
  >
  > - [src/renderer/src/utils/playlist/sharePlaylistLocalHelper.ts:24](src/renderer/src/utils/playlist/sharePlaylistLocalHelper.ts#L24) — 分享歌单时设置封面
  > - [src/renderer/src/views/music/songlist.vue:944, 989, 1277](src/renderer/src/views/music/songlist.vue#L944) — 歌单封面同步
  > - [src/renderer/src/views/music/list.vue:1215, 1442, 1456, 1551](src/renderer/src/views/music/list.vue#L1215) — 歌单详情封面
  >
  > 贡献者下载的 v1.9.11 还没这些调用，所以他没意识到。**勾选这条 = 破坏分享**。

- [x] **19. .gitignore 新增运行时目录** ⚠️
      贡献者加了 `.electron-dev-userdata-test/`、`.electron-launch/`、`.claude/`、`.workflow/`、`plugins/`。
  > **三个隐患**：
  >
  > - 把 `out` 改成了 `nout`（手误，必须修回 `out`）
  > - `.claude/` 你目前**有提交**（[.claude/settings.json](.claude/settings.json) 已被跟踪）——加这条会导致后续修改不被追踪
  > - `plugins/` 你目录里有 `plugins/navidrome-service.js`，git status 显示已被跟踪
  >
  > **建议**：只合并 `.electron-dev-userdata-test/` 和 `.electron-launch/` 两条。

---

## 📋 我的合并建议

按价值/难度排序，我推荐你勾选：

**第一批 - 高价值低风险**：

- [ ] 1（菜单栏歌词）+ 8（托盘菜单重构）+ 9（懒创建歌词窗口）打包合并 — 都改 main/index.ts
- [ ] 6（播放队列封面）— 独立小改动
- [ ] 13（audioOutput 销毁）+ 14（recognize starting）— 健壮性补丁
- [ ] 7（插件 host getPic）— 独立功能

**第二批 - 需协调**：

- [ ] 3（识曲 UI）+ 4（采集授权）— 一组听歌识曲改进
- [ ] 11（本地封面同步）— 只合并新增的"同步到队列"那 6 行
- [ ] 10（播放逻辑修复）— 需先看冲突再决定

**第三批 - 谨慎评估**：

- [ ] 2（缓存重构）— 需先决定架构方向
- [ ] 5（closeToTray 同步）— 跟你的 window-close-requested 协调
- [ ] 12（欢迎页加速）— 仅合并超时兜底
- [ ] 19（.gitignore）— 仅合并 dev 临时目录两条

**不要勾选**：

- 15、16（已完成）
- 17（边角优化无问题别折腾）
- 18（破坏分享功能）
