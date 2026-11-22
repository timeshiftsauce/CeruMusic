---
pageClass: plugin-v3-doc
title: 用宿主组件展示原生歌单
---

# 用宿主组件展示原生歌单

> **适用读者**　想用软件原生歌单与列表的作者。**前置条件**　能加载 connected-library 模板。**学习目标**　把数据和动作交给宿主原生组件。预计 10 分钟。

如果页面需要歌单网格、歌曲列表和操作菜单，可以让 Logic 返回一个 `NativeView`。桌面会用软件自己的组件绘制，字体、主题和交互跟随宿主。需要自己排版的页面可以使用 [Vue 组件视图](./views)。

## 1. 创建能直接打开的例子

```sh
npx --yes create-ceru-plugin@3.0.0 my-library --template connected-library --lang ts
cd my-library
npm install
npm run build
npm run validate
```

按[桌面预览步骤](./quick-start)加载 `dist/plugin.js`。打开歌单里的「我的音乐库」分区，可以先看演示卡片，再从页面操作打开连接设置。模板的账号和歌单数据可以离线浏览；要播放真实歌曲，需要接入自己的播放地址。

## 2. 从页面找到负责渲染的动作

在 `ceru.plugin.json` 查找以下三处。保留模板已有的其他条目。

| 字段 | 模板中的对应关系 |
| --- | --- |
| `manifest.ui.pages` | `id: "library", view: "library", mount: "playlist-section"` 把页面挂到歌单分区 |
| `manifest.entry.views` | `id: "library", kind: "native", module: "render.library"` 选择渲染动作 |
| `manifest.provides.actions` | 声明 `render.library` 和页面上可调用的 `playlist.open` 等动作 |

原生视图的 `module` 写动作 ID。实际实现放在 `src/index.ts` 的逻辑入口中，已经由模板的 `entries` 映射。

## 3. 改成只有一组歌单的页面

在 `src/index.ts` 替换已有的 `render.library` 注册，沿用模板里的 `playlist` 和 `playlist.open`。只替换这一个注册即可。

```ts
ctx.actions.register('render.library', defineNativeView(() => ({
  type: 'page',
  description: '选择一个歌单查看曲目。',
  sections: [{
    id: 'playlists',
    title: '我的收藏',
    layout: 'grid',
    items: [playlist],
    onOpen: 'playlist.open',
  }],
})))
```

重新构建后，分区内应只显示「我的收藏」。点卡片时 `onOpen` 的动作会收到 `{ ref }`。模板先用 `assertResourceRef` 检查输入，再校验归属并调用 `ctx.ui.navigation.open({ page: 'playlist', ref })`。如需显示歌曲，把另一节的 `layout` 设为 `list`，传入歌曲并设置 `onPlay`。该动作收到 `{ ref, refs }`，前者是点击项，后者可用于建立队列。

## 4. 增加操作并检查空数据

页面顶部按钮写在 `actions`；单项菜单写在所在节的 `itemActions`，例如 `[{ label: '导入歌单', action: 'playlist.import' }]`。每个动作 ID 都要在清单声明并由 Logic 注册。列表为空时返回 `items: []`，用 `description` 提示如何添加歌单或登录。重排时保留原有节 ID，以便宿主识别同一个区块。[页面与动作完整字段](./reference#views)

## 调试一张“能看见、点不开”的卡片

先记录这张卡片所在 section 的 ID，再找对应 `onOpen`。打开动作中先检查 `input.ref` 的类型与 provider 归属；打开页面后，歌单内容还会经对应 provider 的 `playlists.get` 读取。若动作没有日志，核对清单注册；若动作已进入但曲目为空，核对账号连接与歌单 ID；若同一首歌能显示却不能播放，再看音源的 `tracks.resolve` 和播放权限。分别试一张有效歌单和一个已失效账号，以便把点击入口与数据获取问题分开。
