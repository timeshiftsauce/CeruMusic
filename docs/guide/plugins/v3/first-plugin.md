---
pageClass: plugin-v3-doc
title: 2. 写一个带存储的 Vue 插件
---

# 2. 写一个带存储的 Vue 插件

> **适用读者**　第一次写 Logic 和 Vue 的作者。**前置条件**　已完成快速开始，保留 ceru-counter。**学习目标**　让计数经动作写入存储并在重启后读回。预计 15 分钟。

<PluginDiagram src="/plugins/v3/diagrams/counter.svg" alt="一次点击怎样保存到磁盘，界面发动作、逻辑读写、视图收到快照" />

继续使用上一节的 `ceru-counter` 项目。把模板换成一个计数器，点击一次加一，关掉页面或重启桌面后仍能读到以前的数据。维护一份示例源码，网页中的完整片段直接展示这份文件。

## 第一步：替换工程清单

用以下内容完整替换根目录的 `ceru.plugin.json`。文件中不要加入注释或省略 JSON 括号。

<<< @/public/plugins/v3/tutorial/counter/ceru.plugin.json{json}

沿着这几个 ID 可以找到入口：

1. `ui.pages` 声明 `counter-page`，宿主把它放在侧栏，读取 `view: "counter-view"`。
2. `entry.views` 把 `counter-view` 连接到 `view.counter` 模块。
3. 工程根级 `entries` 把 `view.counter` 指向 `src/Counter.vue`，把 `logic.main` 指向 `src/index.ts`。
4. `provides.actions` 公布动作 ID，下一步在逻辑中注册同名处理函数。

这个例子只使用自己的存储和界面，清单无需申请额外权限。正式分发自己的插件时，将 `tutorial.counter` 换成自己的稳定 ID；改 ID 会进入另一个安装和存储空间。

## 第二步：写逻辑和存储

完整替换 `src/index.ts`。

<<< @/public/plugins/v3/tutorial/counter/src/index.ts{ts}

`definePlugin` 接收宿主传入的 `ctx`。读取缺失键时 `ctx.storage.get` 返回 `null`，这里把它和无法识别的旧值都视为 0。读写放进一个短的 Promise 队列，多个视图同时发出请求时也不会覆盖对方的计数。写入成功后，用**视图 ID** `counter-view` 推送 `{ count }`。动作调用本身也会返回这个结果，其他调用者可以按需要使用。

## 第三步：写 Vue 组件

新建 `src/Counter.vue` 并粘贴：

<<< @/public/plugins/v3/tutorial/counter/src/Counter.vue{vue}

- `useAction('counter.increment')` 得到一个返回 Promise 的函数。点击后它会调用第二步的逻辑。
- `useViewState` 得到只读的响应式引用。脚本里取 `.value`，模板里可直接读取计算属性 `count`。
- `useHostComponents()` 提供 `PageHeader`，而 `Button` 由宿主提供的 TDesign 运行库加载。
- `onMounted` 让逻辑从持久存储读回数据。界面的忙碌状态防止同一按钮连续提交。

原来的 `Search.vue` 和 `Open.vue` 此时可以删除。一次尚未写齐所有文件的保存可能触发临时编译错误，文件齐全后再看最终输出。

## 沿一次点击找出没有更新的那一层

| 点击「加一」后你观察到什么 | 检查哪里 | 预期值 |
| --- | --- | --- |
| 有按钮，点击却报告找不到动作 | 比较 `Counter.vue` 的 `useAction`、清单和 Logic 注册 | 三处都是 `counter.increment` |
| Logic 返回了数值，页面没有更新 | 查看传给 `setState` 的视图 ID 和状态键 | 视图为 `counter-view`，快照为 `{ count: 数字 }` |
| 页面会加一，重进变成 0 | 看是否在写入成功后才推送快照；确认仍是同一个插件 ID | `storage.get('clicks')` 应读到上次的数值 |

## 第四步：亲手验证

1. 若之前加过搜索模板，由于本节换了插件 ID，请停用旧预览记录，再添加当前 `dist/plugin.js`。从侧栏打开「练习计数器」，应看到 `当前次数：0`。
2. 点击「加一」两次，应看到 `当前次数：2`。退出页面再回来，仍应为 2。
3. 关闭桌面后打开，使用同一用户配置、同一插件 ID 和同一开发产物路径，若预览未恢复则重新添加该文件。进入页面确认值仍为 2。
4. 把按钮文案改成「再加一」，保存后核对热重载与计数保留。

![澜音桌面中的练习计数器，保存文案后按钮变成「再加一」，次数仍为 2](/plugins/v3/tutorial/counter/desktop-preview.png)

**界面正常但一直为 0**时，先看页面错误或插件日志，再核对 `storage.set` 是否成功、`setState` 的视图 ID，以及模板是否从 `useViewState` 读到了 `count`。下一节会验证普通安装。

示例文件可分别下载：<a href="/plugins/v3/tutorial/counter/ceru.plugin.json" download>清单</a>、<a href="/plugins/v3/tutorial/counter/src/index.ts" download>Logic</a>、<a href="/plugins/v3/tutorial/counter/src/Counter.vue" download>Vue</a>、<a href="/plugins/v3/tutorial/counter/README.md" download>运行说明</a>。
