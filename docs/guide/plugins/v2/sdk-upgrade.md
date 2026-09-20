---
pageClass: plugin-v2-doc
title: 开发环境与依赖
---

# 开发环境与依赖

开发插件需要 **Node.js 22.12 或更高版本**。用户安装成品插件时不需要 Node.js。

## 新建工程

首次开发推荐从音乐数据模板开始：

```shell
npm create ceru-plugin@latest my-plugin -- --template source --lang ts
cd my-plugin
npm install
npm run dev
```

创建工具会生成工程配置、源码和依赖声明。跟着[入门教程](./quick-start)继续即可；需要 Vue、React 或其他起点时，查看[模板列表](./templates)。

## 工程里的开发依赖

| 依赖 | 作用 |
| --- | --- |
| `@shiqianjiang/ceru-plugin-sdk` | 提供插件 API 类型和 definePlugin 等辅助函数 |
| `@shiqianjiang/ceru-plugin-cli` | 提供 dev、build、validate、preview 命令 |

使用脚手架生成的依赖配置，并提交 `package-lock.json`，让其他人能复现同一套环境。克隆已有工程时优先执行 `npm ci` 安装锁文件记录的依赖。

Core 供宿主加载和运行插件，Issuer 用于校验、签名及发行。普通插件工程不需要手动安装这两个包。

## 检查工程

```shell
npm run build
npm run typecheck
npm run validate
npm run preview
```

build 会生成配置类型和 `dist/plugin.js`；typecheck 检查源码类型；validate 检查成品格式；preview 加载成品供你实际操作。

排查依赖问题时，用下面的命令查看工程实际安装的包：

```shell
npm ls @shiqianjiang/ceru-plugin-sdk @shiqianjiang/ceru-plugin-cli
```

软件与插件格式的对应关系见[版本与兼容](./compatibility)，命令参数见[脚手架与 CLI](./cli)。
