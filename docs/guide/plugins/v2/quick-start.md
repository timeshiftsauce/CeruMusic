---
pageClass: plugin-v2-doc
title: 快速上手
description: 创建插件工程，打开开发工作台，运行第一次搜索。
prev:
  text: 简介
  link: /guide/plugins/v2/
next:
  text: 写一个命令
  link: /guide/plugins/v2/first-command
---

# 快速上手

<PluginLessonNav :step="0" />

这一节只做一件事：**把示例插件运行起来，搜索到 Morning Light**。先不用修改代码。

## 准备环境

你的电脑需要安装 **Node.js 22.12 或更高版本**。Node.js 会附带 npm，用于下载开发工具和依赖。在终端执行：

```shell
node --version
npm --version
```

两个命令都能显示版本号，就可以继续。若提示找不到命令，请先安装 Node.js，再重新打开终端。编辑器使用你熟悉的即可；下文以 VS Code 中能打开项目文件为前提。

安装插件到正式软件是最后一节的内容，到时需要澜音 **1.14.1 或更高版本**。

## 创建一个工程

在准备存放插件代码的目录中执行：

```shell
npm create ceru-plugin@0.3.5 my-plugin -- --template source --lang ts
```

命令中的 `my-plugin` 是新文件夹的名字。`source` 表示“音乐数据模板”，`ts` 表示使用 TypeScript。这里固定脚手架版本，让生成的文件和教程一致。

接着进入目录并安装依赖：

```shell
cd my-plugin
npm install
```

看到安装结束后，启动开发工具：

```shell
npm run dev
```

这会打开 **Ceru Plugin 开发工作台**。它是专门测试插件的小窗口，能让你在开发期间查看结果和日志。请保持终端运行。

::: details 没有出现窗口？
先看终端是否还在安装或下载 Electron。若命令已经报错，检查 Node.js 版本和安装日志。提示端口被占用时，关闭之前的工作台再试。其他情况见[故障排查](./troubleshooting)。
:::

## 运行第一次搜索

在工作台中找到“搜索与解析”：

1. 等待出现“运行中”和“搜索来源已就绪”。
2. 输入 **Morning**。
3. 点击 **调用搜索**。

你应该看到 **Morning Light**，下方还有插件返回的歌曲数据。

![工作台搜索 Morning 后出现 Morning Light](/plugins/v2/playground.png)

_真实 CLI 0.3.5 工作台。示例数据在你的项目源码里，不需要网络。_

再输入 `Rain` 搜索一次，应该得到 **Rainy Afternoon**。如果你已经看到这个结果，第一个插件就运行成功了。

::: tip 为什么演示歌曲不能播放？
模板只准备了歌曲名称，没有提供真实音频地址。本教程先教会你返回搜索结果；接入真实服务时，再增加[播放解析](./providers#解析播放地址)。
:::

## 打开代码

用编辑器打开 `my-plugin` 文件夹，你会看到：

```text
my-plugin/
├── ceru.plugin.json      # 插件信息与功能声明
├── src/
│   └── index.ts          # 刚才运行的搜索和问候代码
└── package.json         # dev、build 等命令
```

打开 `src/index.ts`，找到 `const tracks = [...]`。其中的 Morning、Rain 和 Night，就是刚才搜索到的数据。

这一节只需要知道代码在哪里。下一节我们从较短的 `hello` 命令开始修改。

## 动手试试

搜索 `Night`，再搜索一个不存在的名字。观察“有结果”和“没有结果”的区别。

**完成标志：** 工作台保持运行，你能搜索到 Night Walk，也能看到空搜索结果。

接下来：[写一个命令 →](./first-command)

::: details 我想直接构建，或者使用其他包管理器
构建命令是 `npm run build`，输出 `dist/plugin.js`。完整安装步骤在[最后一节](./first-release)，CLI 参数和其他工作流见[脚手架参考](./cli)。

教程统一使用 npm，避免同时引入多种命令。熟悉 pnpm/Yarn 的开发者可使用对应的安装和 scripts 命令，并保持一种锁文件。
:::
