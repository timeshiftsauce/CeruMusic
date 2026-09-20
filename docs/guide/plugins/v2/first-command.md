---
pageClass: plugin-v2-doc
title: 写一个命令
prev:
  text: 运行插件
  link: /guide/plugins/v2/quick-start
next:
  text: 添加搜索
  link: /guide/plugins/v2/first-search
---

# 2. 写一个命令

<PluginLessonNav :step="1" />

继续使用上一节的 `my-plugin`。这一节把模板精简成**一个命令：点击后显示问候**。你将完整替换两个文件；模板中的搜索会暂时移除，下一节再加回来。

## 写执行函数

把 `src/index.ts` 的**全部内容**替换为：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  ctx.actions.register('hello', async () => {
    await ctx.ui.notify({
      key: 'welcome',
      level: 'info',
      message: '你好，这是我的第一个澜音插件！'
    })
  })
})
```

这里有两次不同的调用：

1. 插件启动时，宿主执行 `definePlugin` 中的函数，把工具对象 `ctx` 交给你。`register` 将问候函数登记为 `hello` 动作，此时还不会显示通知。
2. 用户执行 `hello` 时，才运行登记的函数。它通过 `ctx.ui.notify` 请求宿主显示提示。

`async / await` 用来等待通知发送完成。通知的 `message` 是正文，`level` 是提示级别，`key` 是这条通知的标识。

## 声明这个命令

动作写好了，还要告诉宿主它的入口。把 `ceru.plugin.json` 的**全部内容**替换为：

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
        "activation": ["onCommand:hello"]
      }
    },
    "contributes": {
      "commands": [
        { "id": "hello", "title": "问候一次", "action": "hello" }
      ]
    },
    "permissions": []
  },
  "entries": { "logic.main": "src/index.ts" },
  "resources": {},
  "output": "dist/plugin.js"
}
```

这个文件是工程配置，其中 `manifest` 称为**插件清单**。本节关注三处连接：

| 字段 | 连接到哪里 |
| --- | --- |
| `modules.logic.entry: "logic.main"` | 在下方 `entries` 中找到 `src/index.ts`，作为后台入口 |
| `activation: ["onCommand:hello"]` | 允许宿主在执行这个命令时启动后台 |
| 命令的 `action: "hello"` | 调用代码中 `register('hello', ...)` 登记的函数 |

`title` 是显示名称，可以改成中文；`action` 必须与注册名一致。`id` 是插件身份，后面的章节保持不变。其余协议声明先原样保留。

## 执行并检查

两个文件都保存后，等工作台重新显示“运行中”。若你已关闭工作台，在工程目录重新执行 `npm run dev`。

在“能力注册”中点击 `hello` 动作，查看通知或日志，应出现：

```text
你好，这是我的第一个澜音插件！
```

再把源码里的 `message` 改成自己的问候语。保存，等待重新运行，点击动作，确认文字发生变化。

::: tip 桌面的按钮在哪里？
工作台提供直接测试动作的入口。声明 commands 不会自动在澜音桌面生成一个“问候”按钮。第四节会添加页面入口，再把按钮接到同一个 hello 动作。
:::

## 如果没有提示

- **保存后构建失败：** 看终端错误位置，检查是否完整替换了文件，JSON 中不要写注释或尾随逗号。
- **动作未注册：** 对照清单里的 `action` 与代码里的注册名，两处都应是 `hello`。
- **搜索入口不见了：** 本节的清单只声明了命令，这是预期结果。

**完成检查：** 你能改动通知文字，并说明“清单声明命令 → 调用同名动作 → 显示通知”的关系。

下一节：[添加搜索](./first-search)。
