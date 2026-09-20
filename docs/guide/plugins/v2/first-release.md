---
pageClass: plugin-v2-doc
title: 安装与交付
prev:
  text: 保存数据
  link: /guide/plugins/v2/first-storage
next:
  text: 开发 HTTP 音源
  link: /guide/plugins/v2/tutorial-source/
---

# 安装与交付

<PluginLessonNav :step="4" />

我们的插件已经能显示问候、搜索歌曲、保存计数。这一节把它从开发工程变成**一个可以安装的 JS 文件**。

## 构建插件

在运行 dev 的终端按 `Ctrl+C` 停止开发服务，然后执行：

```shell
npm run build
```

构建成功后，在项目里找到：

```text
my-plugin/
└── dist/
    └── plugin.js   ← 用户安装这个文件
```

这一步把源码和需要的依赖整理成单文件。用户无需安装 Node.js，也不需要你的源码目录。

## 检查交付文件

先验证文件格式：

```shell
npm run validate
```

看到 `Valid Ceru v2 artifact`，说明清单与文件结构通过了检查。然后只加载成品：

```shell
npm run preview
```

再次搜索“晨光”，并执行 hello。这样可以确认你准备发给别人的文件包含了刚才的修改。

## 安装到澜音

打开澜音 **1.14.1 或更高版本**：

1. 进入设置 → 插件管理，点击**添加插件**。
2. 选择**本地导入**，点击确定，再选择你的 `dist/plugin.js`。
3. 安装后，在插件列表点击**使用**。

![澜音的添加插件与本地导入入口](/plugins/v2/desktop-install.png)

下面是安装完成后的界面示例。截图中是另一份“连接设置”演示插件；你的列表显示自己的插件名，按钮位置相同。

![安装完成后在插件列表中点击使用](/plugins/v2/desktop-plugins.png)

## 检查安装结果

选中自己的音乐来源，搜索“晨光”。结果应与工作台一致。由于还没有音频服务，不能播放仍是预期行为。

hello 是后台动作，工作台能直接调用它；桌面中要让用户点击它，需要提供相应的页面或按钮。不要把动作名称当成页面 ID。下一步的[原生抽屉教程](./ui-schema)会展示如何把动作接到按钮上，再验证桌面存储。

## 完成后的项目

如果你想检查前面有没有漏改，可以下载[完成版教程工程](/plugins/v2/tutorial/ceru-first-plugin.zip)。解压后在工程目录执行 `npm install` 和 `npm run dev`。

它包含三个演示曲目和“晨光”，hello 动作会保存计数，没有网络请求，也没有真实播放地址。工程使用公开的 SDK 与 CLI 0.3.5。

## 接下来做什么？

选择一个最接近你目标的方向继续：

- **接自己的音乐服务**：[HTTP 音源项目](./tutorial-source/)，从本机 API 做到搜索、播放和歌词。
- **连接 Navidrome**：[Navidrome 项目](./tutorial-navidrome/)，完成 Vue 登录页、令牌存储和轮询。
- **做设置页面**：[原生配置抽屉](./ui-schema)，让用户填写参数并调用动作。
- **做 Vue 或 React 页面**：[选择模板](./templates) → [页面开发](./surfaces)。
- **准备公开发布**：[发布指南](./publishing)，补上版本、许可和使用说明。

你已经走通了从创建到交付的完整过程。以后遇到具体参数，再查相应 API 参考即可。
