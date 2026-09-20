---
pageClass: plugin-v2-doc
title: 开发插件页面
---

# 开发插件页面

如果你想让用户点击按钮、扫码登录或浏览自己的曲库，可以给插件加一个网页。这样的插件页面叫 **Surface**。

先做一个能点击的计数器，再把按钮连接到后台动作。你熟悉 Vue 或 React 时，可以沿用这些框架。

## 先运行一个 Vue 页面

创建一个新的页面示例工程，不要覆盖前面教程的 my-plugin：

```shell
npm create ceru-plugin@0.3.5 my-plugin-page -- --template vue --lang ts
cd my-plugin-page
npm install
npm run dev
```

在工作台左侧点击 `page · web`，应看到“Vue 插件页面”。点击“计数 0”，数字变成 1。打开 `src/App.vue`，修改标题并保存，确认页面跟着变化。

本页使用正式发布的 `0.3.5` 工具链。新 Surface 声明至少需要 0.3.3，旧 0.2.x 不应直接套用新字段；版本关系见[版本与兼容](./compatibility)。

::: details 使用 React 或普通 JavaScript
把模板换成 `react` 或 `web-surface` 即可。JS 版本使用 `--lang js`。React 页面在 App.tsx/App.jsx 中，普通 DOM 页面在 view.ts/view.js 中。
:::

## 页面在哪里挂载？

模板的 `src/view.ts` 负责把 Vue 应用放到宿主提供的容器里：

```ts
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((ctx) => {
  const app = createApp(App, { context: ctx })
  app.mount(ctx.root)
  return () => app.unmount()
})
```

`ctx.root` 是你可以使用的页面区域。返回的函数在页面被销毁时清理 Vue 应用。计数器只更新这个页面里的状态，还没有调用插件后台。

## 把按钮接到后台

页面上下文没有直接的 storage 或 http。需要保存偏好、发起请求时，在后台注册一个动作，然后由页面调用它：

<PluginDiagram src="/plugins/v2/surface-actions.svg" alt="用户点击页面按钮，通过 invoke 调用后台动作，后台更新 storage 和页面 state" />

下面是一个独立的普通 DOM 小例子，演示计数如何保存在后台。可以在 web-surface 工程中使用，配套清单见下一节。

