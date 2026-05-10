# 一起听 · 接口对接文档（开发者向）

> 本文档面向**第三方客户端 / 二次开发者**。如果你只是用澜音客户端听歌，去看 [一起听使用指南](./used/listen-together)。

## 一、接口总览

一起听由两部分接口组成:

| 类型      | 协议      | 路径                                  | 鉴权                   | 用途                                                |
| --------- | --------- | ------------------------------------- | ---------------------- | --------------------------------------------------- |
| REST      | HTTPS     | `/api/listen-together/*`              | Logto access token     | 房间生命周期(创建 / 解析口令 / 查预览 / 查我的房间) |
| WebSocket | Socket.IO | namespace `/lt`(挂在根,**不带 /api**) | handshake `auth.token` | 实时事件(进出房间 / 播放控制 / 队列 / 角色 / 聊天)  |

完整 Swagger 文档:

- REST 部分: <https://api.ceru.shiqianjiang.cn/api-docs/#/listen-together>
- **WebSocket 部分**: <https://api.ceru.shiqianjiang.cn/api-docs/#/listen-together%20%C2%B7%20WebSocket>(也展示在 Swagger UI 里,但路径都是 410 Gone —— **不要直接 HTTP 调用**,只是借 OpenAPI 的壳子展示 payload schema)

> Swagger 不原生支持 WebSocket,如果以后有 AsyncAPI 客户端需求会迁移过去。

## 二、鉴权

REST 和 WebSocket 用同一份 Logto access token,resource 必须是 **生产环境的** API 地址(无论你连的是 dev 还是 prod 后端):

```text
https://api.ceru.shiqianjiang.cn/api
```

**REST**: HTTP header `Authorization: Bearer <token>`(部分公开端点除外,详见后面)

**WebSocket**: socket.io handshake auth payload

```js
const sock = io('https://api.ceru.shiqianjiang.cn/lt', {
  transports: ['websocket'],
  auth: { token }
})
```

> 鉴权失败会立刻收到 `lt:error { code: 'AUTH_FAILED' }` 然后 `disconnect`。

## 三、REST 接口

### 3.1 创建房间

```http
POST /api/listen-together/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "group",
  "name": "一起摇起来",
  "maxMembers": 50
}
```

返回 `RoomMeta + shareUrl + shareText`。**注意创建后房主还没加入房间**,要紧接着 socket emit `room:join` 才算进房。

### 3.2 解析口令

```http
POST /api/listen-together/resolve
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "XTYASG"            // 或者整段分享文案,后端会从 #CODE# 中提取
}
```

返回 `RoomPreview { code, mode, name, ownerId, maxMembers, createdAt }`,房间不存在 / 过期返回 `null`。

### 3.3 公开预览（无需登录）

```http
GET /api/listen-together/{code}
```

返回 `{ code, mode, name, maxMembers, createdAt }`(不含 ownerId,避免分享落地页泄露隐私)。

### 3.4 查我的当前房间

```http
GET /api/listen-together/my/current
Authorization: Bearer <token>
```

返回 `{ code, mode, name } | null`。常用于客户端启动时检查"上次还没退的房间"。

## 四、WebSocket 事件参考

### 4.1 命名约定

