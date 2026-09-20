---
pageClass: plugin-v2-doc
title: 版本与兼容
---

# 版本与兼容

安装插件时先看澜音版本，开发插件时再看工具链版本。它们不是同一个版本号。

## 本文档支持范围

| 名称         | 当前口径                                    | 决定什么                              |
| ------------ | ------------------------------------------- | ------------------------------------- |
| 澜音桌面     | **1.14.1 起**                               | 用户实际拥有的 Host 功能              |
| 插件格式     | <code>manifestVersion: 2</code>             | 清单和单文件产物的代际                |
| Host API     | <code>engines.hostApi: "^2.0.0"</code>      | 插件要求的宿主协议                    |
| 逻辑运行时   | <code>ceru-js@1</code>                      | 后台沙箱环境                          |
| UI Schema    | <code>uiSchema: "^1.0.0"</code>             | 原生声明式表单版本                    |
| 工具链       | npm registry latest **0.3.5**               | SDK 类型、Core、CLI、Issuer 与 create |
| 插件自身版本 | 例如 <code>0.1.0</code>                     | 作者独立维护的插件版本                |

## npm 发布状态

截至 **2026-09-20** 本次核验，五个包的 npm `latest`、下载 tarball 与 integrity 均已确认：

| 包                                            | npm latest | 普通插件是否直接安装     |
| --------------------------------------------- | ---------- | ------------------------ |
| <code>create-ceru-plugin</code>               | 0.3.5      | 通过 npm create 临时运行 |
| <code>@shiqianjiang/ceru-plugin-cli</code>    | 0.3.5      | 是，devDependency        |
| <code>@shiqianjiang/ceru-plugin-sdk</code>    | 0.3.5      | 是，dependency           |
| <code>@shiqianjiang/ceru-plugin-core</code>   | 0.3.5      | 通常否，Host 或测试使用  |
| <code>@shiqianjiang/ceru-plugin-issuer</code> | 0.3.5      | 通常否，签名发行端使用   |

当前完整可安装的统一版本线是 **0.3.5**。0.3.3 首次加入原生内容、账号菜单和 Surface 动作桥；0.3.4 修复 CLI/Create 版本横幅；0.3.5 在此基础上加入 <code>playlistSections</code>、歌单区块定位和 Web Surface 自动内容高度。新工程直接安装 0.3.5，已有工程同时升级 SDK 与 CLI，避免混用不同契约。

```shell
npm create ceru-plugin@0.3.5 my-plugin -- --template vue --lang ts
npm ls @shiqianjiang/ceru-plugin-cli @shiqianjiang/ceru-plugin-sdk
```

::: info 版本横幅
0.3.3 的帮助横幅可能仍写成 0.2.5。这是显示文字问题，不表示安装失败；0.3.4 已修复。始终以 <code>npm ls</code>、<code>package-lock.json</code> 和 registry 返回版本为准。
:::

## 兼容关系

| 插件或环境                    | 使用方式                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| v2 单文件插件 + 澜音 ≥1.14.1  | 在插件管理中安装；具体能力再看[宿主支持表](./host-services) |
| native / accountItems         | 0.3.3 起支持；当前用 0.3.5 开发                            |
| playlistSections + 0.3.5      | 把 native Surface 挂入现有“歌单”页，并可用 sectionId 定位   |
| Web Surface + 0.3.5           | 容器按自然内容高度调整；页面根不要使用 100vh                |
| 0.3.x Surface + 0.2.x CLI     | 契约不完整，升级 SDK 与 CLI 到同一版本                      |
| v2 单文件插件 + 旧 v1 Host    | 不能直接安装，先升级澜音                                    |
| v1 原生插件 + v2 安装器       | 不能只改版本号，按[迁移指南](./migration)重构               |
| LX 等外部脚本 + v2 Host       | 先安装对应 Guest 兼容环境，再从兼容环境导入                 |
| v2 插件 + CLI 工作台          | 可调试通用能力；真实账号和最终播放仍需桌面复验              |

旧资料继续保留：[插件 1.0 开发文档](/guide/CeruMusicPluginDev)、[旧 Host 类文档](/guide/CeruMusicPluginHost)。
