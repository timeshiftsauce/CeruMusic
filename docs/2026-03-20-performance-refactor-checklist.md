# 2026-03-20 性能重构执行清单

> 目标：在不改主业务语义的前提下，完成一批高收益重构，降低监听泄漏风险、收敛主题/设置状态源、减少重复逻辑，并为后续继续拆大文件打基础。

## 范围

- [x] 任务 1：新增可复用的清理/事件基础设施
  - 产物：统一清理容器，支持组件内集中注册和销毁监听/定时器
  - 目的：减少匿名监听无法解绑、`removeAllListeners` 误伤全局监听的问题
  - 目标文件：`src/renderer/src/utils/disposables.ts`、相关测试、热点组件接入

- [x] 任务 2：治理监听与生命周期热点
  - 产物：修复 `search.vue`、`SongVirtualList.vue`、`PlayMusic.vue`、`RecognitionWorker.vue`、`Provider.vue` 的监听生命周期
  - 目的：避免 KeepAlive 重复 watch、匿名事件解绑失败、组件卸载后残留监听

- [x] 任务 3：收敛主题状态为单一入口
  - 产物：主题工具模块，`Provider.vue` 负责应用主题副作用，`ThemeSelector.vue` 只更新 store
  - 目的：去掉主题双实现，减少 `selected-theme` / `dark-mode` 的重复读写

- [x] 任务 4：收敛设置持久化
  - 产物：`Settings.ts` 仅保留单一持久化路径，消除手动持久化与 Pinia persist 双轨并存
  - 目的：减少状态源分叉和重复序列化

- [x] 任务 5：抽取“定位当前播放歌曲”公共逻辑
  - 产物：`useLocateCurrentSong.ts`
  - 目的：去掉 `list.vue` / `local.vue` 的大段重复定时器与滚动逻辑

- [x] 任务 6：补充测试与最小验证
  - 产物：为新增纯工具写测试；在当前环境可运行的范围内执行验证
  - 目的：为本批重构提供回归护栏

- [x] 任务 7：修复下载历史初始化与启动日志目录缺失
  - 产物：`DownloadManager` 启动时自动补齐 `downloads.json` 和日志目录
  - 目的：消除首次启动 `downloads.json` / `logs` 缺失告警，保证全新用户目录可用

- [x] 任务 8：收紧 `DownloadManager` 初始化边界
  - 产物：新增 `ready()`，显式暴露异步加载完成时机
  - 目的：减少构造函数内隐式异步带来的竞态，便于测试与后续主进程初始化编排

- [x] 任务 9：合并下载历史高频落盘
  - 产物：同一轮事件循环内的多次 `saveTasks()` 改为合并写入
  - 目的：减少高频状态切换时的重复磁盘 IO，降低状态落盘竞态

- [x] 任务 10：补充主进程下载链路回归测试
  - 产物：`DownloadManager.test.ts` 增加初始化、最新状态持久化、合并写入测试
  - 目的：给启动初始化和磁盘 IO 优化补上稳定护栏

- [x] 任务 11：收紧路由预加载策略
  - 产物：预加载白名单策略模块，默认关闭全量路由预热，仅保留高频页面候选
  - 目的：降低启动后空闲期内存占用和无效代码预解析成本

- [x] 任务 12：优化播放器封面链路
  - 产物：播放器封面解析工具与颜色分析缓存，去掉远程封面强制 Blob 化
  - 目的：减少切歌时的对象分配、重复 fetch 和重复颜色分析

- [x] 任务 13：拆分播放器重组件为按需异步加载
  - 产物：`FullPlay`、`PlaylistDrawer`、`CommentsOverlay`、`AudioVisualizer`、`PlaySettings` 懒加载接入
  - 目的：减少主界面常驻内存和首屏 JS 解析压力

- [x] 任务 14：细化 renderer vendor chunk
  - 产物：renderer manualChunks 规则，将 framework、lyrics、utils、naive-ui、tdesign 拆分
  - 目的：降低单个公共 chunk 体积，减少首轮解析压力并提升缓存命中