- 客户端 → 服务端: `<domain>:<action>`(行为意图)
- 服务端 → 客户端: `<domain>:<state>`(状态变更)
- 错误回包统一 `lt:error { code, message }`,**不用** socket.error
- 所有客户端事件名都列在 [src/listen-together/constants.ts](https://github.com/timeshiftsauce/CeruMusic/blob/main/../ceru-backend/src/listen-together/constants.ts) 的 `ClientEvents` 常量;服务端事件在 `ServerEvents`

### 4.2 客户端 → 服务端

| 事件                  | 描述                         | payload                                                 |
| --------------------- | ---------------------------- | ------------------------------------------------------- |
| `room:join`           | 加入房间                     | `{ code: string }`                                      |
| `room:leave`          | 主动离开                     | `{}`                                                    |
| `room:resume`         | 30s 墓碑期内续连             | `{ code: string; lastSeq?: number }`                    |
| `room:sync-context`   | host 上传共享列表 / 当前播放 | `{ current?, queue?: SongRef[] }`                       |
| `ctl:play`            | 播放                         | `{ time?: number }`                                     |
| `ctl:pause`           | 暂停                         | `{ time?: number }`                                     |
| `ctl:seek`            | 拖进度                       | `{ time: number }`                                      |
| `ctl:change-song`     | 立即切歌                     | `{ song: SongRef }`                                     |
| `ctl:play-queue-item` | 跳到队列指定项               | `{ itemId: string }`                                    |
| `ctl:skip`            | 下一首(带 seq 幂等)          | `{ seq?: number }`                                      |
| `ctl:prev`            | 上一首                       | `{ seq?: number }`                                      |
| `ctl:song-ended`      | 当前歌自然播完信号           | `{ songmid?, source?, seq? }`                           |
| `queue:request`       | 普通成员点歌(进 pending)     | `{ song: SongRef }`                                     |
| `queue:add`           | admin+ 直接入队              | `{ song: SongRef }`                                     |
| `queue:approve`       | admin+ 审批通过              | `{ reqId: string }`                                     |
| `queue:reject`        | admin+ 审批拒绝              | `{ reqId: string }`                                     |
| `queue:remove`        | 删队列项                     | `{ itemId: string }`                                    |
| `role:promote`        | owner 提升管理员             | `{ userId: string }`                                    |
| `role:demote`         | owner 撤销管理员             | `{ userId: string }`                                    |
| `member:kick`         | 踢人                         | `{ userId: string }`                                    |
| `chat:send`           | 发送聊天                     | `{ type: 'text'\|'emoji'\|'sticker'; content: string }` |
| `ping`                | 时钟同步 ping                | `{ clientTs: number }`                                  |

### 4.3 服务端 → 客户端

| 事件               | 描述                                      | payload 形状                                                                           |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `room:state`       | 房间完整快照(进房 / 续连后第一时间下发)   | `{ meta, members, current, queue, pending, chat, serverTs }`                           |
| `room:dismissed`   | 房间已解散                                | `{}`                                                                                   |
| `member:join`      | 新成员加入                                | `RoomMember`                                                                           |
| `member:leave`     | 成员离开                                  | `{ userId, reason? }`                                                                  |
| `member:kicked`    | 自己被踢(只发给被踢者)                    | `{ byUser: { nickname } }`                                                             |
| `member:reconnect` | 成员墓碑期内续连成功                      | `{ userId, nickname? }`                                                                |
| `sync`             | 播放状态同步(同步算法核心)                | `PlaybackSnapshot { song, isPlaying, anchorPos, anchorAt, seq, action?, operatorId? }` |
| `queue:update`     | 队列变更                                  | `{ queue: QueueItem[] }`                                                               |
| `pending:update`   | 待审批列表变更                            | `{ pending: PendingItem[] }`                                                           |
| `role:changed`     | 角色变更                                  | `{ userId, role, reason? }`                                                            |
| `chat:msg`         | 用户聊天                                  | `ChatMsg`                                                                              |
| `chat:system`      | 系统消息(模板 key 在 content,参数在 meta) | `ChatMsg(type='system')`                                                               |
| `pong`             | ping 回包                                 | `{ clientTs, serverTs }`                                                               |
| `lt:error`         | 业务错误                                  | `{ code, message }`                                                                    |

### 4.4 错误码

`lt:error.code` 取值:

| code                | 含义                                       |
| ------------------- | ------------------------------------------ |
| `AUTH_FAILED`       | 鉴权失败(token 过期 / resource 错)         |
| `ROOM_NOT_FOUND`    | 房间不存在或已过期                         |
| `ROOM_FULL`         | 房间已满                                   |
| `ALREADY_IN_ROOM`   | 用户已在另一房间                           |
| `PERMISSION_DENIED` | 权限不足(普通成员尝试控制播放等)           |
| `INVALID_PAYLOAD`   | 入参格式错                                 |
| `NO_SONG`           | 当前房间无歌(尝试 play/pause/seek/skip 时) |
| `INTERNAL_ERROR`    | 兜底错误                                   |

## 五、同步算法说明

`sync` 事件是整套机制的核心。每条 `sync` 都带:

- `anchorPos`(锚点位置,秒) + `anchorAt`(锚点对应的服务端 ms epoch)
- `isPlaying`(逻辑播放状态)
- `seq`(单调递增版本号)

**客户端推算"现在应该在哪儿"**:

```ts
const nowServer = Date.now() + clockOffset
const elapsed = isPlaying ? Math.max((nowServer - anchorAt) / 1000, 0) : 0
const targetPos = anchorPos + elapsed
```

`clockOffset = serverTs - clientTs`(估算值),通过 `ping`/`pong` 五次取中位数得到。

**漂移处理**:

- 漂移 > 0.5s 或动作 ∈ {seek, change-song, play-queue-item, skip} → 硬 seek 对齐
- 漂移 ≤ 0.5s → 接受偏差,不打扰播放

**乱序保护**: 客户端只接受 `payload.seq > localSeq` 的 sync,丢弃旧包。

## 六、数据结构

```ts
interface SongRef {
  songmid: string
  source: 'wy' | 'tx' | 'kg' | 'mg'
  name?: string
  singer?: string
  cover?: string
  duration?: number
  albumName?: string
  albumId?: string
  hash?: string // 酷狗特有
  types?: any[]
  lrc?: string | null
}

interface RoomMember {
  userId: string
  nickname: string
  avatar?: string
  role: 'owner' | 'admin' | 'member'
}

interface PlaybackSnapshot {
  song: SongRef | null
  isPlaying: boolean
  anchorPos: number // seconds
  anchorAt: number // ms epoch
  seq: number
  action?:
    | 'play'
    | 'pause'
    | 'seek'
    | 'change-song'
    | 'play-queue-item'
    | 'skip'
    | 'prev'
    | 'song-ended'
    | 'room-sync-context'
  operatorId?: string
}

interface QueueItem {
  id: string
  song: SongRef
  addedBy: { userId; nickname; avatar? }
  ts: number
}

interface ChatMsg {
  id: string
  type: 'text' | 'emoji' | 'sticker' | 'system'
  content: string
  from: { userId; nickname; avatar? } | null
  meta?: Record<string, string> // 系统消息的模板参数
  ts: number
}
```

## 七、最小可用客户端例子

```ts
import { io } from 'socket.io-client'

const sock = io('https://api.ceru.shiqianjiang.cn/lt', {
  transports: ['websocket'],
  auth: { token: '<logto access token>' },
  reconnection: true
})

sock.on('connect', () => sock.emit('room:join', { code: 'XTYASG' }))

sock.on('room:state', (state) => {
  console.log('已加入', state.meta.name, '当前歌:', state.current.song?.name)
})

sock.on('sync', (snap) => {
  // 应用到本地 audio: 计算 targetPos 后对齐
  console.log('sync seq=', snap.seq, 'isPlaying=', snap.isPlaying)
})

sock.on('chat:msg', (msg) => {
  console.log(msg.from?.nickname, ':', msg.content)
})

sock.on('lt:error', (err) => console.warn('[lt]', err.code, err.message))

// host 控制播放
sock.emit('ctl:play', { time: 12.5 })
sock.emit('ctl:seek', { time: 60 })
sock.emit('chat:send', { type: 'text', content: 'hi 大家好' })
```

## 八、运维 / 限制

- **房间 TTL**: 30 分钟无活动自动清理(任何 emit 都会续期)
- **聊天历史**: Redis 环形缓冲 100 条,超出自动覆盖最早
- **审计日志**: 所有事件都进 `room_audit_log` 表,默认保留 90 天(`AUDIT_LOG_RETENTION_DAYS` 环境变量可调)
- **PM2 cluster 友好**: WebSocket 通过 Redis pub/sub 跨 worker 同步,审计 flush 走 Redis Stream + leader 锁单点写库

## 九、相关文档

- [一起听使用指南(用户向)](./used/listen-together)
- [Scheme URL](./used/scheme-url) — `cerumusic://lt/<code>` 落地协议
- [澜音 后端 API 总览](./api)
