---
pageClass: plugin-v2-doc
title: 保存数据
prev:
  text: 添加搜索
  link: /guide/plugins/v2/first-search
next:
  text: 安装到澜音
  link: /guide/plugins/v2/first-release
---

# 4. 保存数据

<PluginLessonNav :step="3" />

继续使用上一节的工程，保留 `src/catalog.ts`。这一节让 hello **记住问候次数**，并给它加一个桌面按钮。完成后，用户无需工作台也能操作这个功能。

## 先让 hello 记住次数

把 `src/index.ts` 的全部内容替换为：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { registerCatalog } from './catalog'

export default definePlugin(async (ctx) => {
  const readVisits = async () => (await ctx.storage.get<number>('visits')) ?? 0
  const showVisits = async (visits: number) => {
    await ctx.ui.setState('counter', { status: '已问候 ' + visits + ' 次' })
  }

  ctx.actions.register('hello', async () => {
    const visits = (await readVisits()) + 1
    await ctx.storage.set('visits', visits)
    await showVisits(visits)
    await ctx.ui.notify({
      key: 'welcome',
      level: 'info',
      message: '这是第 ' + visits + ' 次问候'
    })
  })

  registerCatalog(ctx)
  await showVisits(await readVisits())
})
```

`storage` 是插件自己的持久存储，按键名读写。`get<number>('visits')` 读取次数；还没有记录时，`?? 0` 使用零；`set('visits', visits)` 保存新值。

`showVisits` 把次数交给接下来要创建的 `counter` 页面。**存储和显示是两步：** `storage.set` 保存数据，`ui.setState` 更新界面；设置界面状态本身不会保存数据。最后一行在插件启动时读取旧次数，让页面第一次打开就有内容。

先完成下面两个文件再运行，因为代码已经引用了新页面。

## 给桌面提供按钮

在工程根目录新建 `ui` 文件夹，再新建 `ui/counter.json`，写入：

```json [ui/counter.json]
{
  "schemaVersion": "1.0",
  "presentation": { "kind": "drawer", "placement": "right", "size": 360 },
  "root": {
    "type": "form",
    "title": "问候计数",
    "submitAction": "hello",
    "submitLabel": "问候一次",
    "children": [
      { "type": "text", "bind": "status" }
    ]
  }
}
```

这是一个 **Schema 页面**：用 JSON 描述需要的控件，澜音替你画出抽屉。`bind: "status"` 显示 `setState` 传来的 status；抽屉底部的“问候一次”按钮通过 `submitAction: "hello"` 调用原来的动作。

## 将页面接到插件设置入口

把 `ceru.plugin.json` 的全部内容替换为：

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "example.first-plugin",
    "name": "我的第一个插件",
    "version": "0.1.0",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:hello", "onProvider:catalog"]
      },
      "surfaces": [
        { "id": "counter", "kind": "schema", "entry": "schema.counter" }
      ]
    },
    "contributes": {
      "commands": [
        { "id": "hello", "title": "问候一次", "action": "hello" }
      ],
      "providers": [
        {
          "id": "catalog",
          "name": "我的曲库",
          "protocols": ["music.search@1", "music.resolve@1"],
          "connectionMode": "none"
        }
      ],
      "settingsPages": [
        { "id": "counter", "title": "问候计数", "view": "counter" }
      ]
    },
    "permissions": []
  },
  "entries": { "logic.main": "src/index.ts" },
  "resources": {
    "schema.counter": { "path": "ui/counter.json", "type": "json" }
  },
  "output": "dist/plugin.js"
}
```

新增的三个位置连成一条路径：

| 字段 | 作用 |
| --- | --- |
| `settingsPages` 的 `view: "counter"` | 设置菜单的“问候计数”打开 counter 页面 |
| `surfaces` 中的 counter | 声明这个页面是 Schema，内容在 schema.counter 资源中 |
| `resources` 中的 schema.counter | 构建时读取 `ui/counter.json`，一起装入插件文件 |

页面 ID `counter` 与动作名 `hello` 各有用途：一个决定打开什么，一个决定执行什么。

## 在工作台检查存储

保存全部文件，等插件重新运行。在“能力注册”中执行 hello，等待提示出现后再点一次。

第一次测试应看到“这是第 1 次问候”，然后是“这是第 2 次问候”。如果之前已经测试过，会从已有次数继续。

在终端按 `Ctrl+C` 停止开发服务，再执行 `npm run dev`。重新点击 hello，应接着计数。工作台将数据保存在工程的 `.ceru-dev/storage` 中。

工作台用能力注册入口直接测试 hello；它的 Schema 预览不会生成桌面表单底部的提交按钮。**桌面按钮的检查放在下一节安装后进行。** 两个环境保存的数据也各自独立，安装插件不会带走开发时的次数。

::: details 次数没有保留？
确认使用的是同一个工程、相同的插件 id 和 `visits` 键名。清除 `.ceru-dev/storage` 会清掉工作台数据；修改源码或重启 dev 不需要清理它。示例的读、加一、写入不是事务，测试时请等待一次动作完成再点下一次。
:::

**完成检查：** 重启工作台后次数继续增加，搜索“晨光”仍有结果，工程里新增了 `ui/counter.json`。

下一节：[安装到澜音](./first-release)。
