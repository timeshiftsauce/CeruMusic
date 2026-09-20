---
pageClass: plugin-v2-doc
title: 0.3.5 工具链更新
---

# 0.3.5 工具链更新

SDK、Core、Issuer、CLI 和 create-ceru-plugin 统一使用 **0.3.5**。此版在 0.3.3 的原生内容、账号菜单、登录弹窗自动关闭、播放请求头和浏览器服务调用基础上，新增“歌单”页插件区块、区块导航定位和 Web Surface 自动内容高度。主程序也需要更新到包含这些能力的构建。

截至 **2026-09-20（Asia/Shanghai）** 本次核验，SDK、Core、Issuer、CLI 和 create-ceru-plugin 的 npm `latest` 均为 **0.3.5**，registry integrity 与下载 tarball 已通过核验。公开 create 包也已从空目录生成 `connected-library` 和 `vue` 工程，并完成安装、类型检查、构建和 validate。下面的命令可直接使用正式 registry 包。

## 安装

```shell
npm create ceru-plugin@0.3.5 my-library -- --template connected-library --lang ts
cd my-library
npm install
npm run dev
```

已有工程升级：

```shell
npm install --save-exact @shiqianjiang/ceru-plugin-sdk@0.3.5
npm install --save-dev --save-exact @shiqianjiang/ceru-plugin-cli@0.3.5
npm run typecheck
npm run build
npm run validate
```

如果测试或自建宿主直接依赖 Core、Issuer，也同步到 0.3.5。正式项目使用注册表版本，无需本地工具链目录或临时 tgz。

::: info 帮助横幅
0.3.3 CLI 的帮助横幅可能仍显示 0.2.5；0.3.4 已修复该显示。用 <code>npm ls @shiqianjiang/ceru-plugin-cli</code> 确认实际包版本。
:::

## 页面与账号

| 能力             | 用法                                                       |
| ---------------- | ---------------------------------------------------------- |
| 原生歌单和歌曲   | `kind: 'native'` + `defineNativeView`，由宿主组件渲染      |
| 现有“歌单”页区块 | `contributes.playlistSections` 引用 native Surface         |
| 定位插件区块     | `navigation.open({ page: 'playlist', sectionId })`         |
| 插件 Vue / React | `kind: 'web'`，框架打包到插件产物                          |
| 页面调用逻辑     | `SurfaceContext.invoke(action, input)`                     |
| 状态刷新         | `ctx.ui.setState(surfaceId, state)`                        |
| 登录弹窗         | `presentation: { kind: 'modal', size: 360 }`               |
| Web 页面高度     | 使用自然内容高度，避免根元素 `height/min-height: 100vh`    |
| 页面主动关闭     | 登录动作成功返回后调用 `SurfaceContext.close()`            |
| 逻辑关闭页面     | `ctx.ui.closeView(surfaceId)`                              |
| 账号胶囊菜单     | `contributes.accountItems`，摘要动作与可选 `logoutAction`  |
| 完整资源归属     | ResourceRef 保留插件、平台、连接及数据，原生详情与播放沿用 |
| 同平台实现选择   | 网易云提供者使用 `wy`，插件自身 ID 单独标识                |

完整项目教程见[账号与原生音乐库](./tutorial-account-native/)。API 摘要见[原生内容与账号菜单](./ui-native)和[Web / Vue / React](./surfaces)。平台接口、登录、Cookie 与会员判断仍在插件中，宿主提供通用渲染和服务。

升级同时修复浏览器沙箱跨线程传递 AbortSignal 的错误，保留操作取消语义；Core 的 `/guests`、`/surface`、`/surface-document` 入口均随包公开。
