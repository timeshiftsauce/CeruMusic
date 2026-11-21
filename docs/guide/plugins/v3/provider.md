---
pageClass: plugin-v3-doc
title: 注册音源并解析一首演示歌曲
---

# 注册音源并解析一首演示歌曲

> **适用读者**　维护音乐曲库的作者。**前置条件**　已能加载 v3 工程。**学习目标**　在搜索时返回元数据，在点播时解析地址。预计 12 分钟。

<PluginDiagram src="/plugins/v3/diagrams/source.svg" alt="搜索到的歌曲怎样交给播放器，搜索曲库、保留资源引用、点播时解析" />

```sh
npx --yes create-ceru-plugin@3.0.0 my-source --template source --lang ts
cd my-source
npm install
npm run dev
```

## 跑通搜索，再接入播放

加载终端显示的成品，在宿主搜索页选择这个音源。搜索 `Morning`，应出现 `Morning Light`，歌手为 `Ceru Demo`。模板未设试听地址时，搜索仍返回歌曲，播放能力数组为空。在 `src/index.ts` 找到三条演示数据，将第一首歌的标题改成自己的测试名称。再次搜索新标题，确认重载后由你的 Provider 返回。

| 宿主需要什么 | 在哪里实现 | 交给下一步的值 |
| --- | --- | --- |
| 可查询的音源 | 清单的 `provides.providers` 与 Logic 的 `ctx.providers.register('catalog', …)` | 两处使用相同的 Provider ID |
| 用户的一页搜索结果 | `tracks.search(request, operation)` | `items` 中的标题、艺人及稳定的 `ref`；有后续页时带 `nextCursor` |
| 当前歌曲可播放的地址 | `tracks.resolve(ref, quality, operation)` | 成功返回 `{ ok: true, url }`；无法解析时返回 `ctx.playback.failure(...)` |
| 显示歌词所需的时间轴 | `tracks.lyrics(ref, operation)` | 返回关联同一首歌曲的 `CrLyric` 文档 |

在工程的顶层 `config.previewUrl` 填入自己的试听地址，保存并等待重建。模板会给演示歌曲标上播放能力；点击刚才那首歌，核对实际音频与预期一致。这个模板对所有演示曲使用同一条试听地址。接入曲库时，在 `resolve` 内用 `ref.id` 和请求音质查询该曲目的地址，搜索阶段只返回可持久化的资源身份。

## 用三种输入自测

1. 搜索 `Rain`，检查 `Rainy Afternoon`；再搜索不存在的标题，应得到空列表。
2. 清空 `previewUrl` 重新构建，检查页面能区分“找到歌曲”和“该歌曲可播”。
3. 两首歌使用相同标题时保留不同的稳定 ID，打开其中一首，检查歌曲、歌词和音质都对应同一个引用。[资源引用与歌词](./media)

模板的三条数据足以验证接口接线。接入真实 HTTP 后，再增加跨页查询、服务拒绝、空页与快速改词取消等用例。[分页与网络请求](./network)