- [x] 任务 15：收口播放器显式命令层
  - 产物：统一的 `playbackCommands.ts`，替换页面侧 `play / pause / append / replace` 事件盲发
  - 目的：避免“提示成功但没有真正执行”的无回执命令链路，降低播放器行为分散带来的维护风险

- [x] 任务 16：优化搜索与歌单补图链路
  - 产物：`fillMissingSongCovers.ts` 有限并发补图工具，接入 `search.vue`、`list.vue`、`songlist.vue`
  - 目的：降低串行补图带来的长尾等待，避免旧请求回写新结果，并减少批量补图时的瞬时压力

- [x] 任务 17：优化播放列表批量追加与导入快照
  - 产物：`playlistManager.ts` 批量追加逻辑、`songlist.vue` 播放列表快照改为 `structuredClone`
  - 目的：减少逐首追加的重复提示与状态抖动，去掉重型 JSON 深拷贝
## 回填

- [x] 已完成代码修改
- [x] 已完成可执行验证
- [x] 已同步本批结果到清单

## 本批实际变更

- 新增 `src/renderer/src/utils/disposables.ts` 与 `src/renderer/src/composables/useDisposables.ts`，统一清理监听/定时器回收。
- 新增 `src/renderer/src/utils/theme/themeState.ts`，统一主题名称规范化、主题状态解析与 DOM 属性应用。
- 新增 `src/renderer/src/composables/useLocateCurrentSong.ts`，抽出 `list.vue` / `local.vue` 的公共定位逻辑。
- `search.vue` 改为只注册一次 watch，使用活跃态控制 KeepAlive 页面行为。
- `Provider.vue` 改为统一承接主题副作用与主要 IPC 监听，去掉主题事件双通道和 `removeAllListeners` 风格的全局清理。
- `ThemeSelector.vue` 改为只更新 store，不再直接操作 DOM / localStorage。
- `Settings.ts` 去掉设置持久化双轨，补充 `hasStoredSettings` / `hasStoredThemePreference` 边界。
- `SongVirtualList.vue`、`PlayMusic.vue`、`RecognitionWorker.vue`、`find.vue` 修复监听注册与解绑不对称问题。
- `autoUpdateService.ts` + `preload/index.ts` 为自动更新监听补上逐项 unsubscribe 能力。
- `DownloadManager.ts` 改为启动时自动补齐下载历史文件与日志目录，并暴露 `ready()` 初始化边界。
- `DownloadManager.ts` 的下载历史保存改为同一轮事件循环内合并写入，减少快速状态切换时的重复落盘。
- `logger/index.ts` 补上日志目录递归创建与按需重建，避免全新目录或目录被清空后写日志失败。
- `DownloadManager.test.ts` 新增 3 个回归测试，覆盖首次初始化、快速状态切换后的最终状态落盘、重复保存合并。

- 新增 `src/renderer/src/router/preloadPolicy.ts`，将路由预加载默认值改为关闭，并限定只对白名单高频页面预加载。
- 新增 `src/renderer/src/utils/playerCover.ts`，封装播放器封面 URL 解析与颜色分析缓存。
- `GlobalPlayStatus.ts` 去掉远程封面强制 Blob URL 转换，改为直接使用原始封面 URL 并复用颜色分析缓存。
- 新增 `src/renderer/src/utils/lazyComponent.ts`，统一重组件的异步加载入口。
- `PlayMusic.vue` 改为按需加载 `FullPlay` / `PlaylistDrawer`，`FullPlay.vue` 改为按需加载 `CommentsOverlay` / `AudioVisualizer` / `PlaySettings`。
- 新增 `src/common/build/rendererManualChunks.ts`，并在 `electron.vite.config.ts` 中接入 renderer `manualChunks` 分组策略。
- 新增 `preloadPolicy.test.ts`、`playerCover.test.ts`、`lazyComponent.test.ts`、`rendererManualChunks.test.ts`，为本轮性能改造补充回归测试。
- 新增 `src/renderer/src/utils/audio/playbackCommands.ts`，将 `replace / add-and-play / append / pause` 收拢为统一显式命令。
- `globaPlayList.ts` 改为注册命令执行器，页面侧不再依赖 `window.musicEmitter` 盲发播放器事件。
- `playlistManager.ts` 去掉播放器事件总线，新增批量追加逻辑，避免“全部加入播放列表”逐首触发提示和重复检查。
- 新增 `src/renderer/src/utils/music/fillMissingSongCovers.ts`，为补图链路提供有限并发、过期请求短路能力。
- `search.vue`、`list.vue`、`songlist.vue` 改为复用补图工具；搜索页和歌单页不再串行逐首拉取封面。
- `songlist.vue` 将播放列表导入快照从 `JSON.parse(JSON.stringify(...))` 改为 `structuredClone(toRaw(...))`，减少序列化开销。
## 验证结果

