---
pageClass: plugin-v2-doc
title: 2. 建立最小账号入口
description: 只声明账号项和登录页面，先让账号菜单显示一条未登录账号。
prev:
  text: 创建账号插件
  link: /guide/plugins/v2/tutorial-account-native/
next:
  text: Vue 登录与账号状态
  link: /guide/plugins/v2/tutorial-account-native/login
---

# 2. 建立最小账号入口

本节接着上一节的 Vue 工程，只完成“账号菜单出现一条未登录账号”。歌单、Provider、播放和导入暂时不声明。

## 1. 替换 Manifest

用下面内容完整替换 `ceru.plugin.json`：

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.account-native",
    "name": "账号与原生歌单教程",
    "version": "0.1.0",
    "description": "演示账号菜单、Vue 登录页和原生歌单",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:account.open"]
      },
      "surfaces": [
        {
          "id": "account",
          "kind": "web",
          "entry": "view.account",
          "title": "连接演示账号",
          "presentation": { "kind": "modal", "size": 360 }
        }
      ]
    },
    "contributes": {
      "commands": [
        {
          "id": "account.open",
          "title": "连接演示账号",
          "action": "account.open",
          "view": "account"
        },
        {
          "id": "account.summary",
          "title": "读取账号摘要",
          "action": "account.summary"
        }
      ],
      "accountItems": [
        {
          "id": "demo-account",
          "title": "演示音乐账号",
          "view": "account",
          "action": "account.summary"
        }
      ]
    },
    "permissions": [],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.account": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

引用关系如下：

```text
accountItems[].view → surfaces[].id → surfaces[].entry → entries["view.account"]
accountItems[].action → commands[].action → actions.register("account.summary")
```

账号点击后打开 `account` 页面；宿主另外调用 `account.summary`，取得账号菜单可以展示的公开资料。

## 2. 返回未登录摘要

用下面内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  ctx.actions.register('account.open', () => ctx.ui.openView('account'))

  ctx.actions.register('account.summary', () => ({
    signedIn: false,
    displayName: '演示音乐账号'
  }))
})
```

`AccountSummary` 的常用字段是：

| 字段 | 作用 |
| --- | --- |
| `signedIn` | 是否已有经过验证的会话 |
| `displayName` | 账号菜单显示的名称，必须是非空字符串 |
| `avatarUrl` | 可选的 HTTP(S) 头像地址 |
| `badge` | 可选的短会员标签，例如 `VIP` 或 `SVIP` |

未登录时只返回前两个字段。不要把 Cookie、令牌、手机号或平台接口原始响应放进账号摘要。

## 3. 为什么先不声明其他能力

Manifest 是宿主可调用能力的公开清单。只声明尚未实现的 `playlist.open`、`tracks.play` 等动作，会让读者看到入口却只能得到“动作不存在”。本节只有两个动作，所以两者都能实际运行。

`accountItems` 各字段也有明确职责：

| 字段 | 作用 |
| --- | --- |
| `id` | 插件内稳定账号项 ID |
| `title` | 尚未取得摘要时的默认名称 |
| `view` | 点击账号项时打开的 Surface ID |
| `action` | 返回 `AccountSummary` 的动作 |
| `logoutAction` | 登录完成后才需要的可选退出动作 |

下一节实现退出后，再把 `logoutAction` 加回来。

## 4. 运行结果

```shell
npm run typecheck
npm run build
npm run dev
```

在工作台账号区域应看到“演示音乐账号”和未登录状态。点击后打开 `account · web`，其中仍是 Vue 模板页，这是本节的预期结果。

安装到澜音 2.0 后，账号入口位于软件账号菜单。宿主只展示 Manifest 声明的账号项，不需要插件修改主窗口 DOM。

常见错误：

- 账号项不出现：检查 `accountItems` 是否位于 `manifest.contributes`；
- 点击提示页面不存在：检查 `view`、Surface `id` 和页面 `entry` 三处；
- 摘要动作不存在：检查 `accountItems[].action`、`commands[].action` 和 `actions.register()`；
- 头像不显示：只接受可加载的 HTTP(S) 地址，本节尚未返回头像。

下一节：[把模板页改成可登录的 Vue 页面 →](./login)
