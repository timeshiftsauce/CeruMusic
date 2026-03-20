# Renderer Domain Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留 `Electron + Vue + Pinia` 的前提下，把 renderer 收口为“领域分层 + typed command + query/cache + 单 UI 体系”，并为高成本模块拆到独立窗口或 utility 进程做准备。

**Architecture:** renderer 不再让页面直接拼装播放器命令、补图请求和跨页面状态，而是通过 `domains/*` 暴露稳定接口。第一阶段优先收口 `PlaybackDomain` 与 `SongCoverQuery`，第二阶段统一 UI 体系并压缩页面依赖面，第三阶段将桌面歌词、识别、可视化等高成本能力剥离出主窗口。

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, electron-vite, Jest, TDesign, Naive UI

---

## 目标结构

```text
src/renderer/src
├── domains
│   ├── playback
│   │   ├── playbackActions.ts
│   │   ├── playbackCommands.ts
│   │   └── index.ts
│   ├── music
│   │   ├── songCoverQuery.ts
│   │   └── index.ts
│   ├── library
│   └── settings
├── views
├── components
└── utils
```

## 阶段划分

### Task 1: 收口 PlaybackDomain

**Files:**
- Create: `src/renderer/src/domains/playback/playbackActions.ts`
- Create: `src/renderer/src/domains/playback/index.ts`
- Modify: `src/renderer/src/views/music/search.vue`
- Modify: `src/renderer/src/views/music/list.vue`
- Modify: `src/renderer/src/views/music/local.vue`
- Modify: `src/renderer/src/views/music/songlist.vue`
- Test: `src/renderer/src/domains/playback/playbackActions.test.ts`

- [ ] 写失败测试，约束页面只能通过统一动作层调用播放/暂停/追加/替换
- [ ] 运行测试确认当前缺少领域动作层
- [ ] 实现最小 `PlaybackDomain`，内部复用现有 typed command
- [ ] 将高频页面切换到 `PlaybackDomain`
- [ ] 跑测试与类型检查，确认页面不再直接依赖底层命令文件

### Task 2: 收口 SongCoverQuery

**Files:**
- Create: `src/renderer/src/domains/music/songCoverQuery.ts`
- Create: `src/renderer/src/domains/music/index.ts`
- Modify: `src/renderer/src/views/music/search.vue`
- Modify: `src/renderer/src/views/music/list.vue`
- Modify: `src/renderer/src/views/music/songlist.vue`
- Test: `src/renderer/src/domains/music/songCoverQuery.test.ts`

- [ ] 写失败测试，覆盖补图缓存、并发去重、请求过期
- [ ] 运行测试确认当前缺少领域查询层
- [ ] 实现最小 `SongCoverQuery`
- [ ] 将搜索页、歌单页补图链路切换到领域查询层
- [ ] 跑测试与类型检查，确认补图逻辑不再散落页面

### Task 3: 统一 UI 体系

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/src/main.ts`
- Modify: `src/renderer/src/components/layout/Provider.vue`
- Modify: `src/renderer/src/views/music/search.vue`
- Modify: `src/renderer/src/views/music/list.vue`
- Modify: `src/renderer/src/views/music/LocalTagEditorPage.vue`

- [ ] 盘点 Naive UI 与 TDesign 的实际使用边界
- [ ] 明确单一主 UI 体系，当前建议保留 `TDesign` 作为主体系
- [ ] 为短期无法移除的 Naive 组件建立隔离边界
- [ ] 在新代码中禁止继续混入第二套 UI 组件
- [ ] 跑构建，确认 UI 依赖面没有继续扩大

### Task 4: 拆高成本模块到独立窗口或 utility 进程

**Files:**
- Modify: `src/main/**`
- Modify: `src/preload/**`
- Modify: `src/renderer/src/views/DeskTopLyric/**`
- Modify: `src/renderer/src/views/music/RecognitionWorker.vue`
- Modify: `src/renderer/src/components/Play/AudioVisualizer.vue`

- [ ] 识别当前高成本模块的宿主位置和资源占用
- [ ] 优先把识别与重计算逻辑迁到 utility process / worker
- [ ] 保持桌面歌词与主窗口解耦，只走最小数据桥接
- [ ] 让可视化与评论层在真正可见时才挂载
- [ ] 跑启动与构建验证，确认拆分后主窗口功能不回归

## 当前执行策略

- `Task 1` 与 `Task 2` 已完成，renderer 已具备第一批领域层基础设施
- `Task 3` 与 `Task 4` 已完成第一批切片，当前进入“继续压缩 Naive 运行面 + 继续降低识别宿主成本”的阶段


## 当前进展

- `Task 3` 已完成第一批：建立 `legacyNaive` 桥接层，并把主路径组件切换到桥接入口；下一步是把仍然依赖 `n-*` 模板组件的页面继续迁出或替换。
- `Task 4` 已完成第一批：`RecognitionWorker` 改为按需持有 worker lease，并在空闲后自动销毁隐藏窗口；下一步才是把指纹计算从隐藏窗口迁往 `utilityProcess` 或其他更轻的宿主。

