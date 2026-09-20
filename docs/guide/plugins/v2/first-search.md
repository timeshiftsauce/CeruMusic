---
pageClass: plugin-v2-doc
title: 添加搜索
prev:
  text: 写一个命令
  link: /guide/plugins/v2/first-command
next:
  text: 保存数据
  link: /guide/plugins/v2/first-storage
---

# 3. 添加搜索

<PluginLessonNav :step="2" />

上一节的插件只有 hello 动作。这一节为同一个工程增加曲库：**输入“晨光”，返回一首歌**。

用户在澜音里搜索时，软件会调用插件提供的搜索函数。承接这类音乐功能的对象叫 **Provider（数据提供者）**，我们给它起名为 `catalog`。

## 新建搜索文件

在 `src` 下新建 `catalog.ts`，写入下面的完整代码。把搜索放在独立文件里，之后修改问候功能时就不用再动它。

```ts [src/catalog.ts]
import type { PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

const tracks = [
  { id: 'morning', title: 'Morning Light', artist: 'Ceru Demo' },
  { id: 'rain', title: 'Rainy Afternoon', artist: 'Ceru Demo' },
  { id: 'night', title: 'Night Walk', artist: 'Ceru Demo' },
  { id: 'sunrise', title: '晨光', artist: '我的曲库' }
]

export function registerCatalog(ctx: PluginContext) {
  ctx.providers.register('catalog', {
    tracks: {
      async search(request) {
        const query = request.query.trim().toLowerCase()
        const matches = tracks.filter((track) =>
          (track.title + ' ' + track.artist).toLowerCase().includes(query)
        )
        const limit = Math.max(1, Math.min(request.limit, 100))

        return {
          items: matches.slice(0, limit).map((track) => ({
            ref: {
              pluginId: ctx.plugin.id,
              providerId: 'catalog',
              kind: 'track',
              id: track.id
            },
            title: track.title,
            subtitle: track.artist,
            playable: false,
            metadata: { artists: [track.artist] },
            capabilities: []
          }))
        }
      },
      async resolve() {
        return ctx.playback.failure({
          code: 'UNSUPPORTED',
          message: '演示曲库只有歌曲信息，尚未提供音频地址。'
        })
      }
    }
  })
}
```

`PluginContext` 是 `ctx` 的 TypeScript 类型，让编辑器知道它有哪些方法。`registerCatalog` 是我们自己写的普通函数，需要在插件入口中调用才会注册搜索功能。

## 在插件启动时注册

把 `src/index.ts` 的全部内容替换为下方代码。它保留了上一节的问候，多了导入和调用 `registerCatalog` 两行：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { registerCatalog } from './catalog'

export default definePlugin(async (ctx) => {
  ctx.actions.register('hello', async () => {
    await ctx.ui.notify({
      key: 'welcome',
      level: 'info',
      message: '你好，这是我的第一个澜音插件！'
    })
  })

  registerCatalog(ctx)
})
```

## 让宿主发现曲库

与上一节的命令一样，Provider 也需要清单声明。把 `ceru.plugin.json` 的全部内容替换为：

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
      }
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
      ]
    },
    "permissions": []
  },
  "entries": { "logic.main": "src/index.ts" },
  "resources": {},
  "output": "dist/plugin.js"
}
```

与上一节相比，只增加了 `onProvider:catalog` 和 `providers` 声明。清单中的 Provider `id`、代码里的注册名和歌曲 `ref.providerId` 都是 `catalog`，必须对应。

`music.search@1` 声明提供歌曲搜索；`music.resolve@1` 声明处理播放地址请求。本例的 resolve 明确返回“不支持”，等接入真实音频服务时再实现它。

## 搜索函数怎样得到结果？

以搜索“晨光”为例，执行顺序是：

1. 宿主调用 `search`，把输入放在 `request.query` 中。
2. `filter` 筛选歌名或歌手包含关键词的记录。
3. `slice` 限制返回数量，`map` 将记录转换为标准歌曲格式。
4. 返回 `{ items: [...] }`，宿主读取 items 并显示歌曲。

返回的每首歌有两类信息：`title`、`subtitle` 等用于显示；`ref` 标识“哪个插件、哪个 Provider、哪首歌”。以后请求播放或歌词时，就靠 ref 找回这首歌。歌曲 `id` 应保持稳定且不重复。

## 验证搜索

保存三个文件，等工作台重新运行。在“搜索与解析”中依次测试：

| 输入 | 应返回 |
| --- | --- |
| `晨光` | 晨光 |
| `我的曲库` | 晨光，因为歌手也参与匹配 |
| ` MORNING ` | Morning Light，因为代码去掉了首尾空格并忽略大小写 |
| `不存在` | 空的 items 数组 |

如果没有搜索来源，检查清单有没有 providers，以及入口是否调用了 `registerCatalog(ctx)`。如果有来源却搜不到新歌，检查 `src/catalog.ts` 是否保存、工作台是否完成重新构建。

**完成检查：** 搜索“晨光”有结果，hello 仍可执行。你可以再向 tracks 加一首歌，验证自己写的数据确实进入了搜索结果。

下一节：[保存数据](./first-storage)。
