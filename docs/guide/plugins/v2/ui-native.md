---
pageClass: plugin-v2-doc
title: 原生内容与账号菜单
description: 用插件声明原生歌单、歌曲、账号菜单和扫码弹窗，并接入宿主播放与导航。
---

# 原生内容与账号菜单

需要 SDK、Core、Issuer、CLI **0.3.5** 契约，以及支持 native Surface 与 <code>playlistSections</code> 的澜音版本。插件提供数据、动作和渲染声明，澜音在现有“歌单”页使用自己的 Vue 组件显示歌单网格、歌曲列表和按钮。歌单详情、导入对话框、播放队列和底部播放器继续使用软件原有功能。

账号验证、网络请求、Cookie、会员判断和平台数据转换属于插件。宿主只处理通用协议，不根据插件名称或平台名称插入业务逻辑。

::: tip 想从空目录跟着做？
请直接进入[账号与原生音乐库项目教程](./tutorial-account-native/)。它包含正式脚手架命令、完整 Manifest、Vue 登录代码、Native View、Provider 分页、播放与导入，以及可下载的已校验工程。本页作为 API 速查。
:::

## 选择页面类型

| 类型     | 用途                                   | entry 指向           |
| -------- | -------------------------------------- | -------------------- |
| `native` | 与软件一致的歌单、歌曲和操作按钮       | 已声明的 render 动作 |
| `schema` | 由软件提供控件的配置表单               | JSON 资源            |
| `web`    | 插件自行实现的 Vue / React / HTML 页面 | 打包后的页面模块     |

native Surface 不创建 iframe 或 webview，也不在宿主 Vue 实例中执行插件组件。自定义账号扫码页面可以继续选择 Web Surface；同一个插件可以组合三种类型。

## 声明原生页面

在 `ceru.plugin.json` 的 manifest 中声明 Surface、动作和“歌单”页区块：

```json
{
  "modules": {
    "logic": { "entry": "logic.main" },
    "surfaces": [{ "id": "library", "kind": "native", "entry": "render.library" }]
  },
  "contributes": {
    "commands": [
      { "id": "render.library", "action": "render.library", "title": "我的歌单" },
      { "id": "playlist.open", "action": "playlist.open", "title": "打开歌单" }
    ],
    "playlistSections": [{ "id": "library", "title": "账号歌单", "view": "library", "order": 20 }]
  }
}
```

原生区块不需要额外的 Web entries，也不需要 drawer presentation。Host 打开现有“歌单”页时自动挂载它。将以下逻辑合入插件的 `activate(ctx)`；示例使用标准 ContentEntity，实际数据由插件获取：

```ts
import { defineNativeView, assertResourceRef, type JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

ctx.actions.register(
  'render.library',
  defineNativeView(async () => ({
    type: 'page',
    title: '我的歌单',
    sections: [
      {
        id: 'playlists',
        layout: 'grid',
        onOpen: 'playlist.open',
        items: [
          {
            ref: {
              pluginId: 'example.music',
              providerId: 'example',
              kind: 'playlist',
              id: 'favorites'
            },
            title: '收藏的音乐',
            playlist: { description: '最近常听', trackCount: 12 }
          }
        ]
      }
    ]
  }))
)
ctx.actions.register('playlist.open', async (input: JsonObject) => {
  const ref = input.ref
  assertResourceRef(ref)
  await ctx.ui.navigation.open({ page: 'playlist', ref })
  return null
})
```

真实插件需要注册相应 Provider 的 `playlists.get`，这样原生详情页才能读取歌曲和后续分页。完整范例通过 `ceru-plugin init my-library --template connected-library --lang ts` 创建；交互式 CLI 也可选择此模板。

个人歌单始终放在软件现有侧边栏“歌单”页，与本地、云歌单并列。不要调用 <code>ctx.ui.openView('library')</code>，也不要添加“我的歌单”侧边栏按钮。需要从某个命令定位区块时：

```ts
await ctx.ui.navigation.open({ page: 'playlist', sectionId: 'library' })
```

<code>sectionId</code> 必须属于调用插件自己的 <code>playlistSections</code>，只能用于 <code>page: 'playlist'</code>，无需权限。

## 操作与刷新