- `npm install`
- `node node_modules/jest/bin/jest.js --runInBand`
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/electron-vite/bin/electron-vite.js build`
- 重启 `npm run dev`，确认启动日志只出现 `Loaded 0 tasks from history.`，不再出现 `downloads.json` / `logs` 缺失告警

- 重新执行 electron-vite build，renderer 公共包从单个 1MB 级大块拆分为 vendor-ui-tdesign 670.35 kB、vendor-ui-naive 387.73 kB、vendor-lyrics 298.91 kB、vendor-utils 269.52 kB 等多个 chunk，构建输出不再出现 >1000 kB 警告
- 新增 `playbackCommands.test.ts`、`fillMissingSongCovers.test.ts` 后，`jest --runInBand` 当前为 11 个测试套件、40 个测试全部通过
- 再次执行 `tsc --noEmit -p tsconfig.node.json --composite false`、`vue-tsc --noEmit -p tsconfig.web.json --composite false` 与 `electron-vite build`，均通过

## 本轮 renderer 领域分层补充

- [x] 任务 18：写入 renderer 领域分层实施计划
  - 产物：`docs/2026-03-20-renderer-domain-architecture-plan.md`
  - 目的：为后续 `PlaybackDomain / SongCoverQuery / 单 UI 体系 / 独立进程拆分` 锁定边界与执行顺序

- [x] 任务 19：落地 PlaybackDomain 第一批收口
  - 产物：`src/renderer/src/domains/playback/playbackActions.ts` 与页面侧统一动作入口
  - 目的：让页面不再直接依赖底层播放器命令，实现 typed command 的领域化封装

- [x] 任务 20：落地 SongCoverQuery 第一批收口
  - 产物：`src/renderer/src/domains/music/songCoverQuery.ts` 与页面侧统一补图查询入口
  - 目的：让补图逻辑具备缓存、并发去重和请求过期控制，减少页面级重复实现

### 本轮新增实际变更

- 新增 `src/renderer/src/domains/playback/playbackActions.ts` 与 `src/renderer/src/domains/playback/index.ts`，将播放、暂停、追加、替换动作提升为 `PlaybackDomain`。
- 新增 `src/renderer/src/domains/music/songCoverQuery.ts` 与 `src/renderer/src/domains/music/index.ts`，将补图查询提升为 `SongCoverQuery`，并补上结果缓存与并发去重。
- `search.vue`、`list.vue`、`local.vue`、`songlist.vue` 改为依赖领域层入口，不再直接引用底层 typed command 文件。
- `search.vue`、`list.vue`、`songlist.vue` 改为通过 `SongCoverQuery` 管理补图重置与回写，页面不再自行维护过期 token。
- 新增 `src/renderer/src/domains/playback/playbackActions.test.ts` 与 `src/renderer/src/domains/music/songCoverQuery.test.ts`，为 renderer 领域层第一批改造补上回归测试。

### 本轮追加验证

- `node node_modules/jest/bin/jest.js src/renderer/src/domains/playback/playbackActions.test.ts --runInBand`
- `node node_modules/jest/bin/jest.js src/renderer/src/domains/music/songCoverQuery.test.ts --runInBand`
- `node node_modules/jest/bin/jest.js --runInBand`：当前为 13 个测试套件、46 个测试全部通过
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/electron-vite/bin/electron-vite.js build`