**后台 `src/index.ts`：**

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('counter.increment', async () => {
    const old = await ctx.storage.get<number>('counter')
    const count = (old ?? 0) + 1
    await ctx.storage.set('counter', count)
    await ctx.ui.setState('counter', { count })
    return { count }
  })
})
```

**页面 `src/view.ts`：**

```ts
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface((surface) => {
  const button = document.createElement('button')
  const output = document.createElement('p')
  button.textContent = '计数 +1'
  output.textContent = '点击按钮，从后台读取并保存计数'
  surface.root.append(button, output)

  const click = async () => {
    button.disabled = true
    try {
      await surface.invoke('counter.increment', null)
    } catch {
      output.textContent = '操作失败，请查看插件日志后重试'
    } finally {
      button.disabled = false
    }
  }
  button.addEventListener('click', click)
  const unsubscribe = surface.subscribe((state) => {
    output.textContent = '计数：' + String(state.count ?? 0)
  })
  return () => {
    unsubscribe()
    button.removeEventListener('click', click)
    button.remove()
    output.remove()
  }
})
```

点击按钮时，`invoke` 发出请求；后台的 `setState` 更新状态；页面的 `subscribe` 接到状态后显示数字。这样页面只负责显示，业务代码集中在后台。

## 配套清单

上面两份文件配套的完整 `ceru.plugin.json`：

也可以下载[完整计数页面工程](/plugins/v2/tutorial/ceru-counter-page.zip)，解压后执行 `npm install`、`npm run dev`，再对照下面的配置阅读。

```json
{
  "manifest": {
    "manifestVersion": 2,
    "id": "example.counter",
    "name": "计数页面",
    "version": "0.1.0",
    "engines": { "hostApi": "^2.0.0", "logicRuntime": "ceru-js@1" },
    "modules": {
      "logic": { "entry": "logic.main" },
      "surfaces": [
        {
          "id": "counter",
          "kind": "web",
          "entry": "ui.counter",
          "title": "计数页面",
          "presentation": { "kind": "drawer", "placement": "right", "size": 480 }
        }
      ]
    },
    "contributes": {
      "commands": [{ "id": "increment", "title": "计数 +1", "action": "counter.increment" }],
      "settingsPages": [{ "id": "counter", "title": "计数页面", "view": "counter" }]
    },
    "permissions": []
  },
  "entries": { "logic.main": "src/index.ts", "ui.counter": "src/view.ts" },
  "resources": {},
  "output": "dist/plugin.js"
}
```

`settingsPages.view` 与 Surface 的 `id` 对应。安装后从插件的配置入口打开 counter 页面。`presentation` 写在 Surface 声明里，不要再新增旧实验格式 `surface.<id>` 资源。

## 页面打开与关闭

需要“打开后读初始数据”或“关闭时取消轮询”，在 Surface 上声明：

```json
"lifecycle": {
  "openAction": "counter.open",
  "closeAction": "counter.close"
}
```

然后在 `contributes.commands` 中声明这两个 action，并在后台注册它们。宿主挂载完成后调用 openAction；关闭、切换或卸载页面时调用 closeAction，结束未完成的会话调用。

在 openAction 中读取初始数据并 setState。关闭动作负责取消插件自己创建的轮询、定时器等业务资源。不要认为所有定时器都会因为一个请求取消就自动停止。

::: tip 账号页面也是普通插件页面
二维码、登录轮询、会员信息和个人歌单数据由插件实现。账号页使用 Web Surface；个人歌单通过 native Surface 与 <code>playlistSections</code> 显示在宿主现有“歌单”页。宿主只提供容器和受控的基础能力，不解析平台账号业务。旧 `ceru.integrations` 专用协议已经撤回，参见[迁移说明](./desktop-extensions#旧账号区块协议已撤回)。
:::

## 页面 API 参考

| 字段或方法                      | 作用                                              |
| ------------------------------- | ------------------------------------------------- |
| `root`                          | HTMLElement，页面挂载容器                         |
| `invoke(action, input)`         | 调用已声明并注册的动作，返回 `Promise<JsonValue>` |
| `subscribe(handler)`            | 接收页面 state，返回取消订阅函数                  |
| `mount`                         | 宿主给出的挂载信息                                |
| `host / utils / icons / assets` | 环境信息、工具及共享资源                          |

页面不能读取主窗口 DOM、调用 Electron 或直接使用 Node 文件系统。动作的参数和结果使用 JSON。Vue/React 的生产运行代码会打入成品，用户不需要安装框架。

### 显示参数

`title` 是容器标题；`presentation.kind` 为 drawer 或 modal；drawer 的 placement 支持 left/right/top/bottom；size 为 280–1200 px，实际尺寸受窗口限制。这些参数只管外部容器，里面展示什么由你的页面决定。

0.3.5 起，Web Surface 会观察页面实际内容并自动调整 modal 高度。页面使用自然高度：

```css
html,
body {
  margin: 0;
}

#app {
  width: 100%;
}
```

不要给 <code>html</code>、<code>body</code>、<code>#app</code> 或页面根元素设置 <code>height: 100vh</code> / <code>min-height: 100vh</code>。否则短内容会按 iframe 视口撑满并产生空白或内部滚动。插件不需要自行调用 resize API；内容、字体或状态变化时 Core 会自动测量，CLI 与 Host 再按窗口上限显示。

### 样式与资源

保留模板的 CSS 和资源构建方式，用 `npm run preview` 验证成品。不要把宿主资源名称理解为必须支持的音乐平台。

SDK 中的 `uiExtensions` 和通用 Slot 声明不代表当前桌面已经接入所有挂载位置。具体能力查[宿主支持表](./host-services)。

## 动手试试

把“计数 +1”改成一个你想做的操作名称，找出它连接的 action。接入业务前，先让动作返回一条本地演示结果，确认页面和后台的通信走通。
