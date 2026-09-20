---
pageClass: plugin-v2-doc
title: 开发 Vue 插件页面
---

# 开发 Vue 插件页面

插件需要登录表单、数据列表或复杂交互时，可以使用 Web Surface。它是一块由插件控制的页面区域，Vue 代码负责界面，插件逻辑负责存储和业务操作。

本页从 Vue 脚手架开始，完成一个会持久保存的计数页面。完成后你会实际用到四件事：

- `defineSurface` 挂载和卸载 Vue；
- `context.invoke()` 从页面调用后台 Action；
- Action 的返回值只回答本次调用；
- `ctx.ui.setState()` 与 `context.subscribe()` 把最新状态推给页面。

## 1. 创建工程

新建工程，不要覆盖前面教程中的 `my-plugin`：

```shell
npm create ceru-plugin@latest my-counter-page -- --template vue --lang ts
cd my-counter-page
npm install
npm run dev
```

工作台打开后，点击左侧的 `page · web`。如果能看到 Vue 示例页，说明页面编译和挂载正常。

这个工程中有两个入口：

```text
src/index.ts  插件后台：Action、Storage、公开状态
src/view.ts   页面入口：创建和销毁 Vue 应用
src/App.vue   页面组件：显示状态并响应点击
```

下面仍在这个工程中修改，不再切换到普通 DOM 示例。

## 2. 声明页面和动作

用下面内容完整替换 `ceru.plugin.json`：

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.counter-page",
    "name": "计数页面",
    "version": "0.1.0",
    "description": "用 Vue 演示页面与插件逻辑通信",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": { "entry": "logic.main" },
      "surfaces": [
        {
          "id": "counter",
          "kind": "web",
          "entry": "view.counter",
          "title": "计数页面",
          "presentation": { "kind": "drawer", "placement": "right", "size": 440 },
          "lifecycle": {
            "openAction": "counter.surface-open",
            "closeAction": "counter.surface-close"
          }
        }
      ]
    },
    "contributes": {
      "commands": [
        { "id": "counter.read", "title": "读取计数", "action": "counter.read" },
        { "id": "counter.increment", "title": "计数加一", "action": "counter.increment" },
        { "id": "counter.reset", "title": "重置计数", "action": "counter.reset" },
        {
          "id": "counter.surface-open",
          "title": "计数页已打开",
          "action": "counter.surface-open"
        },
        {
          "id": "counter.surface-close",
          "title": "计数页已关闭",
          "action": "counter.surface-close"
        }
      ],
      "settingsPages": [{ "id": "counter", "title": "计数页面", "view": "counter" }]
    },
    "permissions": [],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.counter": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

三处 ID 必须对上：`settingsPages[].view` 指向 Surface 的 `id`，Surface 的 `entry` 再指向 `entries` 中的页面入口。

页面会调用的 Action 和生命周期 Action 都必须出现在 `contributes.commands`。仅在 `src/index.ts` 注册并不算声明。

## 3. 编写后台逻辑

用下面内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  const saved = await ctx.storage.get<number>('counter')
  let count = Number.isInteger(saved) && Number(saved) >= 0 ? Number(saved) : 0
  let openedAt = 0
  let timer: ReturnType<typeof setInterval> | undefined

  const state = (status: string) => ({
    count,
    status,
    activeSeconds: openedAt ? Math.floor((Date.now() - openedAt) / 1000) : 0
  })

  const publish = async (status: string) => {
    const value = state(status)
    await ctx.ui.setState('counter', value)
    return value
  }

  ctx.actions.register('counter.read', async () => state('页面已连接'))

  ctx.actions.register('counter.increment', async () => {
    count += 1
    await ctx.storage.set('counter', count)
    return publish('计数已保存')
  })

  ctx.actions.register('counter.reset', async () => {
    count = 0
    await ctx.storage.set('counter', count)
    return publish('计数已重置')
  })

  ctx.actions.register('counter.surface-open', async () => {
    if (timer) clearInterval(timer)
    openedAt = Date.now()
    const value = await publish('页面已连接')
    timer = setInterval(() => void publish('页面已连接'), 1000)
    return value
  })

  ctx.actions.register('counter.surface-close', () => {
    if (timer) clearInterval(timer)
    timer = undefined
    openedAt = 0
    return { closed: true }
  })

  return () => {
    if (timer) clearInterval(timer)
  }
})
```

`counter.increment` 同时做了三件不同的事：Storage 保存跨重启的数据，返回值回答当前这次 `invoke`，`setState` 把新状态发给所有正在显示这个 Surface 的页面。

`surface-open` 在页面真正挂载后启动计时器，`surface-close` 在页面关闭时停止它。只有页面确实拥有轮询、Socket 或定时器时才需要关闭动作；没有资源要清理时可以不声明生命周期。

## 4. 挂载 Vue

模板已经生成 `src/view.ts`。确认它的完整内容如下：

```ts [src/view.ts]
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((ctx) => {
  const app = createApp(App, { context: ctx })
  app.mount(ctx.root)
  return () => app.unmount()
})
```

`ctx.root` 是宿主分给插件的页面区域。返回的清理函数会在页面关闭时卸载 Vue，组件的 `onBeforeUnmount` 也会随之执行。

## 5. 调用动作并订阅状态

用下面内容完整替换 `src/App.vue`：

```vue [src/App.vue]
<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { JsonObject, JsonValue, SurfaceContext } from '@shiqianjiang/ceru-plugin-sdk'

const props = defineProps<{ context: SurfaceContext }>()
const state = reactive({ count: 0, activeSeconds: 0, status: '正在连接...' })
const busy = ref(false)
const error = ref('')
let stopState: (() => void) | undefined