## 本轮继续收口

- [x] 任务 21：建立 legacy Naive UI 隔离边界
  - 产物：`src/renderer/src/ui/legacyNaive.ts`，主路径组件改为从桥接层引用 Naive 能力
  - 目的：在保留现有界面的前提下，把 `naive-ui` 收敛到单一桥接入口，避免继续向页面和领域层扩散

- [x] 任务 22：为 RecognitionWorker 增加空闲释放机制
  - 产物：`src/main/events/localMusicWorkerLifecycle.ts` 与 `localMusic.ts` 中的 worker lease 管理
  - 目的：避免本地识别隐藏窗口在任务完成后长期常驻，占用主应用内存

### 本轮追加实际变更

- 新增 `src/renderer/src/ui/legacyNaive.ts`，统一承接 `NConfigProvider`、`NDialogProvider`、`NMessageProvider`、`NIcon` 等 legacy Naive 入口。
- `Provider.vue`、`list.vue`、`UserCapsule.vue`、`LocalTagEditorPage.vue`、`LocalTagEditor.vue` 改为从 `@renderer/ui/legacyNaive` 引用 Naive 能力，renderer 主路径不再直接从 `naive-ui` 导入。
- 新增 `src/main/events/localMusicWorkerLifecycle.ts`，为本地识别 worker 提供 `acquire/release` 生命周期管理。
- `localMusic.ts` 改为在批量识别时按需持有 worker lease，并在空闲 60 秒后自动关闭隐藏 worker 窗口。
- 新增 `src/renderer/src/ui/legacyNaive.test.ts` 与 `src/main/events/localMusicWorkerLifecycle.test.ts`，为 UI 隔离边界和 worker 空闲释放补上回归测试。

### 本轮追加验证

- `node node_modules/jest/bin/jest.js src/renderer/src/ui/legacyNaive.test.ts --runInBand`
- `node node_modules/jest/bin/jest.js src/main/events/localMusicWorkerLifecycle.test.ts --runInBand`
- `node node_modules/jest/bin/jest.js --runInBand`：当前为 15 个测试套件、49 个测试全部通过
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/electron-vite/bin/electron-vite.js build`

## 本轮 UI 深度重构

- [x] 任务 23：写入 UI 现代化重构计划
  - 产物：`docs/2026-03-20-ui-modernization-plan.md`
  - 目的：锁定 `Aurora Glass` 视觉方向、动效策略和首批改造范围，避免页面散改

- [x] 任务 24：重构 App / HomeLayout 页面切换与主壳层
  - 产物：`src/renderer/src/App.vue`、`src/renderer/src/views/home/index.vue`、`src/renderer/src/components/layout/HomeLayout.vue`、`src/renderer/src/assets/main.css`
  - 目的：用统一 motion token 和玻璃壳层替换旧的 `animate.css` 整页淡入淡出，提升首页与路由切换的现代感

- [x] 任务 25：重构底部播放器与标题栏质感
  - 产物：`src/renderer/src/components/Play/PlayMusic.vue`、`src/renderer/src/components/TitleBarControls.vue`
  - 目的：在不改播放行为的前提下，统一播放器与标题栏的玻璃面板、辉光、按钮反馈和弹层动效

### 本轮新增实际变更

- `App.vue` 与 `views/home/index.vue` 去掉基于 `animate.css` 的页面切换，改为自定义 `app-shell / home-scene / home-detail` 过渡。
- `assets/main.css` 新增 shell / player / motion token，并补充全局背景、场景动效和页面切换动画。
- `HomeLayout.vue` 重构为带氛围光斑、玻璃侧栏、悬浮头部和主舞台容器的新壳层结构。
- `PlayMusic.vue` 重构底部播放器视觉语言，统一进度条、控制按钮、音量弹层和封面卡片的现代化质感。
- `TitleBarControls.vue` 调整为与新壳层一致的悬浮按钮风格，减少顶部 UI 割裂感。

### 本轮追加验证

- `node node_modules/jest/bin/jest.js --runInBand`：15 个测试套件、49 个测试全部通过
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/electron-vite/bin/electron-vite.js build`

