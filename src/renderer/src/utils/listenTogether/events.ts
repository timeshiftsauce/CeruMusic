/**
 * 一起听 Socket.IO 事件名常量 —— 与后端 src/listen-together/constants.ts 严格对齐
 *
 * 改这里前请同时改后端，否则前后端协议会失配。
 */

/* ---------------- 客户端 -> 服务器 ---------------- */

export const ClientEvents = {
  /* 进出房间 */
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  /** 重连续连 —— 30s 墓碑期内同 userId 回来时使用,避免重新走 join 流程 */
  ROOM_RESUME: 'room:resume',
  ROOM_SYNC_CONTEXT: 'room:sync-context',

  /* 播放控制 */
  CTL_PLAY: 'ctl:play',
  CTL_PAUSE: 'ctl:pause',
  CTL_SEEK: 'ctl:seek',
  CTL_CHANGE_SONG: 'ctl:change-song',
  CTL_PLAY_QUEUE_ITEM: 'ctl:play-queue-item',
  CTL_SKIP: 'ctl:skip',
  /** 上一首 —— 共享列表模式按当前歌位置切前一首,与 skip 对称 */
  CTL_PREV: 'ctl:prev',
  /** 当前歌曲自然播完信号 —— 仅 host/admin 上报,服务端单点裁决推进 */
  CTL_SONG_ENDED: 'ctl:song-ended',

  /* 点歌 */
  QUEUE_REQUEST: 'queue:request',
  QUEUE_ADD: 'queue:add',
  QUEUE_APPROVE: 'queue:approve',
  QUEUE_REJECT: 'queue:reject',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_REORDER: 'queue:reorder',
  /** admin+ 单项移动 patch —— 大队列(7000+)省带宽,只传 { itemId, toIndex } */
  QUEUE_MOVE: 'queue:move',

  /* 角色 / 成员 */
  ROLE_PROMOTE: 'role:promote',
  ROLE_DEMOTE: 'role:demote',
  MEMBER_KICK: 'member:kick',

  /* 聊天 */
  CHAT_SEND: 'chat:send',

  /* 时钟同步 */
  PING: 'ping'
} as const

/* ---------------- 服务器 -> 客户端 ---------------- */

export const ServerEvents = {
  ROOM_STATE: 'room:state',
  ROOM_DISMISSED: 'room:dismissed',
  MEMBER_JOIN: 'member:join',
  MEMBER_LEAVE: 'member:leave',
  MEMBER_KICKED: 'member:kicked',
  /** 墓碑期内同 userId 重连成功 */
  MEMBER_RECONNECT: 'member:reconnect',
  SYNC: 'sync',
  QUEUE_UPDATE: 'queue:update',
  PENDING_UPDATE: 'pending:update',
  ROLE_CHANGED: 'role:changed',
  CHAT_MSG: 'chat:msg',
  CHAT_SYSTEM: 'chat:system',
  PONG: 'pong',
  ERROR: 'lt:error'
} as const

/* ---------------- 业务错误码 ---------------- */

export const ErrorCodes = {
  AUTH_FAILED: 'AUTH_FAILED',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  /** 当前房间无歌可播 —— play/pause/seek/skip 等控制需要先有 song */
  NO_SONG: 'NO_SONG',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

/* ---------------- 同步算法阈值 ---------------- */

/**
 * 进度漂移阈值（秒）—— 超过此值才硬 seek，否则不动让其自然追上
 *
 * 主流派对/一起听产品都使用 0.5~1s 的容忍带:既能保证同步感受,又避免每次 SYNC
 * 到达都强制 seek 造成爆音/重新缓冲。
 */
export const DRIFT_HARD_SEEK_THRESHOLD = 1.0

/**
 * NTP 时钟同步 ping 间隔（毫秒）
 *
 * 进入房间后立即 ping 5 次（快速估算），之后每 30s 一次维持时钟偏差估算。
 */
export const PING_INTERVAL_MS = 30_000
export const PING_BURST_COUNT = 5
export const PING_BURST_INTERVAL_MS = 200

/**
 * 控制事件的去抖窗口（毫秒）—— 防止用户连点产生大量广播
 */
export const CONTROL_DEBOUNCE_MS = 80
