---
pageClass: plugin-v2-doc
title: 安装到澜音
prev:
  text: 保存数据
  link: /guide/plugins/v2/first-storage
next:
  text: 开发 HTTP 音源
  link: /guide/plugins/v2/tutorial-source/
---

# 5. 安装到澜音

<PluginLessonNav :step="4" />

现在工程里有搜索、计数和一个桌面抽屉。这一节把它构建成 `dist/plugin.js`，安装到**澜音 2.0**，检查真实用户的操作入口。

如果手头只有 1.14.1，可以先完成构建和工作台预览；它使用 v1，不能安装本教程的 v2 插件。桌面步骤需要支持 v2 的 2.0 开发构建或正式版本。

## 构建并验证文件

在 `my-plugin` 目录打开终端，执行：

```shell
npm run build
npm run validate
```

build 将后台代码和 `ui/counter.json` 打包到 `dist/plugin.js`。validate 显示 `Valid Ceru v2 artifact` 时，表示清单和文件格式通过检查；是否能按预期操作，还要实际运行。

继续执行：

```shell
npm run preview
```

这次工作台加载的是成品文件。搜索“晨光”，再执行 hello，确认成品中包含你的修改。若提示端口占用，先停止之前的 dev 服务。

用户只需要安装 **dist/plugin.js 这一个文件**，无需安装 Node.js 或获取源码目录。

## 安装并启用

在澜音 2.0 中：

1. 进入**设置 → 插件管理 → 添加插件**。
2. 选择**本地导入**，点击确定，选中工程内的 `dist/plugin.js`。
3. 在“我的第一个插件”这一项点击**使用**，启用插件。

![添加插件的本地导入入口](/plugins/v2/desktop-install.png)

截图展示入口位置，插件名称以你工程中的清单为准。

## 检查两个功能

**搜索：** 在搜索页选择“我的曲库”作为来源，输入“晨光”，应看到这首演示歌曲。它仍不可播放，因为我们没有提供音频地址。

**问候计数：** 回到插件管理，在“我的第一个插件”的**更多 → 问候计数**中打开抽屉。首次安装应显示“已问候 0 次”。点击底部“问候一次”，文字应变成“已问候 1 次”，并出现通知。

关闭抽屉再打开，次数不变。退出并重新启动澜音，再打开抽屉，次数仍应保留。这里验证的是桌面的存储，数值不需要与工作台一致。

| 现象 | 检查 |
| --- | --- |
| 提示不支持的插件格式 | 确认软件是使用 v2 的澜音 2.0，导入的是 dist/plugin.js |
| 更多菜单没有问候计数 | 确认插件已启用、清单包含 settingsPages，安装的是第四节重新构建的文件 |
| 抽屉打不开 | 检查 resources 的路径、页面 ID，以及构建时是否包含 ui/counter.json |
| 次数与工作台不同 | 两个环境的数据独立，这是正常情况 |
| 安装后仍是旧行为 | 修改源码不会自动更新桌面插件，需要重新 build 并导入新产物 |

## 对照完成版

前面某一步遗漏时，可以下载[完成版工程](/plugins/v2/tutorial/ceru-first-plugin.zip)，对照这四个文件：

```text
my-plugin/
├── ceru.plugin.json
├── src/
│   ├── index.ts
│   └── catalog.ts
└── ui/
    └── counter.json
```

完成版解压后，在包含 `package.json` 的目录运行 `npm install`、`npm run dev` 即可调试。它与正文使用相同的插件 id，安装时会被识别为同一个插件。

**完成检查：** 桌面能搜索到晨光，能通过抽屉按钮问候，并在重启后保留次数。

接下来可以做[HTTP 音源项目](./tutorial-source/)，为搜索结果提供真正的播放地址；想先做设置输入框，可阅读[原生配置抽屉](./ui-schema)。