- `actions` 声明页面按钮：`{ label, action, input?, primary? }`。
- `sections[].layout` 为 `grid` 或 `list`；`items` 使用标准 `ContentEntity[]`。
- `onOpen` 收到 `{ ref }`，可调用 `ctx.ui.navigation.open` 进入原生详情。
- `onPlay` 收到 `{ ref, refs }`；插件读取元数据后调用 `ctx.queue.replace`、`ctx.player.play`，播放控制遵守已声明权限。
- `itemActions` 声明每张卡片的更多操作；输入为固定 `input` 加当前卡片的 `ref`。例如通过 `ctx.ui.playlistImport.open` 打开原生导入流程。
- 所有动作都需同时声明在 `contributes.commands` 并使用 `ctx.actions.register` 注册。
- `ctx.ui.setState('library', publicState)` 通知“歌单”页中已挂载的区块重新执行 render。render 应只读取状态；不要每次 render 都无条件发布相同状态，否则会循环刷新。
- 关闭、切页或停用会终止 Surface 会话；过期会话不能继续调用动作。使用 `operation.signal` 处理取消。

保留完整 ResourceRef 的 `pluginId`、`providerId`、`connectionId` 和 `data`，不要只传裸 ID。宿主依靠这些字段把歌单详情和播放请求交还给正确插件与账号连接。

## 账号胶囊中的子账号

插件通过 `contributes.accountItems` 扩展账号菜单，通常无需增加侧边栏项：

```json
{
  "accountItems": [
    {
      "id": "account",
      "title": "示例音乐",
      "view": "account",
      "action": "account.summary",
      "logoutAction": "account.logout"
    }
  ]
}
```

`view` 指向已声明的账号 Surface；`account.summary` 同样需要 commands 声明和动作注册，返回：

```ts
{ signedIn: true, displayName: '示例昵称', avatarUrl: 'https://example.com/avatar.png', badge: 'VIP' }
```

软件显示头像、昵称和可选标签，点击该项打开插件自己的账号页面。非会员省略 `badge`；未登录返回 `signedIn: false`。摘要中只放公开展示信息，Cookie 和令牌留在插件私有存储。登录、退出或资料变化后调用 `ctx.ui.setState('account', publicState)`，账号菜单会重新读取摘要。

账号菜单未登录时显示默认头像和“未登录”。已登录项悬停展开二级菜单，可调用已声明的 `logoutAction` 退出登录。扫码页面声明 `presentation: { kind: 'modal', size: 360 }`；Vue 在登录动作成功返回后调用 `SurfaceContext.close()` 自动关闭，逻辑端也可使用 `ctx.ui.closeView(surfaceId)`。

0.3.5 Web Surface 会自动上报内容高度。Vue 根元素使用自然高度，不要设置 <code>height/min-height: 100vh</code>。网易云扫码页面可保持约 360×330，登录摘要约 360×154，状态切换时由宿主自动调整容器。

## 同一音源的多个实现

平台 ID 表示音源，不表示插件身份。例如网易云账号插件的 Provider ID 仍然是 `wy`，插件自身 ID 可以是 `ceru.netease-account`。多个插件提供 `wy` 时，软件只显示一个 `wy` 音源，并按音源/能力选择唯一实现。无需为了账号功能另造音源 ID。

由具体插件返回的 ResourceRef 仍保留该插件的身份。导入的私有歌单、连接数据和后续播放不会因为全局默认音源变化而被发送给另一个插件。

## 宿主集成时的数据传递

原生 render 的结果和动作参数必须能跨进程传递。Electron 无法克隆 Vue 的响应式 Proxy：如果把整个 NativeView 放进深层 `ref()`，再将其中的 `item.ref` 传给 IPC，点击歌单或播放歌曲时会出现 `An object could not be cloned`。

Vue 宿主可以用 `shallowRef<NativeView>()` 保存每次 render 返回的完整快照，刷新时替换快照，保留资源和动作参数为普通数据。自定义页面也应向桥接接口传递普通的 JSON 数据；DOM、函数和响应式代理不属于协议参数。

测试时除了检查页面外观，还应让模拟 IPC 对动作参数执行 `structuredClone`，覆盖歌单点击、卡片操作、单曲播放和播放全部；最后在实际 Electron 宿主中确认详情跳转和歌曲加载。
