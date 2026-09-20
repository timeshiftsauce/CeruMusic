---
pageClass: plugin-v2-doc
title: 运行插件
description: 创建工程，在开发工作台运行一次搜索。
prev:
  text: 简介
  link: /guide/plugins/v2/
next:
  text: 写一个命令
  link: /guide/plugins/v2/first-command
---

# 1. 运行插件

<PluginLessonNav :step="0" />

这一节先把开发环境跑通：创建 `my-plugin`，搜索到模板里的 **Morning Light**。暂时不用修改代码。

## 准备环境

安装 **Node.js 22.12 或更高版本**和一个代码编辑器。在终端执行：

```shell
node --version
npm --version
```

两个命令都应显示版本号。若提示找不到命令，安装 Node.js 后重新打开终端。npm 随 Node.js 一起安装，用于下载插件开发工具。

前四节使用独立工作台，无需启动澜音。最后安装插件时，需要**澜音 2.0**；1.14.1 不支持本教程的 v2 插件。

## 创建工程

在准备存放代码的目录执行：

```shell
npm create ceru-plugin@latest my-plugin -- --template source --lang ts
cd my-plugin
npm install
npm run dev
```

若 npm 询问是否安装 `create-ceru-plugin`，输入 `y`。这几条命令依次创建文件夹、进入文件夹、安装依赖、启动工作台。

`source` 是音乐数据模板；`ts` 表示 TypeScript。生成的代码就在你自己的 `my-plugin` 目录中。后续命令都在这个目录执行。

`npm run dev` 会保持运行，并打开 **Ceru Plugin 开发工作台**。保留这个终端，保存源码时它会重新构建插件。

## 搜索一首歌曲

在工作台找到“搜索与解析”，等待出现“运行中”和“搜索来源已就绪”。输入 `Morning`，点击**调用搜索**，应看到 **Morning Light**。

![工作台搜索 Morning 的结果](/plugins/v2/playground.png)

再搜索 `Rain`，应得到 **Rainy Afternoon**；搜索 `不存在`，应得到空结果。

这里的数据来自模板里的数组，没有网络请求。结果中的 `playable: false` 表示它只有歌曲信息，不能播放。

## 找到刚才运行的代码

用编辑器打开整个 `my-plugin` 文件夹：

```text
my-plugin/
├── ceru.plugin.json   # 插件叫什么、有哪些功能、入口文件在哪里
├── src/
│   └── index.ts       # 问候动作和搜索函数
├── package.json      # dev、build 等命令及开发依赖
└── tsconfig.json     # TypeScript 配置
```

打开 `src/index.ts`，找到 `tracks` 数组。Morning、Rain、Night 就是刚才能搜索到的歌曲。

模板已经实现了一个搜索插件。下一节会把它精简成一个问候命令，然后由你逐步加回搜索和存储，弄清每部分代码的作用。

## 没有看到结果时

| 现象 | 检查位置 |
| --- | --- |
| 安装依赖失败 | 先看终端最后的错误；确认 Node.js 版本和下载网络 |
| 工作台没有打开 | 检查终端是否仍在下载 Electron，或是否报告启动错误 |
| 端口占用 | 关闭之前启动的工作台及开发终端，再运行 dev |
| 插件未运行或搜索来源未就绪 | 查看工作台日志和终端构建错误，确认运行命令的位置是 my-plugin |

**完成检查：** 你能搜索到 Morning Light，也能找到定义它的 `src/index.ts`。

下一节：[写一个命令](./first-command)。
