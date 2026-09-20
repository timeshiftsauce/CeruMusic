---
pageClass: plugin-v2-doc
title: 理解搜索
prev:
  text: 写一个命令
  link: /guide/plugins/v2/first-command
next:
  text: 保存数据
  link: /guide/plugins/v2/first-storage
---

# 理解搜索

<PluginLessonNav :step="2" />

这一节继续修改 `src/index.ts`，给刚才的演示曲库增加一首歌，并看懂“输入关键词后为什么会出现结果”。

## 增加一首歌

找到文件上方的 `tracks` 数组，在末尾加入一项。修改后是：

```ts
const tracks = [
  { id: 'morning', title: 'Morning Light', artist: 'Ceru Demo' },
  { id: 'rain', title: 'Rainy Afternoon', artist: 'Ceru Demo' },
  { id: 'night', title: 'Night Walk', artist: 'Ceru Demo' },
  { id: 'sunrise', title: '晨光', artist: '我的曲库' } // [!code ++]
]
```

保存后回到工作台，搜索 **晨光**。你应该看到这首新歌。再搜索 **我的曲库**，它也应出现，因为模板同时匹配歌名和歌手。

`id` 用来区分歌曲，应保持稳定且不重复；`title` 和 `artist` 是展示内容。这里仍然是你自己写在文件里的数据，没有发起网络请求。

## 关键词从哪里来？

往下找到：

```ts
ctx.providers.register('catalog', {
  tracks: {
    async search(request) {
      // 模板的搜索逻辑在这里
    }
  }
})
```

这段是帮助你定位的结构示意，**不要用它替换实际实现**。`catalog` 是这组音乐功能的名字。用户发起搜索后，宿主把关键词交给 `search` 函数，放在 `request.query` 里。

这组提供音乐功能的对象称为 **Provider（数据提供者）**。先把它理解成“澜音来取歌曲数据的地方”即可。

## 从关键词到结果

模板的搜索可以分成三步：

**第一步，整理输入。** 去掉两端空格并转换为小写，让 `Morning` 与 `morning` 都能匹配：

```ts
const query = ctx.utils.lodash.trim(request.query).toLowerCase()
```

这里的 trim 是现成的工具函数，作用与普通字符串的 `.trim()` 类似。

**第二步，筛选歌曲。** 保留歌名或歌手含有关键词的项：

```ts
const matches = tracks.filter((track) =>
  (track.title + ' ' + track.artist).toLowerCase().includes(query)
)
```

**第三步，按澜音认识的格式返回。** 原来的对象只有 id、title、artist；模板通过 map 把每项整理成：

```ts
{
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
}
```

先记住两部分：`title / metadata.artists` 告诉澜音显示什么；`ref` 告诉它“这首歌属于哪个插件、哪组功能、哪个 ID”。以后要获取歌词或播放地址时，澜音会把这个 ref 交回来。

最后，搜索返回 `{ items: [...] }`，items 中装着整理好的歌曲。模板还使用 request.limit 限制一次返回的数量。

<div class="plugin-reading-flow">
  <span><code>request.query</code><br />用户输入</span>
  <span aria-hidden="true">→</span>
  <span><code>filter</code><br />找出匹配项</span>
  <span aria-hidden="true">→</span>
  <span><code>map</code><br />整理歌曲格式</span>
  <span aria-hidden="true">→</span>
  <span><code>{ items }</code><br />返回结果</span>
</div>

::: details 为什么还不能播放晨光？
`playable: false` 表明这里只演示歌曲信息。真实播放还需要实现 `tracks.resolve`，从你有权使用的服务取得可播放地址。这属于下一阶段，详见[播放解析](./providers#解析播放地址)。
:::

## 动手试试

再加入一首你自己命名的歌曲，使用一个新的 id。分别用歌名、歌手和一个不存在的词搜索。

**完成标志：** 你能说明 request.query 从哪里来，也能指出返回值中哪部分控制歌名、哪部分标识歌曲。

接下来：[让插件记住数据 →](./first-storage)
