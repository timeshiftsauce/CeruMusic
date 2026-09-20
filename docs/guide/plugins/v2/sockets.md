---
pageClass: plugin-v2-doc
---

# Socket.IO 与 WebSocket

`ctx.sockets` 由宿主提供连接库，插件无需打包 socket.io-client 或 ws。当前数据通道以 JSON/文本为主，不支持原生二进制帧或 Socket.IO ack 回调。

## 连接

```ts
connect(options: SocketConnectOptions): Promise<HostSocket>
```

| 参数            | 类型 / 默认                   | 说明                                                               |
| --------------- | ----------------------------- | ------------------------------------------------------------------ |
| `url`           | string，必需                  | WebSocket 使用 ws/wss；Socket.IO 使用 http/https，生产优先加密协议 |
| `kind`          | `websocket / socket.io`，必需 | 选择协议                                                           |
| `operation`     | OperationContext，必需        | 当前操作上下文                                                     |
| `permissionKey` | string，默认 `network.socket` | 必须匹配声明的 network.socket 权限 key                             |
| `path`          | string，可选                  | Socket.IO 的连接路径                                               |
| `auth`          | JSON 对象，可选               | Socket.IO 鉴权参数，最多 16 KiB 序列化数据                         |
| `reconnection`  | boolean，可选                 | Socket.IO 默认开启有限重连；WebSocket 不自动重连                   |

Manifest 声明示例：

```json
[
  {
    "key": "realtime",
    "name": "network.socket",
    "reason": "接收自建曲库的更新通知"
  }
]
```

局域网地址还需要已授予 network.private。Socket 连接不会仅因为公网 socket 权限已允许，就自动取得私网权限。

## 监听、发送与关闭

| API                     | 返回            | 说明                               |
| ----------------------- | --------------- | ---------------------------------- |
| `socket.id`             | string          | 不透明连接标识                     |
| `on<T>(event, handler)` | Disposable      | 取消订阅函数；处理函数接收 JSON 值 |
| `emit(event, data)`     | `Promise<void>` | Socket.IO 事件发送                 |
| `send(data)`            | `Promise<void>` | WebSocket 文本/JSON 发送           |
| `disconnect()`          | `Promise<void>` | 主动断开连接                       |

Socket.IO 回调收到**参数数组**，WebSocket `message` 回调收到**文本**。字符串中的 JSON 需要自行解析并校验。

```ts
import type { PluginContext, OperationContext } from '@shiqianjiang/ceru-plugin-sdk'

export async function connectUpdates(ctx: PluginContext, operation: OperationContext) {
  const socket = await ctx.sockets.connect({
    kind: 'websocket',
    url: 'wss://music.example.com/updates',
    permissionKey: 'realtime',
    operation
  })
  const off = socket.on('message', (text) => {
    ctx.log.info('收到更新', { type: typeof text })
  })
  ctx.effects.add(off)
  ctx.effects.add(() => socket.disconnect())
  await socket.send({ type: 'subscribe', topic: 'library' })
  return socket
}
```

示例地址需替换成真实服务；不要在激活函数中无条件连网，可由用户操作触发。

## 限额与重连

工作台与当前桌面使用的 SocketBroker 均有以下限制：

| 项目                   | 限制                    |
| ---------------------- | ----------------------- |
| 同一 broker 的并发连接 | 最多 8 个，连接中也计入 |
| 单消息                 | 最多 64 KiB 序列化数据  |
| 待派发事件队列         | 最多 256 条             |
| 每连接发送频率         | 每秒最多 100 条         |
| Socket.IO auth         | 最多 16 KiB             |
| 建连超时               | 10 秒                   |
| Socket.IO 重连         | 最多 5 次，延迟 1–10 秒 |
| 原生 WebSocket 重连    | 不自动重连              |

不要发送保留事件名（如 connect、disconnect、error）作为自定义 Socket.IO 事件。连接数超限、无效协议、私网未授权、超大消息和发送过快均可能失败。

重载、停用与撤销权限会关闭连接。需要恢复时等待用户操作或明确的业务重试条件，使用新连接对象；旧 ID 不可跨重载复用。
