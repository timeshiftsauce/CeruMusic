# 系统媒体控件原生集成 (external-media-integration)

CeruMusic 通过一个 Rust 原生模块把播放信息同步到系统媒体控件：

| 平台    | 技术                                                           |
| ------- | -------------------------------------------------------------- |
| Windows | WinRT `Windows.Media.Playback` → `SystemMediaTransportControls` |
| Linux   | `mpris-server`（D-Bus / MPRIS2）                                |
| macOS   | `objc2` → `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`    |

实现参照 [SPlayer](https://github.com/SPlayer-Dev/SPlayer) 的
`native/external-media-integration`，裁剪掉了 Discord RPC 部分。

## 为什么需要它：高清封面

浏览器 `navigator.mediaSession` 只能给系统一个封面 **URL**，Windows SMTC 会
自己去拉取并按自己的策略缩放 —— 结果常常是低分辨率糊图。

原生模块把封面**原始字节**通过 `RandomAccessStreamReference` / `NSData` /
MPRIS 元数据直接交给系统，绕开了这条压缩链路，所以系统卡片能显示高清封面。

> 注意：清晰度的上限仍然是**源图本身**。如果插件返回的封面 URL 本身就是
> 低清缩略图（例如网易云的 `?param=300y300`），原生通道也只能拿到 300px。

## 双通道降级

渲染端 `src/renderer/src/utils/audio/useSmtc.ts` 采用「原生优先，浏览器回落」：

```
updateMetadata()
   ├─ 原生模块可用 → window.api.emi.updateMetadata({ coverData: 原始字节 })
   └─ 否则         → navigator.mediaSession.metadata = new MediaMetadata({ artwork: [url] })
```

- 原生模块**没编译**或**加载失败**时整体 no-op，自动走 mediaSession，不影响播放。
- 探测结果缓存，只探一次（`emi:is-available`）。

## 目录结构

```
native/external-media-integration/
├── Cargo.toml
├── build.rs
└── src
    ├── lib.rs              # 导出给 Node.js 的 napi 函数
    ├── logger.rs           # tracing 日志（文件 + stderr）
    ├── model.rs            # JS <-> Rust 数据契约
    └── sys_media
        ├── mod.rs          # 跨平台 SystemMediaControls trait
        ├── windows.rs      # Windows SMTC（WinRT）
        ├── linux.rs        # Linux MPRIS（mpris-server + tokio）
        └── macos.rs        # macOS MPNowPlayingInfoCenter（objc2）
```

## 环境要求

### Rust 工具链

```bash
# https://rustup.rs
winget install --id Rustlang.Rustup    # Windows
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # macOS / Linux
```

### Windows 额外依赖（MSVC + Windows SDK）

需要 Visual Studio Build Tools 的「使用 C++ 的桌面开发」工作负载：

```powershell
# 必须以管理员身份运行
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

包含：
- MSVC v14x C++ x64/x86 build tools
- Windows 10/11 SDK

### Linux 额外依赖

```bash
sudo apt install libdbus-1-dev pkg-config
```

## 构建

```bash
yarn build:native:emi          # release
yarn build:native:emi:debug    # debug（编译快，未优化）
```

产出 `native/external-media-integration/external-media-integration.node`。

> **CI 里必须先编译再 `electron-builder`**，否则 `asarUnpack` 拿不到 `.node`。
> 见 `.github/workflows/main.yml` 的 "Build native external-media-integration module"。

## JS API

`src/preload/index.ts` 暴露 `window.api.emi`：

```ts
window.api.emi.isAvailable(): Promise<boolean>
window.api.emi.updateMetadata({
  songName, authorName, albumName,
  coverData,   // Uint8Array 原始图片字节（高清封面的关键）
  ncmId, duration
})
window.api.emi.updatePlaybackStatus('Playing' | 'Paused')
window.api.emi.updateTimeline({ currentTime, totalTime })   // 毫秒
window.api.emi.updatePlaybackRate(rate)
window.api.emi.updatePlayMode({ repeatMode: 'Track'|'List'|'None', isShuffling })
window.api.emi.onMediaEvent(cb) => unsubscribe
```

系统按键事件 `type` 取值：
`Play` / `Pause` / `Stop` / `NextSong` / `PreviousSong` /
`ToggleShuffle` / `ToggleRepeat` / `SetRate` / `SetVolume` / `Seek`

## 日志

原生层日志写到：

```
<userData>/logs/external-media-integration/external-media-integration.log
```

Windows 通常是 `%APPDATA%\ceru-music\logs\...`（dev 下是 Electron 默认 userData）。

排障时同时看主进程控制台：`[emi]` 前缀的消息会告诉你模块是否加载成功。

## 常见问题

**模块加载失败 / `The specified module could not be found`**

- 先跑 `yarn build:native:emi` 编译
- 确认架构一致（x64 / arm64）

**Windows 不显示媒体控件**

- 需要 Windows 10 1607 及以上
- 检查 `<userData>/logs/external-media-integration/` 里的日志
- 确认没有把媒体键注册成 `globalShortcut` —— 那会关闭 Chromium 自身的 SMTC 发布

**封面仍然糊**

- 原生通道只能拿到插件给的源图；如果源图本身是缩略图，需要插件的 `getPic` 返回更大尺寸
- 检查日志里有没有「创建封面内存流失败」——那说明字节流构造失败，会退回无封面

**链接错误 `LNK1181: cannot open input file`**

- Visual Studio Build Tools 未装好，或 Windows SDK 缺失

## 打包

`electron-builder.yml` 已配置：

- `asarUnpack: native/external-media-integration/**` —— `.node` 无法从 asar 内 dlopen
- `files` 排除 `src/`、`target/`、`Cargo.toml` 等，只保留编译产物

加载路径（`nativeMediaService.resolveNativePath()`）：

```
dev  : <repo>/native/external-media-integration/external-media-integration.node
打包 : resources/app.asar.unpacked/native/external-media-integration/external-media-integration.node
```
