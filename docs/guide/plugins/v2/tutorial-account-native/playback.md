---
pageClass: plugin-v2-doc
title: 5. 导航、播放与导入
description: 加入歌曲搜索与解析，并把 Native View 动作接到队列、播放器和导入窗口。
prev:
  text: 原生歌单区块
  link: /guide/plugins/v2/tutorial-account-native/native-library
next:
  text: 验证与真实接口
  link: /guide/plugins/v2/tutorial-account-native/release
---

# 5. 导航、播放与导入

上一节已经能打开原生歌单详情，本节补齐歌曲搜索、播放地址、播放按钮和歌单导入。完成后的调用关系如下：

| 用户操作 | 后台动作或 Provider | 最终结果 |
| --- | --- | --- |
| 点击歌单 | `playlist.open` | 打开澜音原生歌单详情 |
| 点击歌曲或“播放推荐” | `tracks.play` | 替换队列并开始播放 |
| 播放器读取歌曲 | `tracks.resolve` | 返回可加载的 WAV 地址 |
| 点击“导入歌单” | `playlist.import` | 打开澜音已有导入窗口 |
| 导入窗口读取 ID | importer `getTracks` | 分页返回标准歌曲 |

本节完整替换 `provider.ts`、`native.ts` 和 Manifest，并新增本地音频服务。

## 1. 完成 Provider

完整替换 `src/provider.ts`：

<details>
<summary>src/provider.ts 完整内容</summary>

<<< ../../../../public/plugins/v2/tutorial/account-native/src/provider.ts

</details>

这个文件新增三块行为：

1. `tracks.search()` 从演示数据返回标准 `ContentEntity`；
2. `tracks.resolve()` 验证账号、资源归属和音质，再返回短期音频 URL；
3. `playlistImporters.register()` 按导入窗口给出的 `value/cursor/limit` 返回一页歌曲。

`tracks.play` 不是 Provider 方法。它先请求 `player.control` 权限，再调用：

```ts
const call = { permissionKey: 'playback', operation }
await ctx.queue.replace(items, call)
await ctx.player.play(refs[0], call)
```

`queue.replace()` 需要完整歌曲实体，队列才能立即显示标题、歌手和时长；`player.play()` 再指定第一首歌曲的 ref。用户拒绝权限时，两项服务都不应调用。

## 2. 接上 Native View 动作

完整替换 `src/native.ts`：

<details>
<summary>src/native.ts 完整内容</summary>

<<< ../../../../public/plugins/v2/tutorial/account-native/src/native.ts

</details>

宿主为不同位置生成的动作输入不同：

| Native View 位置 | 点击时的输入 |
| --- | --- |
| `sections[].onOpen` | `{ ref }` |
| `sections[].onPlay` | `{ ref, refs }` |
| `sections[].itemActions` | 固定 `input` 与当前 `{ ref }` 合并 |
| 页面顶部 `actions` | 只使用动作自己的 `input` |

因此 `tracks.play` 同时接受单个 `ref` 和一组 `refs`；`playlist.import` 从当前卡片取得完整歌单 ref，再把 `ref.id` 填入导入窗口。

## 3. 使用最终入口

完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createAccount } from './account'
import { registerNative } from './native'
import { createCatalog, registerProvider } from './provider'

export default definePlugin(async (ctx) => {
  const account = await createAccount(ctx)
  const catalog = createCatalog(ctx, account)

  registerProvider(ctx, account, catalog)
  registerNative(ctx, account, catalog)
})
```

## 4. 完成 Manifest

完整替换 `ceru.plugin.json`：

<details>
<summary>ceru.plugin.json 完整内容</summary>

<<< ../../../../public/plugins/v2/tutorial/account-native/ceru.plugin.json

</details>

这里同时完成四项声明：

- Provider 协议增加 `music.search@1` 和 `music.resolve@1`；
- Native View 用到的每个动作都进入 `commands`；
- `playlistImporters` 的 ID 与后台注册、打开窗口时的 `importerId` 一致；
- `playback` 权限把 Manifest key 映射到宿主的 `player.control`。

`qualities` 只声明本例真正接受的 `128k` 和 `320k`。平台 ID 与音质 ID 的推荐写法见[平台与音质约定](../source-conventions)，它们是协作约定，不是强制枚举。

## 5. 新增本地音频服务

在工程根目录新建 `mock-audio.mjs`：

<details>
<summary>mock-audio.mjs 完整内容</summary>

<<< ../../../../public/plugins/v2/tutorial/account-native/mock-audio.mjs{js}

</details>

在 `package.json` 的 `scripts` 中加入：

```json
"mock": "node mock-audio.mjs"
```

这个服务按歌曲 ID 生成一段有声音的 WAV。它只供本地验证，`npm run build` 不会把服务打进 `plugin.js`。

## 6. 运行本节

第一个终端启动音频服务：

```shell
npm run mock
```

看到以下地址后保持运行：

```text
Mock audio: http://127.0.0.1:43130
```

第二个终端运行插件：

```shell
npm run typecheck
npm run build
npm run dev
```

先登录演示账号，再检查：

1. 搜索 `rain` 能返回 `Soft Rain`；
2. `library · native` 显示歌单和“今日推荐”；
3. 点击歌单进入原生详情，歌曲能继续分页；
4. 点击播放时先出现 `player.control` 授权，允许后队列被替换；
5. `tracks.resolve` 返回的地址能加载 RIFF/WAVE 音频；
6. 歌单卡片的“导入歌单”打开 `tutorial-playlist` importer，`demo-favorites` 能分批返回四首歌。

常见错误：

- 搜索来源不出现：Provider 的 `protocols`、激活条件和 `providers.register()` ID 必须一致；
- 点击播放无反应：检查 `tracks.play` 是否已声明为命令，以及权限 key 是否为 `playback`；
- 授权被拒后仍修改队列：权限结果不是 `granted` 时应立即抛错；
- 播放器收到 404：确认 `npm run mock` 仍在运行且端口是 `43130`；
- 导入窗口提示 importer 不存在：三处 `tutorial-playlist` 必须同名；
- 其他插件的 ref 能被打开：所有入口都应先调用 `catalog.ownedRef()`。

下一节：[验证完成版并了解怎样替换真实接口 →](./release)
