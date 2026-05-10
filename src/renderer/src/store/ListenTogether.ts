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
    anchorAt: 0,
    seq: 0
  })

  /**
   * 已应用的最高 SYNC 版本号
   *
   * 客户端只接受 `payload.seq > localSeq` 的 SYNC,丢弃乱序/陈旧包。
   * 加入房间时 ROOM_STATE.current.seq 即为初始值。
   */
  const localSeq = ref(0)

  /**
   * 是否处于重连过程中 —— socket disconnect 到 reconnect 之间为 true
   *
   * UI 可据此显示"正在重连"提示;墓碑期内续连会自动恢复,无需用户感知。
   */
  const isReconnecting = ref(false)

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

  /**
   * 周期性漂移校准 —— 本地按 current 推算应播位置,与本地 audio 比对,超阈值则硬 seek
   *
   * 不广播,纯本地纠正。解决"无事件期间不发 SYNC 时,成员因时钟漂移/缓冲抖动逐渐
   * 偏离 host 几秒"的长尾问题。
   *
   * 间隔取 3s:既能在 1 分钟内把累积的几百毫秒漂移压回阈值内,又不至于频繁打断播放。
   */
  let driftTimer: ReturnType<typeof setInterval> | null = null

  let playlistSyncTimer: ReturnType<typeof setTimeout> | null = null
  let isReplacingSharedPlaylist = false
  let playlistBeforeRoom: SongList[] | null = null
  let roomSongApplyToken = 0

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
      if (reason === 'io server disconnect') {
        connectionStatus.value = 'disconnected'
        isReconnecting.value = false
      } else {
        connectionStatus.value = 'reconnecting'
        isReconnecting.value = true
      }
    })

    sock.on('reconnect', async () => {
      connectionStatus.value = 'connected'
      // 重连后重新同步时钟（网络变化可能影响 RTT）
      void runClockSyncBurst()

      /* 30s 墓碑期内续连:发 ROOM_RESUME 让服务端取消清理 + 推完整状态。
       * 服务端若墓碑已过期或不匹配,会回退为正常 join 流程,客户端体验上等同重新进入。 */
      if (meta.value && socket) {
        socket.emit(ClientEvents.ROOM_RESUME, {
          code: meta.value.code,
          lastSeq: localSeq.value
        })
      }
      isReconnecting.value = false
    })

    /* ---- 业务错误 ---- */
    sock.on(ServerEvents.ERROR, (err: ServerError) => {
      console.warn('[lt] server error:', err)
      MessagePlugin.warning(translateError(err))
    })

    /* ---- 房间状态广播 ---- */
    sock.on(ServerEvents.ROOM_STATE, (state: RoomState) => {
      // 完整快照覆盖 —— 由 join / resume 触发
      meta.value = state.meta
      members.value = state.members
      queue.value = state.queue
      pending.value = state.pending
      chat.value = state.chat
      Object.assign(current, state.current)
      /* localSeq 初始化:重连/续连时也以服务端权威为准,避免应用旧 SYNC */
      localSeq.value = state.current.seq || 0

      /* 初次同步用 ROOM_STATE.serverTs 立即估算时钟偏差,避免 clockOffset 仍为 0 时
       * applySnapshot 用本地时间推算 elapsed 产生几秒级误差(实测过 7-8s 差异都来源于此)。
       * 这是粗估(忽略 ROOM_STATE 包的单程网络延迟,通常 <100ms),
       * 几百 ms 后 ping burst 会用 RTT/2 收敛到更准的偏差。 */
      if (state.serverTs && clockOffset === 0) {
        clockOffset = state.serverTs - Date.now()
      }

      if (state.queue.length || state.current.song) {
        replaceLocalPlaylistFromQueue(state.queue, state.current.song)
      }

      // 找到自己的角色
      syncMyRoleFromMembers(state.members)

      // 进房后立即应用一次同步（万一进房时就有歌在播）
      if (state.current.song) {
        void ensureRoomSongLoadedAndSynced(state.current, {
          immediate: true,
          forceAlign: true
        })
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

    /* ---- 墓碑期内同 userId 续连 —— 不触发 leave/join 跳动 ---- */
    sock.on(
      ServerEvents.MEMBER_RECONNECT,
      (payload: { userId: string; nickname?: string }) => {
        // 仅刷新成员存在状态,不动 members(他没真离开过)。
        // 实际的 UI 提示也可以选择不处理 —— 这就是续连的目的:静默恢复。
        if (!members.value.some((x) => x.userId === payload.userId) && payload.nickname) {
          members.value.push({
            userId: payload.userId,
            nickname: payload.nickname,
            role: 'member'
          })
        }
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
        /* seq 单调递增校验:旧/重复 SYNC 直接丢弃,防止乱序 */
        if (typeof payload.seq === 'number' && payload.seq <= localSeq.value) {
          return
        }
        Object.assign(current, payload)
        if (typeof payload.seq === 'number') {
          localSeq.value = payload.seq
        }
        /* 显式动作(seek/change-song/play-queue-item)需要忽略漂移阈值精确对齐;
         * 普通 play/pause/room-sync-context 走漂移平滑。 */
        const forceAlign =
          payload.action === 'seek' ||
          payload.action === 'change-song' ||
          payload.action === 'play-queue-item'
        void ensureRoomSongLoadedAndSynced(payload, {
          immediate: payload.action === 'play-queue-item' || payload.action === 'change-song',
          forceAlign
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
      case ErrorCodes.NO_SONG:
        return '当前房间还没有歌曲,请先选歌'
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
      anchorAt: 0,
      seq: 0
    })
    localSeq.value = 0
    clearAudioHooks()
    stopPingLoop()
    stopDriftLoop()
  }

  /* ============================================================
   *  播放控制（host / admin+ 调用）
   * ============================================================ */

  /**
   * 播放（仅在自己有控制权时生效）
   *
   * 注意：本方法**不直接调 ControlAudio.start()**,而是发广播给服务器;
   * 服务器收到后 SYNC 回来,所有人(包括自己)才同步执行播放。
   * 这样保证:自己看到的进度 = 服务器权威进度,host/member 走相同路径,无回声风险。
   *
   * 如果当前房间无歌(current.song = null),前置守卫直接 toast 提示,不发空命令。
   * 如果自己已经在房间但没控制权(group 模式 member),emitGuard 拦截。
   */
  function play(time?: number): void {
    if (!emitGuard()) return
    if (!current.song) {
      MessagePlugin.warning('当前房间还没有歌曲,请先选歌')
      return
    }
    debouncedEmit(ClientEvents.CTL_PLAY, {
      time: time ?? ControlAudioStore().Audio.currentTime
    })
  }

  function pause(time?: number): void {
    if (!emitGuard()) return
    if (!current.song) return
    debouncedEmit(ClientEvents.CTL_PAUSE, {
      time: time ?? ControlAudioStore().Audio.currentTime
    })
  }

  function seek(time: number): void {
    if (!emitGuard()) return
    if (!current.song) return
    /* 乐观更新 —— 同时改本地 audio.currentTime 和 current 的 anchor,使:
     *  1. 进度条立即响应,不会因等 SYNC 回程而"跳回"老位置;
     *  2. drift 循环看到的 current.anchorPos/anchorAt 与即将到来的 SYNC 一致,
     *     不会用旧 anchor 把刚 seek 的音频再拉回去。
     * SYNC 回来后 applySnapshot 在 'seek' action 下会再做一次精确对齐(无视漂移阈值)。 */
    const ca = ControlAudioStore()
    if (ca.Audio.audio) {
      try {
        ca.Audio.audio.currentTime = time
      } catch {}
    }
    ca.setCurrentTime(time)
    current.anchorPos = time
    current.anchorAt = Date.now() + clockOffset
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

  /**
   * 当前歌曲自然播完 —— 由 GlobalAudio 的 ended 事件调用(host/admin 触发)
   *
   * 设计:服务端按 (songmid, source, seq) 幂等去重,即便多客户端同时报 ended
   * 也只推进一次。member 不应调用此方法 —— 服务端会以 PERMISSION_DENIED 拒绝。
   */
  function onSongEnded(): void {
    if (!socket?.connected || !isInRoom.value || !canControl.value) return
    if (!current.song) return
    socket.emit(ClientEvents.CTL_SONG_ENDED, {
      songmid: current.song.songmid,
      source: current.song.source,
      seq: current.seq
    })
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
   * 启动房间内的 ControlAudio 桥接 —— 命令式同步架构,host 也按 SYNC 应用
   *
   * 设计变化(相比旧版):
   *  - 不再订阅 ControlAudio 的 publish('play'/'pause'/'seeked') 自动广播
   *  - 不再监听 GlobalPlayStatus.songInfo 自动广播切歌
   *  - 所有播放控制走 UI -> lt.play()/lt.pause()/lt.seek()/lt.changeSong() 显式命令
   *  - 服务端确权后回 SYNC,client 据此驱动本地 audio
   *
   * 这里只保留两类钩子:
   *  1. member 端 current.song 变化 → 加载新歌(使用 ensureRoomSongLoadedAndSynced)
   *  2. host 端本地共享列表(LocalUserDetailStore.list)变化 → 节流上传 queue
   */
  function startAudioHooks(): void {
    clearAudioHooks() // 防重
    const localUserStore = LocalUserDetailStore()

    /* member 端切歌响应:监听 current.song 变化 → 触发本地 playSong 拉流
     *
     * host 也走这里(因为 host 不再自己 audio.play(),也是从 SYNC 收到 song),
     * 但通常 host 自己已经播过这首,sameLocalSong 检查会跳过重新加载。
     */
    const stopSongWatch = watch(
      () => `${current.song?.source ?? ''}::${current.song?.songmid ?? ''}`,
      async (newKey, oldKey) => {
        if (!current.song) return
        if (newKey === oldKey) return
        await ensureRoomSongLoadedAndSynced(current, { immediate: true })
      }
    )
    audioUnsubs.push(() => stopSongWatch())

    /* host 端共享列表上传:本地 list 变 → 节流后上传 queue */
    const stopPlaylistWatch = watch(
      () => localUserStore.list,
      () => {
        if (!isInRoom.value || !canControl.value || isReplacingSharedPlaylist) return
        if (playlistSyncTimer) clearTimeout(playlistSyncTimer)
        playlistSyncTimer = setTimeout(() => {
          playlistSyncTimer = null
          void syncRoomContextFromLocal({ queueOnly: true })
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
   * 把 mm:ss 字符串转回秒数 —— buildSongRef 解析时长用
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

  /**
   * host 进房或共享列表变更时,把本地状态上传到服务端
   *
   * @param options.queueOnly true = 只上传 queue,不带 current(避免重置当前歌进度)
   *
   * 设计原则:这是"初次状态同步"的通道,不是"周期性进度上报"。后续播放控制
   * 一律走 ctl:* 显式命令路径。
   */
  async function syncRoomContextFromLocal(
    options: { queueOnly?: boolean } = {}
  ): Promise<void> {
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
      ...(options.queueOnly
        ? {}
        : {
            current: {
              song: currentSong,
              isPlaying: Boolean(ca.Audio.isPlay),
              anchorPos: currentTime,
              anchorAt: Date.now() + clockOffset
            }
          }),
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
    options: { immediate?: boolean; forceAlign?: boolean } = {}
  ): Promise<void> {
    if (!snapshot.song) {
      await applySnapshot(snapshot, { forceAlign: options.forceAlign })
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
      await applySnapshot(snapshot, { forceAlign: options.forceAlign })
      return
    }

    const token = ++roomSongApplyToken
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
      await mod.playSong(songList, {
        immediate: options.immediate,
        shouldAutoStart: () =>
          current.isPlaying &&
          current.song?.songmid === snapshot.song?.songmid &&
          current.song?.source === snapshot.song?.source
      })
      if (token !== roomSongApplyToken) return
      /* 切歌完成后 anchorPos 一般为 0,本地 audio 也刚加载完接近 0,
       * 走默认漂移阈值即可,无需强对齐。 */
      await applySnapshot(snapshot, { forceAlign: false })
    } catch (e) {
      console.warn('[lt] 房间歌曲同步失败:', e)
    }
  }

  /**
   * 应用远端播放快照到本地 ControlAudio
   *
   * forceAlign=true 时无视漂移阈值,强制硬 seek 到目标位置。
   * 用于显式 seek 命令 —— 否则用户拖完进度条会因为漂移不大被忽略,出现"跳回"现象。
   */
  async function applySnapshot(
    snapshot: PlaybackSnapshot,
    options: { forceAlign?: boolean } = {}
  ): Promise<void> {
    /* seq 校验:仅当 snapshot 来自 current(共享 ref)时绕过(此时 seq 已是当前),
     * 来自远端 payload 的 snapshot 必须严格大于 localSeq 才应用。
     * snapshot === current 时引用相等可识别,不需额外参数。 */
    if (snapshot !== current) {
      if (snapshot.seq <= localSeq.value && snapshot.seq !== 0) {
        return
      }
      localSeq.value = Math.max(localSeq.value, snapshot.seq)
    }

    const ca = ControlAudioStore()
    // 1. 估算服务器"现在"
    const nowServer = Date.now() + clockOffset
    const elapsed = snapshot.isPlaying
      ? Math.max((nowServer - snapshot.anchorAt) / 1000, 0)
      : 0
    const targetPos = snapshot.anchorPos + elapsed

    // 2. 进度漂移 —— 大于阈值或 forceAlign 时硬 seek
    const audioEl = ca.Audio.audio
    if (audioEl && snapshot.song) {
      const drift = Math.abs(audioEl.currentTime - targetPos)
      if (options.forceAlign || drift > DRIFT_HARD_SEEK_THRESHOLD) {
        try {
          audioEl.currentTime = targetPos
          ca.setCurrentTime(targetPos)
        } catch (e) {
          console.warn('[lt] hard seek failed:', e)
        }
      }
    }

    // 3. 播放 / 暂停状态
    // 以真实 audio.paused 为准；ControlAudio.isPlay 在双槽/淡出/异步拉流时可能滞后。
    const actuallyPlaying = audioEl ? !audioEl.paused : ca.Audio.isPlay
    /* 已自然 ended 的音频不要重新 ca.start() —— 否则会立即再次 fire ended,
     * 反复重置 autoNext 计时器,导致永远不会切下一首("回到开始并暂停"的死循环)。
     * 让 GlobalAudio.handleEnded → autoNext → lt.onSongEnded 自然推进队列。 */
    const audioEnded = Boolean(audioEl?.ended)
    if (snapshot.isPlaying && !actuallyPlaying && audioEl?.src && !audioEnded) {
      try {
        await ca.start()
      } catch (e) {
        console.warn('[lt] remote play failed:', e)
      }
    } else if (!snapshot.isPlaying && (actuallyPlaying || ca.Audio.isPlay)) {
      try {
        await ca.stop()
      } catch (e) {
        console.warn('[lt] remote pause failed:', e)
      }
    } else if (!snapshot.isPlaying) {
      ca.Audio.isPlay = false
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

  /**
   * 启动漂移校准循环 —— 加入房间后开启,离开/重置时停止
   *
   * 每 3s 用 current(reactive 的最新权威快照) 调一次 applySnapshot;
   * applySnapshot 内的 seq 校验在 snapshot === current 时绕过,
   * 漂移大于阈值即硬 seek 拉回。不广播,纯本地。
   *
   * 安全条件(任一不满足即跳过本次):
   *  - 不在房间 / 无歌 / 服务端权威认为暂停 → 没有需要校准的"播放进度"
   *  - 本地 audio 已 ended → 让 autoNext 自然推进,不要 ca.start() 触发死循环
   *  - globalPlayStatus.songInfo 与 current.song 不一致 → 歌曲切换中,drift 校准
   *    会拿新 anchor 校准旧 audio 元素,导致进度错乱
   */
  function startDriftLoop(): void {
    stopDriftLoop()
    driftTimer = setInterval(() => {
      if (!isInRoom.value || !current.song || !current.isPlaying) return
      const ca = ControlAudioStore()
      const audioEl = ca.Audio.audio
      if (!audioEl || audioEl.ended) return

      /* 切歌期间 globalPlayStatus.songInfo 由 ensureRoomSongLoadedAndSynced 提前
       * 写入,但 audio.src 加载尚未完成 —— 此时 drift 校准毫无意义,容易误伤。 */
      const localSongmid = useGlobalPlayStatusStore().player.songInfo?.songmid
      if (
        localSongmid === undefined ||
        String(localSongmid) !== String(current.song.songmid)
      ) {
        return
      }

      /* 音频还没准备好(刚 setUrl,数据未到 HAVE_CURRENT_DATA)时,不要 hard seek
       * —— 否则会触发 audio 元素的诡异行为(seek 失败/卡死) */
      if (audioEl.readyState < 2) return

      void applySnapshot(current)
    }, 3000)
  }

  function stopDriftLoop(): void {
    if (driftTimer) {
      clearInterval(driftTimer)
      driftTimer = null
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
    isReconnecting,
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
    onSongEnded,

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
