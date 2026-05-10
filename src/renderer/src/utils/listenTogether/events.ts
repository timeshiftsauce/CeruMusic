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
  ROOM_SYNC_CONTEXT: 'room:sync-context',

  /* 播放控制 */
  CTL_PLAY: 'ctl:play',
  CTL_PAUSE: 'ctl:pause',
  CTL_SEEK: 'ctl:seek',
  CTL_CHANGE_SONG: 'ctl:change-song',
  CTL_PLAY_QUEUE_ITEM: 'ctl:play-queue-item',
  CTL_SKIP: 'ctl:skip',

  /* 点歌 */
  QUEUE_REQUEST: 'queue:request',
  QUEUE_ADD: 'queue:add',
  QUEUE_APPROVE: 'queue:approve',
  QUEUE_REJECT: 'queue:reject',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_REORDER: 'queue:reorder',

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
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const

/* ---------------- 同步算法阈值 ---------------- */

/**
 * 进度漂移阈值（秒）—— 超过此值才硬 seek，否则不动让其自然追上
 *
 * 一起听需要更紧的阈值：超过 300ms 就自动校准，避免明显前后拍。
 */
export const DRIFT_HARD_SEEK_THRESHOLD = 0.3

/** 房主/admin 进度上报间隔（毫秒） */
export const PROGRESS_REPORT_INTERVAL_MS = 1500

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
 *
 * 实测 80ms 足以覆盖快速点击；过长会感觉迟钝。
 */
export const CONTROL_DEBOUNCE_MS = 80
