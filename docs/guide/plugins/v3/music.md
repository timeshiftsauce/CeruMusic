---
pageClass: plugin-v3-doc
title: 搜索、播放与音源开发
---

# 搜索、播放与音源开发

> **适用读者**　第一次调用宿主音乐服务的作者。**前置条件**　一首可播放的本地歌曲。**学习目标**　用一次查询完成搜索、播放和入队。预计 10 分钟。

`ctx.music` 使用用户已有的音源，`ctx.providers.register` 则向宿主提供新的音源。先用本地曲库跑通一遍界面到播放器，再实现自己的 Provider。

## 实战一：搜索本地曲库并播放

```sh
npx --yes create-ceru-plugin@3.0.0 ceru-library-search --template page-extension --lang ts
cd ceru-library-search
npm install
npm run dev
```

1. 在桌面本地音乐中导入一首有权使用的音频，确认用软件自带页面能正常播放。
2. 搭建隔离测试环境时，只启用本地曲库；模板默认取第一个可用的音源。有多个音源时，先看模板选中了哪一个，或按 `item.runtime === 'host'` 筛选宿主内置源。
3. 在开发者模式添加打印的插件文件，打开「音源搜索」。在插件权限中允许读取音源，以及播放和入队。
4. 搜索刚导入的标题。点击可播放条目的曲名，然后从更多操作测试加入队列。尝试一个找不到的标题，再撤掉读取或播放权限，核对页面和操作结果。

沿着源码看每一步：

| 文件 | 读哪段 |
| --- | --- |
| `ceru.plugin.json` | 侧栏和设置复用 `search` 视图，歌单头部 Slot 挂按钮。权限键 `catalog` 对应 `music.read`，`listen` 对应 `music.control`。 |
| `src/Search.vue` | `useAction('search')` 调用逻辑，`useViewState()` 接收结果，`SongList` 绑定 play 和 enqueue 动作。 |
| `src/index.ts` | `ctx.music.sources()` 找可用源，`search` 返回分页数据。完整 `ResourceRef` 留在 Logic，给页面的每项分配临时 key。 |
| `src/Open.vue` | 触发 `open`；Logic 用 `ctx.ui.pages.open('search')` 打开清单声明的页面。 |

调用时沿用动作传入的 `operation`，让宿主知道这个调用来自哪次交互：

```ts
const result = await ctx.music.search(
  source.id,
  { query, kinds: ['track'], limit: 30, filters: {} },
  { permissionKey: 'catalog', operation },
)
```

这里的 `source.id` 取自 `ctx.music.sources()`，不要拿插件安装记录或歌曲的 `ref.id` 替代。下一页把上次的 `nextCursor` 原样传回，新查询从头开始。搜索结果更新后的旧 key 应失效，点击旧条目时提示重新选择，避免播放另一轮同位置的歌曲。只有显示所需的数据应进入视图或日志。

## 用两次查询验证结果对应关系

先搜索 A，再立刻搜索 B。如果 A 的请求较慢，在 B 之后才返回，模板会比较请求代数，只让最新的结果写入视图。模板给每个可见条目分配本次查询用的 key；点击歌曲时，Logic 再从 Map 查回原始 `ResourceRef`。以前一轮的 key 请求播放会失败，页面应提示重新选择。这样排序或分页变化后，就不会错播相同位置的另一首歌。

| 读者操作 | 应查看的结果 |
| --- | --- |
| 只允许读取，然后搜索已导入的本地曲目 | 搜索返回标题和歌手；点击播放还要满足播放授权 |
| 有多个音源时，先只启用本地源，再换到另一个可用源重试 | 确认本轮 `source.id` 指向这次启用的音源，结果归属正确 |
| 输入无结果的关键词 | 列表清空、按钮恢复可用，仍可开始下一次查询 |

当前模板取第一个可用音源。如要提供切换器，将用户选择的音源 ID 一并传给搜索动作，再用 `ctx.music.sources()` 校验仍然可用。下一步可以[注册自己的音源](./provider)，也可以[导入一份文本歌单](./importer)。
