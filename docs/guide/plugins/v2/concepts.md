---
pageClass: plugin-v2-doc
---

# 常用概念

不必先记住这些名字。读教程遇到不熟悉的词时，再来查对应的一项。

## 插件清单（Manifest）

插件的自我介绍，写在 ceru.plugin.json 的 manifest 字段中。它告诉澜音插件叫什么、有哪些命令、需要哪些权限。

## 命令与动作（Command / Action）

命令是用户能选择的入口；动作是入口背后执行的函数。清单声明入口，代码注册函数，两边通过 action 名称对应。

## 数据提供者（Provider）

一组供澜音调用的音乐功能，例如搜索、解析播放地址和获取歌词。catalog 只是示例中这组功能的名字，不是固定平台名。

## 页面（Surface）

插件展示给用户的界面，可以是 Schema 配置抽屉、自定义网页，也可以是由宿主组件渲染的 native Surface。页面通过动作调用后台代码。

登录二维码、会员状态和个人曲库数据都由插件的页面与后台实现。账号登录适合 Web Surface；个人歌单通过 <code>playlistSections</code> 挂到宿主现有“歌单”页中的 native Surface。宿主挂载页面并提供基础服务；独立开发工作台与澜音桌面使用同一套 Surface 契约。

## 上下文（ctx）

澜音传给插件的工具对象。比如 ctx.ui 显示提示，ctx.storage 保存插件数据。它不是全局 Node.js 环境。

## 操作上下文（operation）

某一次点击或搜索的执行信息，含取消信号。收到它后向网络等调用继续传递，便于用户取消时停止工作。

## 插件、SDK、CLI、Core 和 Host

<PluginDiagram src="/plugins/v2/architecture.svg" alt="源码经 CLI 形成单文件，由 Core 校验并在 Host 中运行逻辑和界面" />

- **插件**：你编写的逻辑、可选界面、资源和 Manifest，最终交付一个 `plugin.js`。
- **SDK**：提供类型与作者辅助函数。安装 SDK 不会自动获得任何权限。
- **CLI**：提供创建、编译、调试、校验、签名；它是可选开发工具。
- **Core**：读取插件、校验数据、管理注册与调用。Core 本身不实现播放器和账号业务。
- **Host**：澜音桌面或 CLI 工作台，提供沙箱、授权、网络及接入的软件服务。

Vue/React 的生产运行代码会打入插件页面入口。用户安装插件时不需要 npm、开发服务器或编译器。也可以[手写一个 JS 文件](./runtime#手写单文件)，使用宿主提供的模块。

## 一张图回顾

<PluginDiagram src="/plugins/v2/knowledge-map.svg" alt="插件开发涉及入门、数据、界面、宿主、存储与交付" />
