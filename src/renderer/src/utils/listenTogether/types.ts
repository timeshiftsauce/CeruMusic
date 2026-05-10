/**
 * 一起听 (Listen Together) 类型定义 —— 与后端 src/listen-together/types.ts 一一对应
 *
 * 保持前后端类型对齐：后端改字段时这里也要跟着改。
 * 不直接 import 后端类型，因为前后端是不同的模块系统。
 */

/* ---------------- 房间类型与角色 ---------------- */

/** 房间模式 —— intimate(2人对等) / group(50人三级权限) */
export type RoomMode = 'intimate' | 'group'

/** 成员角色（仅 group 模式区分；intimate 模式所有人都视作 owner 等价） */
export type RoomRole = 'owner' | 'admin' | 'member'

/* ---------------- 核心模型 ---------------- */

/** 房间元数据 */
export interface RoomMeta {
  code: string
  mode: RoomMode
  ownerId: string
  name: string
  maxMembers: number
  createdAt: number
}

/** 成员资料缓存（昵称 + 头像） */
export interface MemberProfile {
  userId: string
  nickname: string
  avatar?: string
}

/** 完整成员视图 —— 资料 + 角色 */
export interface RoomMember extends MemberProfile {
  role: RoomRole
}

/* ---------------- 播放状态 ---------------- */

/**
 * 简化歌曲对象 —— 与后端 SongRef 对齐
 *
 * 服务器只透传不解析，客户端用 source 字段决定调用哪个音乐源 SDK 拉流。
 *
 * 哪些字段传 / 哪些不传：
 *  ✅ 传：歌曲元信息（名称/歌手/封面/专辑/歌词）—— 公共数据，所有人共享
 *  ❌ 不传：url / typeUrl —— 带签名的 user-specific 临时地址，member 必须自己重新拉
 *  ❌ 不传：_types —— 插件内部数据，跨设备不通用
 */
export interface SongRef {
  /** 歌曲唯一 ID（必需） */
  songmid: string
  /** 来源标识 'kw' / 'kg' / 'mg' 等（必需） —— member 端据此选 SDK */
  source: string
  /** 歌名 */
  name?: string
  /** 歌手 */
  singer?: string
  /** 封面 URL */
  cover?: string
  /** 时长（秒） */
  duration?: number
  /** 专辑名 */
  albumName?: string
  /** 专辑 ID */
  albumId?: string
  /** kg 源等需要的 hash 字段（拉流必需） */
  hash?: string
  /** 支持的音质类型列表 —— member 切音质用 */
  types?: string[]
  /** 歌词原始文本 —— 公共数据可以传，避免 member 重新拉歌词 */
  lrc?: string | null
  /**
   * 实际播放 URL —— host 切歌时把已解析的播放地址带过来,
   * member 直接 setUrl 跳过自己的 getSongRealUrl(节省 1-2 秒)
   *
   * 注意:URL 通常是带签名的临时地址(QQ/KG/KW/MG 都是分钟级 TTL),
   * 跨设备/跨 IP 一般可用,过期则 audio 元素会触发 error,playSong 内的
   * candidates 自动换源逻辑会兜底。
   */
  url?: string
}

/**
 * 当前播放快照 —— 同步算法的核心
 *
 * 客户端按 anchorPos / anchorAt 计算应到达的播放位置：
 *   targetPos = anchorPos + (now - anchorAt) / 1000   （isPlaying=true）
 *   targetPos = anchorPos                              （isPlaying=false）
 */
export interface PlaybackSnapshot {
  song: SongRef | null
  isPlaying: boolean
  anchorPos: number
  anchorAt: number
  /**
   * 单调递增的状态版本号 —— 由服务端在每次 commit 时自增
   *
   * 客户端只接受 seq > localSeq 的 SYNC,丢弃乱序/陈旧包。
   * 加入房间时 ROOM_STATE.current.seq 即客户端 localSeq 的初始值。
   */
  seq: number
}

/* ---------------- 队列 ---------------- */

/** 已通过审批、可被自动播放的曲目 */
export interface QueueItem {
  itemId: string
  song: SongRef
  requesterId: string
  requesterName: string
  addedAt: number
}

/** 待审批点歌请求（仅 group 模式） */
export interface PendingItem {
  reqId: string
  song: SongRef
  requesterId: string
  requesterName: string
  requestedAt: number
}

/* ---------------- 聊天消息 ---------------- */

export type ChatMsgType = 'text' | 'emoji' | 'sticker' | 'system'

export interface ChatMsg {
  id: string
  type: ChatMsgType
  content: string
  from: MemberProfile | null
  meta?: Record<string, string>
  ts: number
}

/* ---------------- 房间完整快照 ---------------- */

export interface RoomState {
  meta: RoomMeta
  members: RoomMember[]
  current: PlaybackSnapshot
  queue: QueueItem[]
  pending: PendingItem[]
  chat: ChatMsg[]
  serverTs: number
}

/* ---------------- REST 响应 ---------------- */

/** POST /create 的响应（在 RoomMeta 基础上增加分享相关字段） */
export interface CreateRoomResponse extends RoomMeta {
  shareUrl: string
  shareText: string
}

/** POST /resolve 的响应 —— 房间预览（不含成员列表，避免泄露隐私） */
export interface RoomPreview {
  code: string
  mode: RoomMode
  name: string
  ownerId: string
  maxMembers: number
  createdAt: number
}

/* ---------------- 业务错误 ---------------- */

/** 服务器通过 lt:error 事件回传的业务错误 */
export interface ServerError {
  code: string
  message: string
}
