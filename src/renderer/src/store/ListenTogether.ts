/**
 * 一起听 (Listen Together) 客户端 Store
 *
 * 职责：
 *  1. 管理与 ceru-backend `/lt` 命名空间的 Socket.IO 连接（自动重连 / 鉴权）
 *  2. 维护房间状态（成员 / 队列 / pending / 聊天 / 当前播放快照）
 *  3. 暴露控制操作（play / pause / seek / 切歌 / 点歌 / 审批 / 角色 / 聊天）
 *  4. NTP 风格时钟校正 —— 估算 clockOffset 用于 sync 算法
 *  5. 双向桥接 ControlAudio：
 *     - host 端：订阅 ControlAudio 的 publish，自动广播到服务器
 *     - member 端：收到 sync 后应用到本地 ControlAudio
 *     - 用 isApplyingRemote flag 防止回声（远端 -> 本地 -> 又广播）
 *
 * 不做的事（留给 P4）：
 *  - 房间页 UI
 *  - 入口按钮（操作栏二级菜单）
 *  - cerumusic://room/{code} 协议处理（P4）
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { io as ioClient, type Socket } from 'socket.io-client'
import { MessagePlugin } from 'tdesign-vue-next'

import config from '@renderer/config'
import GlobaConfig from '@common/api/config.json'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import {
  ClientEvents,
  ServerEvents,
  ErrorCodes,
  CONTROL_DEBOUNCE_MS,
  DRIFT_HARD_SEEK_THRESHOLD,
  PROGRESS_REPORT_INTERVAL_MS,
  PING_BURST_COUNT,
  PING_BURST_INTERVAL_MS,
  PING_INTERVAL_MS
} from '@renderer/utils/listenTogether/events'
import type {
  ChatMsg,
  PendingItem,
  PlaybackSnapshot,
  QueueItem,
  RoomMember,
  RoomMeta,
  RoomRole,
  RoomState,
  ServerError,
  SongRef
} from '@renderer/utils/listenTogether/types'
import {
  createRoom as apiCreateRoom,
  resolveRoom as apiResolveRoom,
  type CreateRoomPayload
} from '@renderer/api/listenTogether'
import { useAuthStore } from '@renderer/store/Auth'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { songRefToSongList } from '@renderer/utils/listenTogether/songRef'
import type { SongList } from '@renderer/types/audio'

/* ---------------- 连接配置 ---------------- */

/**
 * 后端基础 URL —— 与 utils/request.ts 的 dev 切换逻辑保持一致
 *
 * 切换规则：`NODE_ENV=development && config.json.enableDev=true` 时走本地后端，
 * 否则走生产。Socket.IO 和 REST 同步切换，避免"REST 走本地、socket 走生产"的不一致。
 *
 * 注意：Logto access token 的 aud 永远是生产 URL（CERU_API_RESOURCE），
 *       本地后端的 .env SOURCE_URL 也配的是生产 URL，所以同一个 token 两端都能用。
 */
const PROD_BASE = 'https://api.ceru.shiqianjiang.cn'
const DEV_BASE = 'http://localhost:8000'
const isDevBackend = process.env.NODE_ENV === 'development' && Boolean(GlobaConfig.enableDev)

/**
 * Socket.IO 连接 URL —— 命名空间 `/lt` 挂在根，不带 /api 前缀
 *
 * 后端 setGlobalPrefix('api') 只影响 HTTP routes，WebSocket Gateway 的
 * namespace 直接挂 root，所以这里**没有 /api**。
 */
const SOCKET_URL = isDevBackend ? DEV_BASE : PROD_BASE

/** Logto resource indicator —— 必须与 token aud 一致，永远用生产 URL */
const CERU_API_RESOURCE = 'https://api.ceru.shiqianjiang.cn/api'

/**
 * 一起听 Pinia Store
 *
 * 用 setup-style（非 options-style）：
 *  - 内部状态可保留闭包（socket / pingTimer / unsubFns 不需要响应式）
 *  - getter 用 computed 自然衔接 Vue 响应式
 */
