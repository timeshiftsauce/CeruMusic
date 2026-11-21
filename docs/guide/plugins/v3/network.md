---
pageClass: plugin-v3-doc
title: HTTP、分页与实时连接
---

# HTTP、分页与实时连接

> **适用读者**　将演示音源接入自己服务的作者。**前置条件**　有服务地址、请求契约和网络权限声明。**学习目标**　正确处理分页、取消和实时连接。预计 10 分钟。

要接入自己的曲库，先在 [source 模板](./provider)跑通本地数据，再把 `tracks.search` 中的数据来源换成服务请求。下面假设你的服务接受 `q`、`cursor` 和 `limit`，返回 `{ items, nextCursor? }`；字段名应按实际服务调整。

## 连接 HTTP 服务

在 `manifest.uses.permissions` 声明 `{ "key": "catalog-http", "name": "network.request", "reason": "按关键词搜索曲库" }`。Logic 内创建客户端：

```ts
const client = ctx.http.create({
  baseURL: 'https://music.example.org/',
  permissionKey: 'catalog-http',
  requestPermission: true,
})
```

把保留的示例域名换成自己的 HTTPS 服务。在 `tracks.search(request, operation)` 中使用 `await client.get<unknown>('tracks', { operation, query: { q: request.query, cursor: request.cursor, limit: request.limit } })`。核对响应结构，再映射成[标准歌曲条目](./media)。服务器给了下一页游标才返回 `nextCursor`。新关键词、音源或账号都从第一页开始。试一次无结果、一次超过页长的查询和一次快速连续查询。

需要读取响应状态时改用 `client.request(path, { operation, throwHttpErrors: false })`，从返回值读取 `status` 和 `data`。使用更底层的 `ctx.http.request` 时数据字段叫 `body`。表单使用 `form`，JSON 用 `json`，每个请求只选一种正文格式。公网、私网、带账号凭据的请求各自校验权限。

## 读取二进制文件的一段

在集成 core 3.0.1 的桌面宿主中，Logic 的 `ctx.http.request` 支持 `responseType: 'arraybuffer'`。适合读取文件头、索引等小块数据。省略该选项会继续自动解析 JSON 或返回文本。单次二进制响应上限为 1 MiB，整曲播放使用媒体流接口。

例如读取 MP4 文件的前 1127 字节。HTTP Range 的首尾位置都包含在结果中。将下面代码放进已有的 Logic 回调，使用该回调的 `operation` 和已获授权的文件地址 `url`。

```ts
const response = await ctx.http.request({
  url,
  permissionKey: 'catalog-http',
  headers: { Range: 'bytes=0-1126' },
  responseType: 'arraybuffer',
  operation,
})
if (response.status !== 206 ||
    !/^bytes 0-1126\/(?:\d+|\*)$/i.test(response.headers['content-range'] ?? '') ||
    !(response.body instanceof ArrayBuffer) || response.body.byteLength !== 1127) {
  throw new Error('未取得完整的 1127 字节范围响应')
}
const bytes = new Uint8Array(response.body)
```

部分服务器会忽略 Range 并返回整份文件（HTTP 200）。检查状态、Content-Range 和实际长度后再解析；老宿主返回文本时应提示升级。身份凭据、重定向和取消规则与普通 HTTP 请求相同。

## WebSocket 与 Socket.IO

在 `uses.permissions` 声明能力 `network.socket`，本例取键 `live`。用户授权后，在已有的连接动作回调中运行：

```ts
const socket = await ctx.sockets.connect({
  kind: 'websocket',
  url: 'wss://music.example.org/events',
  permissionKey: 'live',
  operation,
})
const off = socket.on('message', data => ctx.log.debug('收到曲库更新'))
ctx.effects.add(async () => {
  await off()
  await socket.disconnect()
})
```

将 URL 换成自己的 WebSocket 服务。若使用 Socket.IO，选择 `kind: 'socket.io'`、服务的 HTTP(S) 地址及正确的 `path`，使用 `emit(event, data)` 发送事件，回调收到的是事件参数数组。原生 WebSocket 接收文本消息，使用 `send`。两个协议握手方式不同，不能只改 URL 前缀。重复点击连接时应复用或先断开旧连接。

调试顺序是先确认协议和地址能连，再检查权限、事件名和载荷。切换离线或撤销授权，页面应显示连接中断并能恢复。私网或 localhost 连接还需要相应私网授权。

## 验证失败路径：给用户一次可重试的搜索

| 构造的条件 | 在 Logic 检查什么 | 界面的预期结果 |
| --- | --- | --- |
| 输入没有匹配项 | 响应有效且 `items` 为空 | 显示空列表，搜索按钮可继续使用 |
| 查询 A 很慢，查询 B 先完成 | 在写入视图状态前核对当前查询代数，或结束已取消的 operation | 只显示 B，不让 A 的迟到结果覆盖 B |
| HTTP 返回非 2xx | 使用客户端默认异常，或决定自行检查 `response.status` | 显示可操作的错误，恢复按钮 |
| 实时服务断开 | 检查协议、权限和连接句柄，释放之前注册的监听 | 重新连接后，同一个服务事件只处理一遍 |

对 `get<T>` 的 `T` 只作编译期约束。面对未知服务，读为 `unknown` 后验证 `items` 是数组、ID 和标题是字符串，再构造歌曲引用。需要带账号请求时，按[账号章节](./accounts)处理来源与凭据。