function applyState(value: JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const next = value as JsonObject
  if (typeof next.count === 'number') state.count = next.count
  if (typeof next.activeSeconds === 'number') state.activeSeconds = next.activeSeconds
  if (typeof next.status === 'string') state.status = next.status
}

async function run(action: 'counter.increment' | 'counter.reset' | 'counter.read') {
  busy.value = true
  error.value = ''
  try {
    const result = await props.context.invoke(action, {})
    applyState(result)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  stopState = props.context.subscribe(applyState)
  await run('counter.read')
})

onBeforeUnmount(() => stopState?.())
</script>

<template>
  <main>
    <p class="status">{{ state.status }}</p>
    <h1>持久计数器</h1>
    <p class="count">{{ state.count }}</p>
    <p class="session">本次页面已打开 {{ state.activeSeconds }} 秒</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button type="button" class="primary" :disabled="busy" @click="run('counter.increment')">
        加一
      </button>
      <button type="button" :disabled="busy || state.count === 0" @click="run('counter.reset')">
        重置
      </button>
    </div>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  background: #f4f7f5;
  color: #1d2922;
}
main {
  width: 100%;
  padding: 28px;
  font: 15px/1.5 system-ui, sans-serif;
}
.status,
.session {
  margin: 0;
  color: #5a675f;
}
h1 {
  margin: 8px 0 18px;
  font-size: 24px;
}
.count {
  margin: 0;
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  color: #207447;
}
.session {
  margin-top: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
button {
  min-width: 84px;
  padding: 9px 15px;
  border: 1px solid #bdc8c0;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
button.primary {
  border-color: #207447;
  background: #207447;
  color: #fff;
}
button:disabled {
  cursor: default;
  opacity: 0.55;
}
.error {
  color: #b42318;
}
@media (prefers-color-scheme: dark) {
  :global(body) {
    background: #19211c;
    color: #edf4ef;
  }
  .status,
  .session {
    color: #aebbb2;
  }
  .count {
    color: #69c58d;
  }
  button {
    border-color: #435047;
    background: #222c26;
  }
  button.primary {
    border-color: #55ad78;
    background: #55ad78;
    color: #102016;
  }
}
</style>
```

页面挂载时先订阅公开状态，再调用 `counter.read` 取得一次直接结果。这样两条数据通路都能独立工作：

| 通路 | 用途 | 本例 |
| --- | --- | --- |
| `invoke()` 的返回值 | 回答当前操作 | 点击“加一”后立即得到新计数 |
| `setState()` → `subscribe()` | 后台主动发布最新状态 | 每秒更新页面打开时长 |
| `storage` | 跨工作台或澜音重启保存 | 再次打开仍保留计数 |

订阅返回的函数必须在卸载时调用。页面自己创建的事件监听器、定时器和观察器也应在 `onBeforeUnmount` 中清理。

## 6. 运行结果

保存文件后，工作台会重新加载。点击 `counter · web`，应看到“持久计数器”：

1. 页面打开时长每秒增加；
2. 点击“加一”，数字和状态立即变化；
3. 关闭后重新打开，计数保留，打开时长从 0 开始；
4. 停止并重新执行 `npm run dev`，计数仍然保留。

工作台的 Storage 保存在工程的开发数据目录。需要从头验证时，使用工作台提供的清理开发数据操作，不要把 `dist` 是否存在当成存储状态。

## 7. 构建与桌面入口

```shell
npm run typecheck
npm run build
npm run validate
npm run preview
```

安装 `dist/plugin.js` 后，在澜音 2.0 的“设置 → 插件管理”中找到该插件，点击它的“计数页面”配置入口。`settingsPages` 决定这个入口，`presentation` 决定它以右侧抽屉打开。

也可以下载[完成版计数页面工程](/plugins/v2/tutorial/ceru-counter-page.zip)对照。它是本页最终代码，不是下一步必需品。

## 常见问题

**点击后提示动作未声明**

检查 `contributes.commands[].action`、`context.invoke()` 和 `ctx.actions.register()` 三处字符串是否完全一致。

**页面一直显示“正在连接”**

确认 `src/view.ts` 把 `context` 传给了 `App.vue`，并检查工作台日志中是否有后台激活错误。

**计数变化，但页面打开时长不更新**

`invoke` 的返回值已经生效，订阅通路没有生效。检查 `subscribe` 是否在挂载时执行，以及后台是否对 Surface ID `counter` 调用了 `setState`。

**页面出现大片空白或内部滚动**

不要给 `html`、`body`、`#app` 或页面根元素设置 `height: 100vh` / `min-height: 100vh`。宿主会按内容和窗口上限计算页面尺寸。

## SurfaceContext 速查

| 字段或方法 | 作用 |
| --- | --- |
| `root` | 插件可挂载内容的 HTMLElement |
| `invoke(action, input)` | 调用已声明的 Action，参数和结果必须是 JSON |
| `subscribe(handler)` | 接收该 Surface 的公开状态，返回取消订阅函数 |
| `close()` | 当前 Action 返回后关闭这个页面 |
| `mount` | 当前页面的挂载位置和模式 |
| `host / utils / icons / assets` | 环境信息、工具、宿主图标和共享资源 |

Surface 不能读取主窗口 DOM，也不能直接使用 Electron、Node 文件系统、Storage 或 HTTP。需要这些能力时，由页面 `invoke` 后台 Action。

::: details React 或普通 JavaScript
创建工程时可把模板改为 `react` 或 `web-surface`，JavaScript 项目使用 `--lang js`。通信模型不变，只有组件挂载和清理写法不同。
:::