## 本轮 UI 第二批收口

- [x] 任务 26：修正主壳层自适应与侧栏折叠能力
  - 产物：`src/renderer/src/components/layout/HomeLayout.vue`
  - 目的：解决窗口尺寸缩小时侧栏与头部挤压溢出，并增加侧栏折叠按钮

- [x] 任务 27：移除壳层多余说明文案并收紧搜索栏焦点行为
  - 产物：`src/renderer/src/components/layout/HomeLayout.vue`
  - 目的：去掉左上角副标题与 LIVE 标记，搜索栏聚焦时不再横向膨胀

- [x] 任务 28：补齐全页面统一舞台卡片视觉
  - 产物：`src/renderer/src/assets/main.css` 与 `find/search/local/recent/list/songlist/settings` 页面
  - 目的：将页面统一接入 `page-shell / page-hero / panel-shell`，让内容页和设置页都进入同一视觉体系

### 本轮新增实际变更

- `HomeLayout.vue` 新增侧栏折叠按钮与折叠状态持久化，去掉 `Aurora Listening Console` 与 `LIVE` 标记。
- `HomeLayout.vue` 调整头部与搜索区自适应规则，搜索栏聚焦仅高亮，不再扩宽。
- `main.css` 新增 `page-shell`、`page-hero`、`page-toolbar`、`panel-shell`、`page-scroll-shell` 全局页面壳层类。
- `search.vue`、`local.vue`、`recent.vue`、`find.vue`、`list.vue`、`songlist.vue`、`settings/index.vue` 接入统一页面壳层与舞台卡片视觉。
- `recent.vue` 去掉开发占位提示，页面回到可交付状态。

### 本轮追加验证

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/jest/bin/jest.js --runInBand`：15 个测试套件、49 个测试全部通过
- `node node_modules/electron-vite/bin/electron-vite.js build`

## 本轮页内深改

- [x] 任务 29：重构 find / songlist / list 的内容层级和局部动效
  - 产物：`src/renderer/src/views/music/find.vue`、`src/renderer/src/views/music/songlist.vue`、`src/renderer/src/views/music/list.vue`
  - 目的：把筛选区、歌单卡片、歌单头图、搜索栏和定位按钮统一为更顺滑的现代化内容层

- [x] 任务 30：重构 settings 的内部导航和 section 容器视觉
  - 产物：`src/renderer/src/views/settings/index.vue`
  - 目的：让设置页不仅壳层统一，内部的 `setting-group / setting-card / source-card / tech-item` 也进入同一玻璃卡片体系

### 本轮新增实际变更

- `find.vue` 重构分类筛选区、标签胶囊和歌单卡片的层级与悬浮动效，滚动区改为更稳定的舞台式布局。
- `songlist.vue` 重构本地歌单卡片、统计信息和空状态，让歌单网格更像真正的内容流而不是管理列表。
- `list.vue` 重构歌单头图、描述区、统计胶囊、歌单内搜索和定位按钮，局部动画改为更顺滑的过渡。
- `settings/index.vue` 为 section 切换增加平滑过渡，并通过 `:deep(...)` 收口 `settings-section / setting-group / setting-card / source-card / tech-item / developer-item` 等内部容器样式。

### 本轮追加验证

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false`
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.web.json --composite false`
- `node node_modules/jest/bin/jest.js --runInBand`：15 个测试套件、49 个测试全部通过
- `node node_modules/electron-vite/bin/electron-vite.js build`
