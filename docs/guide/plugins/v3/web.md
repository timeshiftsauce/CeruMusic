---
pageClass: plugin-v3-doc
title: 编写隔离的 HTML 页面
---

# 编写隔离的 HTML 页面

> 面向熟悉 DOM 的前端作者。准备 CLI 3.0.0 和支持 v3 的桌面，约 8 分钟。目标是在侧栏显示一段自己设计的 HTML，并验证主题与卸载。

## 创建页面并找到挂载点

`web-surface` 模板让你用 DOM 编写界面。宿主从清单读取页面标题和打开方式；每次挂载，SDK 给这次实例传入 `ctx.root`。界面节点应当放进这个根节点。模板中的侧栏页、设置页和搜索插槽可以复用一个视图，所以每次挂载都要新建自己的节点与事件处理器。

```sh
npx --yes create-ceru-plugin@3.0.0 my-web --template web-surface --lang ts
cd my-web
npm install
npm run dev
```

在桌面添加产物，通过模板的侧栏页面打开它。找到清单 `kind: "web"` 的视图，沿 `entries` 找到 `src/view.ts`。下一段是完整的页面入口。

## 写一个跟随主题的页面

在 `src/view.ts` 中使用以下内容：

```ts
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface(ctx => {
  const heading = document.createElement('h2')
  heading.textContent = '我的曲库入口'
  heading.style.color = 'var(--td-brand-color)'
  const close = document.createElement('button')
  close.textContent = '关闭'
  close.onclick = () => { void ctx.close() }
  ctx.root.replaceChildren(heading, close)
  return () => {
    close.onclick = null
    ctx.root.replaceChildren()
  }
})
```

## 在桌面检查主题、隔离与清理

保存后再进入页面，检查标题是否更新。打开浅色和深色主题，看标题如何跟随宿主变量。关闭、重新打开后应只有一个标题和按钮。模板也可以用于插槽；测试关闭行为时从可关闭的页面或抽屉进入。

如要展示来自 Logic 的数据，请使用 `ctx.subscribe` 接收状态快照，并保存返回的解绑函数。需要调用业务动作时用 `ctx.invoke(actionId, input)`；在界面捕获失败以恢复按钮状态。普通宿主组件页面可走[Vue 桥接](./views)，若目标是自定义扫码弹窗的内部内容，按[账号教程](./accounts)传视图 ID 并保留宿主的弹窗外壳。

| 桌面上看到的现象 | 从哪里开始查 |
| --- | --- |
| 侧栏有页面，进入后仍是旧内容 | 核对 `entry.views[].module` 指向的顶层 `entries`，再看当前监听终端是否生成了新的文件 |
| 标题颜色没有随主题改变 | 在显示标题的节点检查 `--td-brand-color` 是否生效。强调色可在两种主题下保持相同；换强调色时再比较该值 |
| 改了页面按钮，外层弹窗或播放器按钮也变样 | 检查样式插入的位置和选择器。将样式保留在本次视图内部；在设置页、侧栏和插件关闭后分别核对外部按钮 |
| 第二次打开后一个点击出现两次响应 | 检查上个实例注册的事件、订阅、定时器是否在返回的清理函数内解绑 |

需要让页面和插槽的布局不同，可以在挂载时读 `ctx.mount.kind`。它为 `'slot'` 时再检查 `ctx.mount.slot`，将同一段内容缩成适合该插槽的布局。练习时从侧栏打开一次，再到模板声明的搜索插槽看一次。两个位置的内容分别挂载，更新其中一个实例持有的 DOM 不会更新另一个实例。
