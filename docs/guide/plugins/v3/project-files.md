---
pageClass: plugin-v3-doc
title: 从源码找到构建产物
---

# 从源码找到构建产物

> 适合刚跑通模板的作者。准备好[快速开始](./quick-start)的工程，预计 5 分钟。目标是根据页面 ID 从桌面一路找到可编辑的文件。

## 从一个可见按钮追到处理函数

打开 `page-extension` 工程里的 `src/Search.vue`，找到搜索按钮的 `@click="submit"`。在同一文件的脚本中，`submit` 调用 `useAction('search')` 得到的函数。然后在 `src/index.ts` 搜索 `actions.register('search'`，这就是点击之后运行的逻辑。最后打开 `ceru.plugin.json`，核对 `manifest.provides.actions` 中的动作 ID。换一个显示文案只涉及 Vue；更改动作 ID 则要同步检查这三处。

| 打开哪个文件 | 要回答的问题 | 改动后的检查 |
| --- | --- | --- |
| `package.json` | `npm run dev` 实际运行哪个 CLI 子命令？ | 查看 `scripts.dev`，可在工程根目录执行 `npm run` 列出脚本 |
| `ceru.plugin.json` | 页面从哪里挂载？模块由哪个源文件构建？ | 从 `manifest.ui.pages[].view` 找同 ID 的 `entry.views`，再从其 `module` 找顶层 `entries` |
| `src/Search.vue` | 输入框、按钮、错误提示写在哪里？ | 修改说明文字，保存后等待本次构建成功 |
| `src/index.ts` | 谁拥有持久数据并调用宿主？ | 对照视图动作名检查注册，并观察插件日志 |
| `dist/plugin.js` | 桌面开发者模式选哪个文件？ | 在预览列表展开完整路径，与当前终端核对 |

## 验证你找对了入口

在搜索页修改说明文字，保留动作名。运行 `npm run build`、`npm run validate`，加载生成的文件。侧栏标题和动作仍按清单工作，内容区域显示新说明。若构建成功但桌面仍显示旧值，先看预览文件路径，再找监听终端。直接编辑成品的修改会在下次构建时被覆盖。

如希望隔离一次失败，在工程副本里暂时改错视图模块 ID，运行 `npm run build`，记录 CLI 报错指向的映射，然后还原工作副本重新构建。练习时始终保留原工程，以便对照正确的模块名。

下一步用[计数器完整工程](./first-plugin)练习同时改清单、Logic 和 View。