export const useListenTogetherStore = defineStore('listenTogether', () => {
  /* ============================================================
   *  响应式状态
   * ============================================================ */

  /** Socket 连接状态 —— 用于 UI 显示 */
  const connectionStatus = ref<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('idle')

  /** 当前所在房间元数据 —— null 表示不在任何房间 */
  const meta = ref<RoomMeta | null>(null)

  /** 当前用户的角色（仅在房间内有效） */
  const myRole = ref<RoomRole | null>(null)

  /** 我自己的 userId —— 从 logto token sub 取，加入房间后填充 */
  const myUserId = ref<string>('')

  /** 房间成员列表 */
  const members = ref<RoomMember[]>([])

  /** 已通过审批的播放队列 */
  const queue = ref<QueueItem[]>([])

  /** 待审批点歌列表 —— 普通成员看到的也是同一份（透明），仅 admin+ 能操作 */
  const pending = ref<PendingItem[]>([])

  /** 聊天消息历史 —— 加入时拉取最近 100 条，运行时持续追加 */
  const chat = ref<ChatMsg[]>([])

  /**
   * 一起听浮层是否展开 —— 由 UI 层切换，store 仅维护状态
   *
   * 设计：一起听浮层叠加在 FullPlay 全屏播放器内部（参考 CommentsOverlay 的模式），
   * 不另开页面、不挡住底部播放器。打开浮层时若 FullPlay 没展开，PlayMusic 监听此
   * 状态自动展开 FullPlay。关闭浮层只是隐藏 UI，不会离开房间。
   */
  const overlayVisible = ref(false)

  /** 当前播放快照 —— 由服务器广播的 sync 决定 */
  const current = reactive<PlaybackSnapshot>({
    song: null,
    isPlaying: false,
    anchorPos: 0,
    anchorAt: 0
  })

  /* ============================================================
   *  Getters（computed）
   * ============================================================ */

  /** 是否处于房间中 */
  const isInRoom = computed(() => !!meta.value)

  /**
   * 当前用户是否有控制权
   *
   *  - intimate 模式：所有人都有（双方对等）
   *  - group 模式：仅 owner / admin
   */
  const canControl = computed(() => {
    if (!meta.value) return false
    if (meta.value.mode === 'intimate') return true
    return myRole.value === 'owner' || myRole.value === 'admin'
  })

  /** 当前用户是否是房主 */
  const isOwner = computed(() => myRole.value === 'owner')

  function syncMyRoleFromMembers(nextMembers: RoomMember[] = members.value): void {
    if (!myUserId.value) return
    const me = nextMembers.find((m) => m.userId === myUserId.value)
    myRole.value = me?.role ?? myRole.value ?? null
  }

  /* ============================================================
   *  内部闭包变量（不需要响应式）
   * ============================================================ */

  /** Socket.IO 客户端实例 */
  let socket: Socket | null = null

  /**
   * NTP 风格时钟偏差 —— serverTs - clientTs（毫秒）
   *
   * 应用 sync 时：targetServerTs = clientNow + clockOffset
   * 加入房间初期会快速 ping 5 次取中位数，之后每 30s 维持。
   */
  let clockOffset = 0

  /** 周期性 ping 定时器 */
  let pingTimer: ReturnType<typeof setInterval> | null = null

  /** 周期性播放漂移校准定时器 */
  let driftTimer: ReturnType<typeof setInterval> | null = null
  let isDriftChecking = false

  /** 房主/admin 周期性向服务端上报当前播放进度 */
  let progressReportTimer: ReturnType<typeof setInterval> | null = null
  let playlistSyncTimer: ReturnType<typeof setTimeout> | null = null
  let isReplacingSharedPlaylist = false
  let playlistBeforeRoom: SongList[] | null = null
  let roomSongApplyToken = 0

  /**
   * "正在应用远端事件" 标记 —— 防止回声广播
   *
   * 远端 sync -> 调用 ControlAudio -> 触发 publish('play') -> 又被订阅器捕获
   *  -> 如果不拦截就会再广播 ctl:play -> 服务器再 sync 回来 -> 死循环
   * 设置此标记后，订阅器会跳过该次 publish。
   */
  let isApplyingRemote = false

  /**
   * 远端切歌进行中标记 —— 单独的、更长时间窗的 flag
   *
   * 切歌路径：sync(change-song) -> watcher -> playSong (异步拉 URL ~1-2s)
   *  -> setUrl -> start -> 才 publish('play')
   * 普通的 isApplyingRemote 100ms 窗口太短，会被 publish('play') 触发广播。
   * 这个 flag 在切歌发起时打开，3s 后自动 reset。
   */
  let isApplyingSongChange = false

  /** ControlAudio 订阅取消函数 —— 离开房间时统一清理 */
  const audioUnsubs: Array<() => void> = []

  /** 控制事件去抖：记录最后一次 emit 时间避免短时间内连发 */
  const lastEmitAt: Record<string, number> = {}

  /* ============================================================
   *  Socket 连接管理
   * ============================================================ */

  /**
   * 建立 Socket 连接 —— 必须先调用此方法才能进/出房
   *
   * 自动从 Logto 取 access token 用作鉴权；
   * 内部带自动重连（默认 5 次，间隔指数退避）。
   */
  async function connect(): Promise<void> {
    if (socket?.connected) return
    if (connectionStatus.value === 'connecting') return

    connectionStatus.value = 'connecting'

    /* 取 access token —— 必须使用 ceru-backend 的 resource 才能拿到正确 audience */
    const logto = config.instance
    if (!logto) throw new Error('Logto 未初始化')
    const token = await logto.getAccessToken(CERU_API_RESOURCE)
    if (!token) throw new Error('未登录或 token 已失效')
    const authStore = useAuthStore()
    if (!authStore.user) {
      await authStore.updateUserInfo()
    }
    myUserId.value = authStore.user?.sub || myUserId.value

    /* 创建 socket —— 复用同一连接，重连不丢监听 */
    socket = ioClient(`${SOCKET_URL}/lt`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000
    })

    bindSocketEvents(socket)

    /* 等待握手完成（连接成功 / 失败） */
    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        cleanup()
        connectionStatus.value = 'connected'
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        connectionStatus.value = 'disconnected'
        reject(err)
      }
      const cleanup = () => {
        socket?.off('connect', onConnect)
        socket?.off('connect_error', onError)
      }
      socket?.once('connect', onConnect)
      socket?.once('connect_error', onError)
    })
  }

  /**
   * 主动断开连接
   *
   * 用途：用户登出、关闭客户端时清理资源；
   * 不要在普通"离开房间"时调用 —— 那是 leaveRoom 的事。
   */
  function disconnect(): void {
    stopPingLoop()
    clearAudioHooks()
    socket?.removeAllListeners()
    socket?.disconnect()
    socket = null
    resetRoomState()
    connectionStatus.value = 'idle'
  }

  /**
   * 绑定 socket 上的全部事件监听
   *
   * 抽离成独立函数：每次新建 socket 都要重新绑定，避免散落到 connect 里。
   */
  function bindSocketEvents(sock: Socket): void {
    /* ---- 连接生命周期 ---- */
    sock.on('disconnect', (reason) => {
      // io server disconnect 表示服务器主动踢（如鉴权失败）
      // 其它原因都属于网络问题，会自动重连
      console.warn('[lt] socket disconnected:', reason)
      connectionStatus.value =
        reason === 'io server disconnect' ? 'disconnected' : 'reconnecting'
    })

    sock.on('reconnect', () => {
      connectionStatus.value = 'connected'
      // 重连后重新同步时钟（网络变化可能影响 RTT）
      void runClockSyncBurst()
    })

    /* ---- 业务错误 ---- */
    sock.on(ServerEvents.ERROR, (err: ServerError) => {
      console.warn('[lt] server error:', err)
      MessagePlugin.warning(translateError(err))
    })

    /* ---- 房间状态广播 ---- */
    sock.on(ServerEvents.ROOM_STATE, (state: RoomState) => {
      // 完整快照覆盖 —— 由 join 触发
      meta.value = state.meta
      members.value = state.members
      queue.value = state.queue
      pending.value = state.pending
      chat.value = state.chat
      Object.assign(current, state.current)
      if (state.queue.length || state.current.song) {
        replaceLocalPlaylistFromQueue(state.queue, state.current.song)
      }

      // 找到自己的角色
      syncMyRoleFromMembers(state.members)

      // 进房后立即应用一次同步（万一进房时就有歌在播）
      if (state.current.song) {
        void ensureRoomSongLoadedAndSynced(state.current, { immediate: true })
      }
    })

    sock.on(ServerEvents.ROOM_DISMISSED, () => {
      MessagePlugin.info('房间已被解散')
      resetRoomState({ restorePlaylist: true })
    })

    /* ---- 成员变更 ---- */
    sock.on(ServerEvents.MEMBER_JOIN, (m: RoomMember) => {
      // 防重：可能因网络问题收到重复
      if (members.value.some((x) => x.userId === m.userId)) return
      members.value.push(m)
      syncMyRoleFromMembers()
    })

    sock.on(
      ServerEvents.MEMBER_LEAVE,
      (payload: { userId: string; reason?: string }) => {
        members.value = members.value.filter((x) => x.userId !== payload.userId)
        syncMyRoleFromMembers()
      }
    )

    sock.on(ServerEvents.MEMBER_KICKED, (payload: { byUser: { nickname: string } }) => {
      // 自己被踢
      MessagePlugin.warning(`你被 ${payload.byUser.nickname} 移出了房间`)
      resetRoomState({ restorePlaylist: true })
    })

    /* ---- 同步信号 —— 同步算法的核心 ---- */
    sock.on(
      ServerEvents.SYNC,
      (
        payload: PlaybackSnapshot & { action?: string; operatorId?: string }
      ) => {
        Object.assign(current, payload)
        void ensureRoomSongLoadedAndSynced(payload, {
          immediate: payload.action === 'play-queue-item' || payload.action === 'change-song'
        })
      }
    )

    /* ---- 队列 ---- */
    sock.on(ServerEvents.QUEUE_UPDATE, (payload: { queue: QueueItem[] }) => {
      queue.value = payload.queue
      replaceLocalPlaylistFromQueue(payload.queue, current.song)
    })

    sock.on(ServerEvents.PENDING_UPDATE, (payload: { pending: PendingItem[] }) => {
      pending.value = payload.pending
    })

    /* ---- 角色 ---- */
    sock.on(
      ServerEvents.ROLE_CHANGED,
      (payload: { userId: string; role: RoomRole; reason?: string }) => {
        const m = members.value.find((x) => x.userId === payload.userId)
        if (m) {
          m.role = payload.role
        } else {
          members.value.push({
            userId: payload.userId,
            nickname: payload.userId,
            role: payload.role
          })
        }
        if (payload.userId === myUserId.value) {
          myRole.value = payload.role
        }
        // owner 变更 -> 同步 meta.ownerId
        if (payload.role === 'owner' && meta.value) {
          meta.value.ownerId = payload.userId
        }
        syncMyRoleFromMembers()
      }
    )

    /* ---- 聊天 ---- */
    sock.on(ServerEvents.CHAT_MSG, (msg: ChatMsg) => {
      chat.value.push(msg)
      // 客户端内存里也限制数量（避免长时间运行内存爆）
      if (chat.value.length > 500) chat.value.splice(0, chat.value.length - 500)
    })

    sock.on(ServerEvents.CHAT_SYSTEM, (msg: ChatMsg) => {
      chat.value.push(msg)
      if (chat.value.length > 500) chat.value.splice(0, chat.value.length - 500)
    })

    /* ---- pong（在 syncClock 里 once 处理，这里不用监听） ---- */
  }

  /**
   * 把后端业务错误码翻译成中文用户消息
   *
   * 对常见错误特殊处理，其余 fallback 到原始 message。
   */
  function translateError(err: ServerError): string {
    switch (err.code) {
      case ErrorCodes.AUTH_FAILED:
        return '登录已过期，请重新登录'
      case ErrorCodes.ROOM_NOT_FOUND:
        return '房间不存在或已过期'
      case ErrorCodes.ROOM_FULL:
        return '房间已满'
      case ErrorCodes.ALREADY_IN_ROOM:
        return '你已经在另一个房间中'
      case ErrorCodes.PERMISSION_DENIED:
        return '权限不足'
      default:
        return err.message || '操作失败'
    }
  }

  /* ============================================================
   *  房间生命周期
   * ============================================================ */

  /**
   * 创建房间并自动进入
   *
   * REST 创建 -> 拿到 code -> socket join 一气呵成。
   */
  async function createAndJoin(payload: CreateRoomPayload): Promise<RoomMeta> {
    await connect()
    const room = await apiCreateRoom(payload)
    // ownerId 即是当前 logto sub —— 我们存到 myUserId 给后续 sync 防回声用
    myUserId.value = room.ownerId
    await joinByCode(room.code)
    await syncRoomContextFromLocal()
    return room
  }

  /**
   * 通过口令或分享文案加入房间
   *
   * 入参支持纯口令 / 整段分享文案，由后端 /resolve 自动正则提取。
   */
  async function resolveAndJoin(input: string): Promise<RoomMeta> {
    await connect()
    const preview = await apiResolveRoom({ code: input })
    if (!preview) {
      MessagePlugin.warning('口令无效或房间已过期')
      throw new Error('ROOM_NOT_FOUND')
    }
    return joinByCode(preview.code)
  }

  /**
   * 通过 code 加入房间（已经知道 code 时直接调用）
   */
  async function joinByCode(code: string): Promise<RoomMeta> {
    if (!socket) throw new Error('socket 未连接')
    const localUserStore = LocalUserDetailStore()
    playlistBeforeRoom = [...localUserStore.list]
    return new Promise<RoomMeta>((resolve, reject) => {
      let settled = false
      const onState = (state: RoomState) => {
        if (settled) return
        settled = true
        cleanup()
        if (!myUserId.value) {
          const authStore = useAuthStore()
          myUserId.value = authStore.user?.sub || myUserId.value
        }
        // myUserId 此时可能未填充（resolveAndJoin 路径），从成员里反推：
        // 我是刚 join 进来的，ROOM_STATE 一定包含我，但服务器没标"我"
        // 用 logto sub 作为权威 —— 先保留 createAndJoin 已设置的，否则不动
        startAudioHooks()
        void runClockSyncBurst()
        startPingLoop()
        startDriftLoop()
        startProgressReportLoop()
        resolve(state.meta)
      }
      const onError = (err: ServerError) => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(err.message))
      }
      const cleanup = () => {
        socket?.off(ServerEvents.ROOM_STATE, onState)
        socket?.off(ServerEvents.ERROR, onError)
      }
      socket?.once(ServerEvents.ROOM_STATE, onState)
      socket?.once(ServerEvents.ERROR, onError)

      socket?.emit(ClientEvents.ROOM_JOIN, { code })

      // 兜底超时
      setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('加入房间超时'))
      }, 8000)
    })
  }

  /**
   * 主动离开房间
   *
   * 不会断开 socket；用户可能立即加入下一个房间。
   */
  function leaveRoom(): void {
    if (!isInRoom.value) return
    socket?.emit(ClientEvents.ROOM_LEAVE)
    resetRoomState({ restorePlaylist: true })
  }

  /** 清空房间相关本地状态 + 取消 ControlAudio 订阅 + 停 ping */
  function resetRoomState(options: { restorePlaylist?: boolean } = {}): void {
    if (options.restorePlaylist && playlistBeforeRoom) {
      const localUserStore = LocalUserDetailStore()
      isReplacingSharedPlaylist = true
      localUserStore.replaceSongList(playlistBeforeRoom)
      setTimeout(() => {
        isReplacingSharedPlaylist = false
      }, 0)
    }
    playlistBeforeRoom = null
    meta.value = null
    myRole.value = null
    members.value = []
    queue.value = []
    pending.value = []
    chat.value = []
    Object.assign(current, {
      song: null,
      isPlaying: false,
      anchorPos: 0,
      anchorAt: 0
    })
    clearAudioHooks()
    stopPingLoop()
    stopDriftLoop()
    stopProgressReportLoop()
  }

  /* ============================================================
   *  播放控制（host / admin+ 调用）
   * ============================================================ */

  /**
   * 播放（仅在自己有控制权时生效）
   *
   * 注意：本方法**不直接调 ControlAudio.start()**，而是发广播给服务器；
   * 服务器收到后 sync 回来，所有人（包括自己）才同步执行播放。
   * 这样可以保证：自己看到的进度 = 服务器权威进度，避免本地与广播打架。
   *
   * 如果自己已经在房间但没控制权（group 模式 member），调用会被忽略。
   */
  function play(time?: number): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_PLAY, {
      time: time ?? ControlAudioStore().Audio.currentTime
    })
  }

  function pause(time?: number): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_PAUSE, {
      time: time ?? ControlAudioStore().Audio.currentTime
    })
  }

  function seek(time: number): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_SEEK, { time })
  }

  /**
   * 切歌 —— 立刻在所有人端切到指定歌曲
   *
   * 注意：song 对象必须包含 source + songmid，
   * 否则 member 端无法用对应音乐源 SDK 拉流。
   */
  function changeSong(song: SongRef): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_CHANGE_SONG, { song })
  }

  /** 跳过当前歌（自动播下一首） —— 队列空则停止 */
  function skip(): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_SKIP, {})
  }

  function playQueueItem(itemId: string): void {
    if (!emitGuard()) return
    socket?.emit(ClientEvents.CTL_PLAY_QUEUE_ITEM, { itemId })
  }

  /* ============================================================
   *  点歌 / 队列
   * ============================================================ */

  /** 普通成员点歌 —— 进入待审批列表 */
  function requestSong(song: SongRef): void {
    if (!isInRoom.value) return
    socket?.emit(ClientEvents.QUEUE_REQUEST, { song })
  }

  /** admin+ 直接入队（跳过审批） */
  function addToQueue(song: SongRef): void {
    if (!canControl.value) return
    socket?.emit(ClientEvents.QUEUE_ADD, { song })
  }

  /** admin+ 审批通过点歌请求 */
  function approveSong(reqId: string): void {
    if (!canControl.value) return
    socket?.emit(ClientEvents.QUEUE_APPROVE, { reqId })
  }

  /** admin+ 拒绝点歌请求 */
  function rejectSong(reqId: string): void {
    if (!canControl.value) return
    socket?.emit(ClientEvents.QUEUE_REJECT, { reqId })
  }

  /** 删除队列项（admin+ 任意，普通成员仅自己点的） */
  function removeFromQueue(itemId: string): void {
    if (!isInRoom.value) return
    socket?.emit(ClientEvents.QUEUE_REMOVE, { itemId })
  }

  /* ============================================================
   *  角色 / 成员管理（owner 独有）
   * ============================================================ */

  function promoteAdmin(userId: string): void {
    if (!isOwner.value) return
    socket?.emit(ClientEvents.ROLE_PROMOTE, { userId })
  }

  function demoteAdmin(userId: string): void {
    if (!isOwner.value) return
    socket?.emit(ClientEvents.ROLE_DEMOTE, { userId })
  }

  /** 踢人 —— admin+ 可踢，但不能踢 owner / 同级 */
  function kick(userId: string): void {
    if (!canControl.value) return
    socket?.emit(ClientEvents.MEMBER_KICK, { userId })
  }

  /* ============================================================
   *  聊天
   * ============================================================ */

  function sendChat(
    type: 'text' | 'emoji' | 'sticker',
    content: string
  ): void {
    if (!isInRoom.value) return
    if (!content) return
    socket?.emit(ClientEvents.CHAT_SEND, { type, content })
  }

  /* ============================================================
   *  ControlAudio 桥接
   * ============================================================ */

  /**
   * 开始监听本地 ControlAudio 的 publish 事件 —— 自动转广播
   *
   * 仅 host / admin+ 在播放控制类操作时广播；其余角色由服务器忽略权限不足
   * 的请求，但客户端这里也做权限闸门省一次 round-trip。
   *
   * 同时启动 member 端的切歌 watcher：当 current.song.songmid 变化（且不是
   * 自己刚切的）时，调用本地 playSong 走完整的拉流流程。
   */
  function startAudioHooks(): void {
    clearAudioHooks() // 防重
    const ca = ControlAudioStore()
    const localUserStore = LocalUserDetailStore()

    audioUnsubs.push(
      ca.subscribe('play', () => {
        if (isApplyingRemote || isApplyingSongChange || !canControl.value) return
        debouncedEmit(ClientEvents.CTL_PLAY, { time: ca.Audio.currentTime })
      }),
      ca.subscribe('pause', () => {
        if (isApplyingRemote || isApplyingSongChange || !canControl.value) return
        debouncedEmit(ClientEvents.CTL_PAUSE, { time: ca.Audio.currentTime })
      }),
      ca.subscribe('seeked', () => {
        if (isApplyingRemote || isApplyingSongChange || !canControl.value) return
        debouncedEmit(ClientEvents.CTL_SEEK, { time: ca.Audio.currentTime })
      })
      // ended 不广播 —— 由服务器/UI 决定是否 skip
      // timeupdate 不广播 —— 太频繁，由 anchorPos/anchorAt 自然推算
    )

    /* member 端切歌响应：监听 current.song 变化 → 触发本地 playSong 拉流
     *
     * 设计权衡：
     *  - 用 watch 在 store 内自动响应，房间状态变化即生效，不需要 UI 层介入
     *  - 收到新歌后立即确保本地已加载目标音频，再应用服务器进度
     */
    /* GlobalPlayStatus 提前实例化 —— 给 member watch 和 host watch 共用 */
    const globalPlayStatus = useGlobalPlayStatusStore()

    const stopSongWatch = watch(
      () => `${current.song?.source ?? ''}::${current.song?.songmid ?? ''}`,
      async (newKey, oldKey) => {
        if (!current.song) return
        if (newKey === oldKey) return
        await ensureRoomSongLoadedAndSynced(current, { immediate: true })
      }
    )
    audioUnsubs.push(() => stopSongWatch())

    /* host 端自动切歌广播：监听本地 GlobalPlayStatus.player.songInfo 变化
     *
     * 用户在歌单/搜索/最近播放页双击歌曲 → globaPlayList.playSong → songInfo 更新。
     * 这个 watcher 自动把切歌广播给房间所有人，不需要改 globaPlayList 的代码（低侵入）。
     *
     * 配合 ensureRoomSongLoadedAndSynced 的 isApplyingSongChange flag，
     * 避免远端拉流触发本地播放事件后又广播回服务器。
     */
    const stopHostSongWatch = watch(
      () => globalPlayStatus.player.songInfo?.songmid,
      (newId, oldId) => {
        // 没控制权的成员不广播
        if (!canControl.value) return
        // 正在应用远端切歌时不广播（防回声）
        if (isApplyingSongChange) return
        if (!newId || newId === oldId) return

        const info = globalPlayStatus.player.songInfo
        if (!info) return

        // 与房间当前歌相同则跳过 —— 避免重复广播
        if (
          current.song?.songmid === String(info.songmid) &&
          current.song?.source === info.source
        ) {
          return
        }

        // 标记自己刚切，避免 sync 回来又触发 member watch
        isApplyingSongChange = true
        setTimeout(() => {
          isApplyingSongChange = false
        }, 3000)

        socket?.emit(ClientEvents.CTL_CHANGE_SONG, {
          song: {
            songmid: String(info.songmid),
            source: info.source,
            name: info.name,
            singer: info.singer,
            cover: info.img,
            duration: parseInterval(info.interval),
            albumName: info.albumName,
            // PlayList.albumId 可能是 number，转 string 保持协议一致
            albumId: info.albumId !== undefined ? String(info.albumId) : undefined,
            hash: info.hash,
            // types: 直接透传，让 member 端能切音质
            types: info.types,
            // 歌词是公共数据，传给 member 省得他再拉一次
            lrc: info.lrc
          }
        })
      }
    )
    audioUnsubs.push(() => stopHostSongWatch())

    const stopPlaylistWatch = watch(
      () => localUserStore.list,
      () => {
        if (!isInRoom.value || !canControl.value || isReplacingSharedPlaylist) return
        if (playlistSyncTimer) clearTimeout(playlistSyncTimer)
        playlistSyncTimer = setTimeout(() => {
          playlistSyncTimer = null
          void syncRoomContextFromLocal()
        }, 300)
      },
      { deep: true }
    )
    audioUnsubs.push(() => {
      stopPlaylistWatch()
      if (playlistSyncTimer) {
        clearTimeout(playlistSyncTimer)
        playlistSyncTimer = null
      }
    })
  }

  /**
   * 把 mm:ss 字符串转回秒数 —— host 端广播切歌时用
   *
   * 容错：解析失败返回 undefined，不阻塞流程
   */
  function parseInterval(interval: unknown): number | undefined {
    if (typeof interval !== 'string') return undefined
    const m = interval.match(/^(\d+):(\d+)$/)
    if (!m) return undefined
    return Number(m[1]) * 60 + Number(m[2])
  }

  function clearAudioHooks(): void {
    while (audioUnsubs.length) {
      const fn = audioUnsubs.pop()
      try {
        fn?.()
      } catch {}
    }
  }

  function buildSongRef(song: Record<string, any> | null | undefined): SongRef | null {
    if (!song?.songmid || !song?.source) return null
    return {
      songmid: String(song.songmid),
      source: String(song.source),
      name: song.name || '',
      singer: song.singer || '',
      cover: song.img || song.cover || '',
      duration: parseInterval(song.interval),
      albumName: song.albumName || '',
      albumId: song.albumId !== undefined ? String(song.albumId) : undefined,
      hash: song.hash,
      types: Array.isArray(song.types) ? song.types : [],
      lrc: song.lrc ?? null
    }
  }

  async function syncRoomContextFromLocal(): Promise<void> {
    if (!socket?.connected || !isInRoom.value || !canControl.value) return

    const ca = ControlAudioStore()
    const globalPlayStatus = useGlobalPlayStatusStore()
    const localUserStore = LocalUserDetailStore()
    const currentSong = buildSongRef(globalPlayStatus.player.songInfo as Record<string, any>)
    const currentTime = Number(ca.Audio.currentTime || ca.Audio.audio?.currentTime || 0)
    const playlistSongs = localUserStore.list
      .map((song) => buildSongRef(song as unknown as Record<string, any>))
      .filter((song): song is SongRef => Boolean(song))
    const queueSongs =
      currentSong &&
      !playlistSongs.some(
        (song) => song.songmid === currentSong.songmid && song.source === currentSong.source
      )
        ? [currentSong, ...playlistSongs]
        : playlistSongs

    socket.emit(ClientEvents.ROOM_SYNC_CONTEXT, {
      current: {
        song: currentSong,
        isPlaying: Boolean(ca.Audio.isPlay),
        anchorPos: currentTime,
        anchorAt: Date.now() + clockOffset
      },
      queue: queueSongs
    })
  }

  function replaceLocalPlaylistFromQueue(items: QueueItem[], fallbackCurrent?: SongRef | null): void {
    if (!isInRoom.value) return
    const localUserStore = LocalUserDetailStore()
    const songs = items.map((item) => songRefToSongList(item.song))
    if (
      fallbackCurrent &&
      !songs.some(
        (song) =>
          String(song.songmid) === String(fallbackCurrent.songmid) &&
          song.source === fallbackCurrent.source
      )
    ) {
      songs.unshift(songRefToSongList(fallbackCurrent))
    }
    isReplacingSharedPlaylist = true
    localUserStore.replaceSongList(songs)
    setTimeout(() => {
      isReplacingSharedPlaylist = false
    }, 0)
  }

  async function ensureRoomSongLoadedAndSynced(
    snapshot: PlaybackSnapshot,
    options: { immediate?: boolean } = {}
  ): Promise<void> {
    if (!snapshot.song) {
      await applySnapshot(snapshot)
      return
    }

    const ca = ControlAudioStore()
    const globalPlayStatus = useGlobalPlayStatusStore()
    const localSong = globalPlayStatus.player.songInfo
    const sameLocalSong =
      localSong?.songmid !== undefined &&
      String(localSong.songmid) === String(snapshot.song.songmid) &&
      localSong.source === snapshot.song.source
    const hasLoadedAudio = Boolean(ca.Audio.audio?.src)

    if (sameLocalSong && hasLoadedAudio) {
      await applySnapshot(snapshot)
      return
    }

    const token = ++roomSongApplyToken
    isApplyingSongChange = true
    try {
      if (ca.Audio.audio) {
        try {
          ca.Audio.audio.pause()
        } catch {}
      }
      ca.Audio.isPlay = false

      const songList = songRefToSongList(snapshot.song)
      globalPlayStatus.updatePlayerInfo(songList)

      const mod = await import('@renderer/utils/audio/globaPlayList')
      if (token !== roomSongApplyToken) return
      await mod.playSong(songList, { immediate: options.immediate })
      if (token !== roomSongApplyToken) return
      await applySnapshot(snapshot)
    } catch (e) {
      console.warn('[lt] 房间歌曲同步失败:', e)
    } finally {
      if (token === roomSongApplyToken) {
        setTimeout(() => {
          if (token === roomSongApplyToken) isApplyingSongChange = false
        }, 500)
      }
    }
  }

  /**
   * 应用远端播放快照到本地 ControlAudio
   *
   * 流程：
   *  1. 计算服务器视角的"现在"：clientNow + clockOffset
   *  2. 推算应到达的播放位置：anchorPos + (now - anchorAt) / 1000
   *  3. 比对本地 currentTime，漂移超过阈值就硬 seek
   *  4. 同步播放 / 暂停状态
   *
   * 歌曲加载由 ensureRoomSongLoadedAndSynced 负责；这里只做进度和播放状态校准。
   */
  async function applySnapshot(snapshot: PlaybackSnapshot): Promise<void> {
    const ca = ControlAudioStore()
    isApplyingRemote = true
    try {
      // 1. 估算服务器"现在"
      const nowServer = Date.now() + clockOffset
      const elapsed = snapshot.isPlaying
        ? Math.max((nowServer - snapshot.anchorAt) / 1000, 0)
        : 0
      const targetPos = snapshot.anchorPos + elapsed

      // 2. 进度漂移 —— 大于阈值才硬 seek，否则相信本地自然推进
      const audioEl = ca.Audio.audio
      if (audioEl && snapshot.song) {
        const drift = Math.abs(audioEl.currentTime - targetPos)
        if (drift > DRIFT_HARD_SEEK_THRESHOLD) {
          try {
            audioEl.currentTime = targetPos
            ca.setCurrentTime(targetPos)
          } catch (e) {
            console.warn('[lt] hard seek failed:', e)
          }
        }
      }

      // 3. 播放 / 暂停状态
      if (snapshot.isPlaying && !ca.Audio.isPlay && audioEl?.src) {
        try {
          await ca.start()
        } catch (e) {
          console.warn('[lt] remote play failed:', e)
        }
      } else if (!snapshot.isPlaying && ca.Audio.isPlay) {
        try {
          await ca.stop()
        } catch (e) {
          console.warn('[lt] remote pause failed:', e)
        }
      }
    } finally {
      // 100ms 内的 publish 都视作"远端触发"，避免回声
      // 100ms 大于普通 audio 事件传递延迟，足够覆盖一次 play/pause
      setTimeout(() => {
        isApplyingRemote = false
      }, 100)
    }
  }

  /* ============================================================
   *  时钟同步（NTP-style）
   * ============================================================ */

  /**
   * 快速 ping 5 次估算时钟偏差
   *
   * 取中位数避免异常值（个别 RTT 抖动）影响。
   * 结果保留到全局 clockOffset，applySync 时使用。
   */
  async function runClockSyncBurst(): Promise<void> {
    if (!socket) return
    const samples: number[] = []
    for (let i = 0; i < PING_BURST_COUNT; i++) {
      const sample = await pingOnce()
      if (sample !== null) samples.push(sample)
      await sleep(PING_BURST_INTERVAL_MS)
    }
    if (samples.length === 0) return
    samples.sort((a, b) => a - b)
    clockOffset = samples[Math.floor(samples.length / 2)]
    console.debug(
      `[lt] clock offset = ${clockOffset.toFixed(0)}ms (${samples.length} samples)`
    )
  }

  /** 单次 ping —— 返回估算的时钟偏差，超时返回 null */
  function pingOnce(): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      if (!socket) return resolve(null)
      const t0 = Date.now()
      const timer = setTimeout(() => {
        socket?.off(ServerEvents.PONG, onPong)
        resolve(null)
      }, 2000)
      const onPong = (payload: { clientTs: number; serverTs: number }) => {
        if (payload.clientTs !== t0) return // 不是本次 ping 的回包
        clearTimeout(timer)
        socket?.off(ServerEvents.PONG, onPong)
        const t1 = Date.now()
        const rtt = t1 - t0
        // 假设 server -> client 走一半 RTT，估算服务器在 (t0 + rtt/2) 时刻是 serverTs
        const offset = payload.serverTs - (t0 + rtt / 2)
        resolve(offset)
      }
      socket.on(ServerEvents.PONG, onPong)
      socket.emit(ClientEvents.PING, { clientTs: t0 })
    })
  }

  /** 启动周期性 ping —— 维持 clockOffset 准确 */
  function startPingLoop(): void {
    stopPingLoop()
    pingTimer = setInterval(() => {
      void pingOnce().then((sample) => {
        // 单次 ping 用 EMA 平滑（α=0.3 偏向保留历史，避免抖动）
        if (sample !== null) {
          clockOffset = clockOffset * 0.7 + sample * 0.3
        }
      })
    }, PING_INTERVAL_MS)
  }

  function stopPingLoop(): void {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function startDriftLoop(): void {
    stopDriftLoop()
    driftTimer = setInterval(() => {
      if (!isInRoom.value || !current.song || isDriftChecking) return
      isDriftChecking = true
      void applySnapshot(current).finally(() => {
        isDriftChecking = false
      })
    }, 1000)
  }

  function stopDriftLoop(): void {
    if (driftTimer) {
      clearInterval(driftTimer)
      driftTimer = null
    }
    isDriftChecking = false
  }

  function startProgressReportLoop(): void {
    stopProgressReportLoop()
    progressReportTimer = setInterval(() => {
      if (!socket?.connected || !isInRoom.value || !canControl.value || !current.song) return
      const ca = ControlAudioStore()
      const localSong = buildSongRef(useGlobalPlayStatusStore().player.songInfo as Record<string, any>)
      socket.emit(ClientEvents.ROOM_SYNC_CONTEXT, {
        current: {
          song: localSong ?? current.song,
          isPlaying: Boolean(ca.Audio.isPlay),
          anchorPos: Number(ca.Audio.currentTime || ca.Audio.audio?.currentTime || 0),
          anchorAt: Date.now() + clockOffset
        }
      })
    }, PROGRESS_REPORT_INTERVAL_MS)
  }

  function stopProgressReportLoop(): void {
    if (progressReportTimer) {
      clearInterval(progressReportTimer)
      progressReportTimer = null
    }
  }

  /* ============================================================
   *  辅助
   * ============================================================ */

  /** emit 前的统一闸门 —— 确保连接 + 在房间 + 有权限 */
  function emitGuard(): boolean {
    if (!socket?.connected) return false
    if (!isInRoom.value) return false
    if (!canControl.value) {
      MessagePlugin.warning('当前没有播放控制权')
      return false
    }
    return true
  }

  /**
   * 去抖 emit —— 同一事件名 80ms 内只发一次
   *
   * 防止用户快速连点（比如连按 seek 进度条）产生海量广播。
   */
  function debouncedEmit(event: string, payload: unknown): void {
    const now = Date.now()
    if ((lastEmitAt[event] ?? 0) + CONTROL_DEBOUNCE_MS > now) return
    lastEmitAt[event] = now
    socket?.emit(event, payload)
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }

  /* ============================================================
   *  浮层控制（UI 状态）—— 与 FullPlay 内部 CommentsOverlay 的模式对齐
   * ============================================================ */

  /** 打开一起听浮层 —— 创建/加入成功 / 用户主动点开时调用 */
  function openOverlay(): void {
    overlayVisible.value = true
  }

  /** 关闭浮层 —— 仅隐藏 UI，不离开房间 */
  function closeOverlay(): void {
    overlayVisible.value = false
  }

  /** 切换浮层显示 —— 用于操作栏的"一起听"按钮 */
  function toggleOverlay(): void {
    overlayVisible.value = !overlayVisible.value
  }

  /* ============================================================
   *  导出
   * ============================================================ */

  return {
    // 状态
    connectionStatus,
    meta,
    myRole,
    myUserId,
    members,
    queue,
    pending,
    chat,
    current,
    overlayVisible,

    // getters
    isInRoom,
    canControl,
    isOwner,

    // 浮层（叠加在 FullPlay 内部）
    openOverlay,
    closeOverlay,
    toggleOverlay,
    syncRoomContextFromLocal,

    // 连接管理
    connect,
    disconnect,

    // 房间生命周期
    createAndJoin,
    resolveAndJoin,
    joinByCode,
    leaveRoom,

    // 播放控制
    play,
    pause,
    seek,
    changeSong,
    playQueueItem,
    skip,

    // 队列 / 点歌
    requestSong,
    addToQueue,
    approveSong,
    rejectSong,
    removeFromQueue,

    // 角色 / 成员
    promoteAdmin,
    demoteAdmin,
    kick,

    // 聊天
    sendChat
  }
})
