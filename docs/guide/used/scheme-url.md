# Scheme URL（深度链接）使用指南

## 一、文档概述

- **文档目的：** 说明 Ceru Music 支持的 `cerumusic://` 自定义协议链接（Scheme URL / Deep Link），以及每种链接的用途和使用方法。
- **功能简介：** Ceru Music 注册了 `cerumusic://` 系统协议，允许从浏览器、外部程序或链接直接调起应用并执行指定操作，如安装插件、控制播放、打开分享内容等。
- **适用平台：** Windows、macOS 桌面客户端
- **适用用户：** 普通用户、插件开发者、第三方工具/脚本开发者

## 二、使用前提

- 已安装 Ceru Music（澜音）并至少完整启动过一次，以完成系统协议注册。
- Windows 用户：协议在应用安装时自动注册到系统（注册表）。
- macOS 用户：应用首次运行后完成协议注册，可在浏览器地址栏直接输入链接触发。
- 部分操作（如安装插件）需要应用处于运行状态或会自动唤起应用。

## 三、支持的 Scheme URL 列表

### 3.1 播放控制

| URL | 功能 | 说明 |
|-----|------|------|
| `cerumusic://play/toggle` | 播放 / 暂停切换 | 切换当前播放状态 |
| `cerumusic://play/next` | 下一首 | 切换到播放列表下一首 |
| `cerumusic://play/prev` | 上一首 | 切换到播放列表上一首 |

### 3.2 插件安装

| URL | 功能 | 说明 |
|-----|------|------|
| `cerumusic://plugin/add/link?type=<类型>&url=<插件地址>` | 安装插件 | 触发一键安装流程 |
| `cerumusic://plugin/add/link?type=<类型>&url=<插件地址>&pluginId=<ID>` | 更新插件 | 更新已安装的指定插件 |

**参数说明：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | 是 | 插件类型：`cr`（澜音格式插件）或 `lx`（洛雪格式插件） |
| `url` | 是 | 插件文件的 HTTP/HTTPS 下载地址 |
| `pluginId` | 否 | 填写时触发更新流程（覆盖同 ID 的已有插件），不填则触发安装流程 |

**示例：**

```
cerumusic://plugin/add/link?type=cr&url=https://example.com/plugin.js
```

> **注意：** 应用在处理外部 Deep Link 插件安装请求时，会弹出安全提示对话框，确认来源可靠后方可继续。请勿点击来路不明的插件安装链接。

### 3.3 分享内容

分享链接由应用内「分享」功能生成，接收方打开链接后应用自动展示对应内容。

| URL 格式 | 功能 |
|---------|------|
| `cerumusic://share/<分享ID>` | 打开他人分享的歌曲 |
| `cerumusic://playlist/share/<分享ID>` | 打开他人分享的歌单 |

这类链接通常由分享功能自动生成，无需手动构造，直接点击或粘贴到浏览器地址栏即可唤起应用并打开分享内容。

### 3.4 OAuth 认证（内部使用）

以下链接为系统内部使用，普通用户无需关注：

| URL | 用途 |
|-----|------|
| `cerumusic://oauth/callback` | 登录认证回调（系统自动处理） |
| `cerumusic://oauth/logout-callback` | 登出认证回调（系统自动处理） |

## 四、使用方式

### 4.1 在浏览器中打开

1. 在浏览器地址栏输入 Scheme URL（如 `cerumusic://play/toggle`）并按 `Enter`。
2. 浏览器弹出权限提示，确认允许打开 Ceru Music。
3. 应用执行对应操作（若应用未运行，系统会先启动应用再执行）。

### 4.2 在脚本或命令行中调用

**Windows（PowerShell / 命令提示符）：**

```powershell
# 切换播放暂停
Start-Process "cerumusic://play/toggle"

# 下一首
Start-Process "cerumusic://play/next"
```

**macOS（终端）：**

```bash
# 切换播放暂停
open "cerumusic://play/toggle"

# 下一首
open "cerumusic://play/next"
```

### 4.3 在 HTML 链接中使用

```html
<a href="cerumusic://play/toggle">播放/暂停</a>
<a href="cerumusic://play/next">下一首</a>
<a href="cerumusic://plugin/add/link?type=cr&url=https://example.com/plugin.js">一键安装插件</a>
```

### 4.4 应用唤起行为

- **应用已运行：** 直接执行对应操作，并将主窗口置于前台（若已最小化则还原）。
- **应用未运行（Windows）：** 系统启动应用，等待初始化完成后再执行对应操作（冷启动会短暂延迟）。
- **应用未运行（macOS）：** 系统通过 `open-url` 事件唤起应用并传入链接进行处理。

## 五、注意事项

- `cerumusic://` 协议仅在本机安装了 Ceru Music 的设备上有效，未安装设备无法响应。
- 插件安装链接（`plugin/add/link`）会弹出安全确认对话框，请仔细核实链接来源后再确认安装。
- 分享链接（`share/` 和 `playlist/share/`）有有效期限制，过期的链接无法打开内容。
- 播放控制链接（`play/*`）需要应用正在运行且有加载好的播放列表，否则操作无实际效果。

## 六、常见问题

**Q1：在浏览器中输入 `cerumusic://` 链接后没有反应，如何处理？**

A：① 确认 Ceru Music 已安装并至少启动过一次；② 浏览器可能拦截了协议跳转，检查地址栏下方是否有弹出框需要点击「允许」；③ 尝试重新安装应用以重新注册系统协议。

**Q2：Windows 上点击分享链接后弹出「找不到对应程序」？**

A：说明系统协议未注册，重新运行一次 Ceru Music 安装程序（选择修复安装）或完整卸载后重新安装即可修复。

**Q3：如何验证系统协议是否注册成功？**

A：

- **Windows：** 按 `Win + R`，输入 `cerumusic://play/toggle`，点击确定，若应用正常响应则说明注册成功。
- **macOS：** 打开终端，执行 `open "cerumusic://play/toggle"`，观察应用是否响应。

**Q4：插件安装的分享链接格式是什么？插件作者如何生成？**

A：插件作者将插件文件托管到可公开访问的 HTTP/HTTPS 地址后，按如下格式构造链接：

```
cerumusic://plugin/add/link?type=cr&url=<插件文件直链>
```

用户点击该链接即可触发一键安装流程，无需手动复制粘贴地址。

**Q5：播放控制链接可以绑定到系统快捷键或流媒体按键上吗？**

A：可以。在 Windows 上可使用 AutoHotkey 等工具将 `cerumusic://play/toggle` 绑定到自定义按键；在 macOS 上可使用 Shortcuts（快捷指令）App 配合 `open` 命令实现。更推荐直接使用应用内的[全局快捷键设置](/guide/used/hotkeys)功能。

## 七、相关文档

- [插件类使用](/guide/CeruMusicPluginHost)
- [听歌识曲与歌曲分享](/guide/used/recognize-and-share)
- [快捷键设置](/guide/used/hotkeys)
