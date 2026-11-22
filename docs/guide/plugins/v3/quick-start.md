---
pageClass: plugin-v3-doc
title: 用十分钟跑起第一个插件
description: 用官方 CLI 创建 Vue 插件，把构建产物加载到澜音桌面，再改一行文案验证热重载。
---

# 用十分钟跑起第一个插件

> **适用读者**　第一次为澜音写插件的开发者<br>
> **准备**　Node.js 22.12.0 或更高版本（含 npm）、文本编辑器、支持 v3 的澜音桌面 2.5.0 测试构建<br>
> **用时**　工具就绪后预计 10 分钟；首次安装和下载依赖的时间取决于网络。

这次你会让澜音的侧栏多出一个「音源搜索」入口，再亲手修改页面上的一句话。官方模板已经包含可运行的搜索页面。练习只需要打开页面和保存文件，空曲库也能完成。

## 1. 创建完整工程

打开终端，进入准备用来存放项目的目录。先检查工具版本，再创建工程：

```sh
node --version
npm --version
npx --yes create-ceru-plugin@3.0.0 ceru-counter --template page-extension --lang ts
cd ceru-counter
npm install
```

- `create-ceru-plugin@3.0.0` 指定本教程使用的创建器版本，`ceru-counter` 是将生成的目录名。保留这个名字，下一课会继续使用同一工程。
- `--template page-extension` 选择自带侧栏页面的模板，`--lang ts` 选择 TypeScript。
- 看到 `Created` 和目录路径，说明文件已经生成。进入该目录后应能找到 `package.json`、`ceru.plugin.json` 和 `src/Search.vue`。`npm install` 为这个工程安装 CLI、SDK 和编译依赖。

如果第一条命令找不到 Node，先安装 [Node.js](https://nodejs.org/)，然后重新打开终端。Windows PowerShell 提示禁止运行 `npm.ps1` 或 `npx.ps1` 时，可以使用 `npm.cmd` 和 `npx.cmd` 执行本页相同的命令。

## 2. 找到桌面要加载的文件

在刚创建的 `ceru-counter` 目录运行：

```sh
npm run dev
```

CLI 先打印要添加的文件路径，再编译模板。**等到出现 `CERU_BUILD_READY`，再去桌面选文件。** 以下是 Windows 输出示例，工程路径已缩短：

```text
> ceru-counter@0.1.0 dev
> ceru-plugin dev

在 CeruMusic 设置 → 插件管理 → 管理设置 → 插件开发者模式 中添加此文件：D:\plugins\ceru-counter\dist\plugin.js
CERU_BUILD_READY D:\plugins\ceru-counter\dist\plugin.js
```

从你自己的终端复制 `CERU_BUILD_READY` 后面的完整路径。**保留这个终端**，它正在监听源码变化。稍后你编辑的是 `src/Search.vue`，CLI 会重新生成 `dist/plugin.js`，桌面持续读取这个成品。

## 3. 在澜音打开「音源搜索」

1. 打开澜音 **设置 → 插件管理 → 管理设置**，在「本地开发」中开启 **插件开发者模式**。
2. 点击 **添加本地 JS 文件**，选择上一步生成的 `dist/plugin.js`。预览列表应出现该文件，并带有绿色的 **v3** 标记。
3. 关闭管理设置，返回主界面，在侧栏点击 **音源搜索**。页面会显示「输入歌曲名称」搜索框，标题下方写着「搜索歌曲，或把结果加入播放队列。」。

![插件管理设置中的本地开发区。开发者模式已开启，预览列表显示 v3 和 ceru-counter/dist/plugin.js。](/plugins/v3/tutorial/quick-start/local-preview.png)

只添加你自己构建或信任的文件。预览文件与已安装插件同 ID 时，桌面会暂时停用对应的已安装插件，移除预览后恢复。

## 4. 改一句文案，观察热重载

在编辑器里打开 `src/Search.vue`，找到 `<template>` 中带有 `title="音源搜索"` 的 `PageHeader`。只把这一行替换为：

```vue
<PageHeader title="音源搜索" description="欢迎使用我的第一个澜音插件。" />
```

保存文件。终端再次出现 `CERU_BUILD_READY` 后，看刚才打开的搜索页面。标题仍是「音源搜索」，下面的说明已变为 **「欢迎使用我的第一个澜音插件。」**。当这句话出现在桌面时，你已经验证了从编辑源码、CLI 重新构建到桌面重载的完整过程。

![修改源码并保存后的澜音搜索页。「音源搜索」下方已显示新文案，搜索输入框与按钮仍在原位。](/plugins/v3/tutorial/quick-start/reloaded-search.png)

## 遇到问题，从最后成功的一步查起

| 你看到什么 | 下一步检查什么 |
| --- | --- |
| 创建成功，`npm run dev` 却提示找不到工程或命令 | 检查终端当前目录是否包含生成的 `package.json`，并确认 `npm install` 已成功结束。 |
| 终端打印了路径，文件选择框却找不到 `plugin.js` | 等本轮出现 `CERU_BUILD_READY`。如果出现 `CERU_ERROR`，先修复它后面的第一条错误，再保存。 |
| 预览列表里有文件，主界面没有侧栏入口 | 检查该行是否有 v3 标记或加载错误，展开「完整路径」，与本次终端输出核对。确认加载的是 `page-extension` 工程的产物。 |
| 能打开搜索页，保存后文案仍旧 | 确认编辑的是同一工程的 `src/Search.vue`、终端仍在运行，且保存后又出现一次构建成功提示。改过依赖后请重启 `npm run dev`。 |

暂时没有支持 v3 的桌面时，可在工程根目录按 Ctrl+C 停止监听，依次运行以下命令，先完成代码和成品校验。拿到对应桌面后从第 2 步继续，即可核对界面与热重载。

```sh
npm run typecheck
npm run build
npm run validate
```

如使用 VS Code，可打开生成的 `ceru-plugin.code-workspace`，选择 **Watch Ceru plugin** 并按 F5 启动同一套监听。继续沿用终端时，只需保持当前的 `npm run dev` 运行。

**下一步**　保留这个工程。下一课会把它改成一个可点击、能记住次数的侧栏插件，让你看到页面怎样调用 Logic、保存数据并刷新界面。[写一个带存储的 Vue 插件](./first-plugin) · [选择其他模板或查 CLI 命令](./cli) · [核对桌面版本与兼容范围](./migration)
