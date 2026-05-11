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
import { type Socket } from 'socket.io-client'
import { SocketRequest } from '@renderer/utils/request'
import { CERU_API_RESOURCE } from '@common/api/resources'
import { MessagePlugin } from 'tdesign-vue-next'

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
import { setLtInRoom } from '@renderer/utils/listenTogether/state'
import {
  configureNotifier,
  notifyChat,
  notifyPending,
  resetNotifierBuffers
} from '@renderer/utils/listenTogether/notifier'
import type { SongList } from '@renderer/types/audio'

/* ---------------- 连接配置 ----------------
 *
 * Socket.IO 的连接 URL / dev-prod 切换都由 SocketRequest 内部根据
 * common/api/config.json 的 baseUrl 配置自动决定。
 * Logto resource indicator(token aud)统一从 @common/api/resources 导入。
 */

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

  /**
   * 全屏播放器是否展开 —— 由 PlayMusic.vue 单向同步进来
   *
   * 设计:LtChatToast/LtDanmakuLayer 等组件需要根据 FullPlay 状态决定渲染方式
   * (全屏开 → 弹幕飘过;关 → toast 提示)。FullPlay 状态原本是 PlayMusic.vue 的
   * 本地 ref,这里加一个全局镜像,任何挂在 root 的组件都能感知,无需 props 透传。
   */
  const fullPlayVisible = ref(false)
  function setFullPlayVisible(v: boolean): void {
    fullPlayVisible.value = v
  }

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

  /* 同步给 ControlAudio / crossfade 等模块的热路径访问点 ——
   * 这些模块判断"是否在房间内"时不能 import 本 store(循环依赖),通过 state.ts 中转。 */
  watch(isInRoom, (value) => setLtInRoom(value), { immediate: true })

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

  let playlistBeforeRoom: SongList[] | null = null
  let roomSongApplyToken = 0
  /**
   * 当前正在加载的歌曲 key —— 防止 song-load 分支被反复重入
   *
   * playSong 加载新 URL 时会先 removeAttribute('src') + load() 清空
   * audio.src 再 setUrl,期间如果 SYNC 反复到达 ensureRoomSongLoadedAndSynced,
   * `hasLoadedAudio` 会是 false,导致它再次进入 song-load 分支重启 playSong,
   * 产生死循环(日志表现为同一 URL 反复 setUrl)。
   */
  let loadingSongKey: string | null = null

  /**
   * 用户主动切歌的"本地加载中" key —— 与 loadingSongKey **故意分开**
   *
   * 之前两者共用一个变量,user-initiated playSong 的 finally 清掉的是 ensureRoom
   * 自己的 loadingSongKey,导致 ensureRoom song-load 分支被反复重入产生死循环。
   * 现在拆开:ensureRoom 入口检查两者其一命中即跳过 song-load,各自独立清理。
   */
  let hostUserLoadingKey: string | null = null

  /** ControlAudio 订阅取消函数 —— 离开房间时统一清理 */
  const audioUnsubs: Array<() => void> = []

  /** 控制事件去抖：记录最后一次 emit 时间避免短时间内连发 */
  const lastEmitAt: Record<string, number> = {}

  /**
   * 上次本地发起 seek 的服务端时间(估算) —— 用于丢弃陈旧 SYNC
   *
   * 场景:用户在 host 端发出 ctl:play 后立即拖动进度条 seek。ctl:play 的 SYNC
   * 在网络上比 seek 先发送,但可能因排队/路由抖动后到达 —— 该 SYNC 的 anchorAt
   * 早于 seek,如果直接应用就会把刚 seek 的进度条又拉回 play 时的位置。
   *
   * 通过比对 payload.anchorAt 是否早于此值,识别并丢弃陈旧 anchor。
   */
  let lastLocalSeekAt = 0

  /**
   * 上次本地 play/pause 操作的服务端时间(估算)+ 当时的期望状态
   *
   * 解决"暂停后又自己播放"的竞态:host 切歌后立即点暂停,server 顺序广播
   * SYNC1(change-song,isPlaying=true) 和 SYNC2(pause,isPlaying=false)。
   * SYNC1 到达时 host 已本地 pause,applySnapshot 会调 ca.start() 把 audio
   * 重新启动 —— 我们识别这是早于本地 pause 的陈旧 SYNC,把 isPlaying 字段
   * 替换成本地期望状态,让陈旧 SYNC 不能反转 host 最近的 play/pause 意图。
   */
  let lastLocalControlAt = 0
  let lastLocalDesiredIsPlaying = false

  /* ============================================================
   *  Socket 连接管理
   * ============================================================ */

  /**
   * 建立 Socket 连接 —— 必须先调用此方法才能进/出房
   *
   * 实际的鉴权 + 重试逻辑被抽到 `SocketRequest`(utils/request.ts):
   *  - 复用 logto 链路取 access token
   *  - dev/prod baseURL 自动切换
   *  - 首次 AUTH_FAILED 自动刷新 token 重试一次
   * 这里只负责注册业务事件 + 维护 connectionStatus 状态。
   */
  const socketRequest = new SocketRequest('/lt', CERU_API_RESOURCE)

  async function connect(): Promise<void> {
    if (socket?.connected) return
    if (connectionStatus.value === 'connecting') return

    connectionStatus.value = 'connecting'

    /* 顺手同步 myUserId —— 后续 SYNC handler 用它区分 self/other 来源 */
    const authStore = useAuthStore()
    if (!authStore.user) {
      await authStore.updateUserInfo()
    }
    myUserId.value = authStore.user?.sub || myUserId.value

    try {
      socket = await socketRequest.connect()
      bindSocketEvents(socket)
      connectionStatus.value = 'connected'
    } catch (err) {
      connectionStatus.value = 'disconnected'
      throw err
    }
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
       * 服务端若墓碑已过期或不匹配,会回退为正常 join 流程,客户端体验上等同重新进入。
       *
       * 注意:isReconnecting 保持 true 直到 ROOM_STATE 回来 —— 期间 emitGuard 会
       * 拦截用户主动 emit,避免 server data.roomCode 还没设时发出去触发误报错。 */
      if (meta.value && socket) {
        socket.emit(ClientEvents.ROOM_RESUME, {
          code: meta.value.code,
          lastSeq: localSeq.value
        })
      } else {
        /* 没在房间内,无需等 RESUME,直接结束重连状态 */
        isReconnecting.value = false
      }
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
      /* ROOM_STATE 标志着 server 端 socket.data.roomCode 已经设好(handleJoin/Resume
       * 在 emit ROOM_STATE 之前设的)—— 此时清掉 isReconnecting,放开 emit gate。 */
      isReconnecting.value = false

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

    sock.on(ServerEvents.MEMBER_LEAVE, (payload: { userId: string; reason?: string }) => {
      members.value = members.value.filter((x) => x.userId !== payload.userId)
      syncMyRoleFromMembers()
    })

    /* ---- 墓碑期内同 userId 续连 —— 不触发 leave/join 跳动 ---- */
    sock.on(ServerEvents.MEMBER_RECONNECT, (payload: { userId: string; nickname?: string }) => {
      // 仅刷新成员存在状态,不动 members(他没真离开过)。
      // 实际的 UI 提示也可以选择不处理 —— 这就是续连的目的:静默恢复。
      if (!members.value.some((x) => x.userId === payload.userId) && payload.nickname) {
        members.value.push({
          userId: payload.userId,
          nickname: payload.nickname,
          role: 'member'
        })
      }
    })

    sock.on(ServerEvents.MEMBER_KICKED, (payload: { byUser: { nickname: string } }) => {
      // 自己被踢
      MessagePlugin.warning(`你被 ${payload.byUser.nickname} 移出了房间`)
      resetRoomState({ restorePlaylist: true })
    })

    /* ---- 同步信号 —— 同步算法的核心 ---- */
    sock.on(
      ServerEvents.SYNC,
      (payload: PlaybackSnapshot & { action?: string; operatorId?: string }) => {
        /* seq 单调递增校验:旧/重复 SYNC 直接丢弃,防止乱序 */
        if (typeof payload.seq === 'number' && payload.seq <= localSeq.value) {
          return
        }
        /* 陈旧 anchor 防御:用户刚 seek 后,可能有更早 emit 的 ctl:* SYNC 因网络
         * 抖动后到达 —— 该 SYNC 的 anchorAt 早于 lastLocalSeekAt,如果直接应用
         * anchor 字段会用旧位置覆盖刚 seek 的位置("seek 后又跳回去了")。
         *
         * 关键:只过滤 anchor 字段(anchorPos/anchorAt),保留 isPlaying/song/seq
         * 等业务状态变化 —— 否则用户 seek 后立即点暂停,pause 的 SYNC 会被整体
         * 丢弃,导致 host 自己没暂停但 member 暂停了的诡异状态。 */
        let effective: PlaybackSnapshot & { action?: string; operatorId?: string } = payload
        if (
          lastLocalSeekAt > 0 &&
          payload.action !== 'seek' &&
          payload.anchorAt < lastLocalSeekAt
        ) {
          effective = {
            ...effective,
            anchorPos: current.anchorPos,
            anchorAt: current.anchorAt
          }
        }
        /* 陈旧 isPlaying 防御:如果 SYNC 早于本地最近一次 play/pause 且与本地意图
         * 相反,说明这是被本地操作"超车"的旧 SYNC(典型场景:切歌后立即暂停,
         * change-song 的 SYNC isPlaying=true 后到,会把刚 pause 的 audio 又启动)。
         * 把 isPlaying 替换为本地最近意图。
         * 例外:本次 SYNC 本身是 pause/play 回包(action 匹配),正常应用。 */
        if (
          lastLocalControlAt > 0 &&
          payload.action !== 'pause' &&
          payload.action !== 'play' &&
          payload.anchorAt < lastLocalControlAt &&
          payload.isPlaying !== lastLocalDesiredIsPlaying
        ) {
          effective = { ...effective, isPlaying: lastLocalDesiredIsPlaying }
        }
        /* 收到我们 seek 的回包后清掉守卫 */
        if (payload.action === 'seek') {
          lastLocalSeekAt = 0
        }
        /* 收到我们 play/pause 的回包后清掉守卫 */
        if (payload.action === 'play' || payload.action === 'pause') {
          lastLocalControlAt = 0
        }
        Object.assign(current, effective)
        if (typeof payload.seq === 'number') {
          localSeq.value = payload.seq
        }
        /* 显式动作(seek/change-song/play-queue-item/skip)需要忽略漂移阈值精确对齐;
         * 普通 play/pause/room-sync-context 走漂移平滑。skip 必须 forceAlign,
         * 否则切歌后 anchorPos=0 但本地 audio 仍在旧时间戳会因 drift > 阈值且 audio 已 ended
         * 而无法正确播放新歌。
         *
         * 注意:host 自己发起的命令已经在 lt.play/pause/seek 里乐观本地执行了,
         * applySnapshot 是幂等的(audio 状态已匹配 target 时不会重复 ca.start/stop),
         * 所以不需要按 operatorId 跳过 —— 这同时也是 host 本地操作失败时的兜底。 */
        const forceAlign =
          payload.action === 'seek' ||
          payload.action === 'change-song' ||
          payload.action === 'play-queue-item' ||
          payload.action === 'skip'
        void ensureRoomSongLoadedAndSynced(effective, {
          immediate:
            payload.action === 'play-queue-item' ||
            payload.action === 'change-song' ||
            payload.action === 'skip',
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
      /* 差量算出"新出现"的 reqId —— PENDING_UPDATE 是全量替换语义,
       * 自己拿不到 PENDING_ADD,只能用旧列表减新列表算增量。
       * 仅 canControl(intimate 全员 / group 的 owner+admin)才推审批通知。 */
      if (canControl.value && meta.value) {
        const prevIds = new Set(pending.value.map((p) => p.reqId))
        const newItems = payload.pending.filter((p) => !prevIds.has(p.reqId))
        if (newItems.length > 0) {
          /* 过滤掉自己点的歌(自己点的不需要通知自己审批) */
          const fromOthers = newItems.filter((p) => p.requesterId !== myUserId.value)
          if (fromOthers.length > 0) {
            notifyPending(fromOthers, meta.value.name || '一起听')
          }
        }
      }
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

      /* 系统通知 —— 跳过自己发的消息;@你 的消息会绕过节流强提示。
       * 仅文本/表情/贴纸触发通知,系统消息走 CHAT_SYSTEM 分支不打扰。 */
      if (
        meta.value &&
        msg.from?.userId &&
        msg.from.userId !== myUserId.value &&
        msg.type !== 'system'
      ) {
        const mentions = (msg.meta?.mentions || '').split(',').filter(Boolean)
        const mentionedSelf = !!myUserId.value && mentions.includes(myUserId.value)
        notifyChat(msg, meta.value.name || '一起听', { mentionedSelf })
      }
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
      case ErrorCodes.KICK_COOLDOWN: {
        const remaining = Number(err.data?.remaining) || 0
        if (remaining <= 0) return '你已被移出该房间,稍后再试'
        const mm = Math.floor(remaining / 60)
        const ss = remaining % 60
        const hint = mm > 0 ? `${mm} 分 ${ss} 秒` : `${ss} 秒`
        return `你已被移出该房间,${hint}后才能重新加入`
      }
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
    /* 清掉还在节流缓冲里的通知 —— 否则换房后旧房间的待推消息会顶着新房名弹 */
    resetNotifierBuffers()
    if (options.restorePlaylist && playlistBeforeRoom) {
      const localUserStore = LocalUserDetailStore()
      localUserStore.replaceSongList(playlistBeforeRoom)
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
    /* 关闭浮层 —— 任何离开房间路径(主动 leaveRoom / 被踢 / 房间被解散 /
     * mini 菜单退出)都应该关掉 overlay,避免显示空状态。 */
    overlayVisible.value = false
    clearAudioHooks()
    stopPingLoop()
    stopDriftLoop()
  }

  /* ============================================================
   *  播放控制（host / admin+ 调用）
   * ============================================================ */

  /**
   * 播放(仅在自己有控制权时生效)—— "自己率先响应,对方再跟上" 架构
   *
   * 流程:本地立即 ca.start() + 更新 current 锚点 + emit ctl:play。
   * 服务端 SYNC 回包时,host 自己识别 operatorId 跳过 applySnapshot,只做 drift 微调;
   * member 收到 SYNC 走完整 applySnapshot 跟上。
   *
   * 当前房间无歌时(current.song = null)直接 toast 不发命令。
   */
  function play(time?: number): void {
    if (!emitGuard()) return
    if (!current.song) {
      MessagePlugin.warning('当前房间还没有歌曲,请先选歌')
      return
    }
    const ca = ControlAudioStore()
    const t = time ?? ca.Audio.currentTime
    const nowServer = Date.now() + clockOffset
    /* 乐观更新 current 锚点 —— 让 drift 循环和 SYNC 回包看到一致状态 */
    current.isPlaying = true
    current.anchorPos = t
    current.anchorAt = nowServer
    /* 记录本地操作意图,陈旧 SYNC 不能反转 */
    lastLocalControlAt = nowServer
    lastLocalDesiredIsPlaying = true
    /* 本地立即播放,fire-and-forget;失败不阻塞 emit */
    void ca.start().catch(() => {})
    debouncedEmit(ClientEvents.CTL_PLAY, { time: t })
  }

  function pause(time?: number): void {
    if (!emitGuard()) return
    if (!current.song) return
    const ca = ControlAudioStore()
    const t = time ?? ca.Audio.currentTime
    const nowServer = Date.now() + clockOffset
    current.isPlaying = false
    current.anchorPos = t
    current.anchorAt = nowServer
    lastLocalControlAt = nowServer
    lastLocalDesiredIsPlaying = false
    /* 本地立即暂停,即时反馈 */
    void Promise.resolve(ca.stop()).catch(() => {})
    debouncedEmit(ClientEvents.CTL_PAUSE, { time: t })
  }

  function seek(time: number): void {
    if (!emitGuard()) return
    if (!current.song) return
    /* 乐观更新 + 陈旧 anchor 防御 ——
     *  1. 立即把本地 audio 移到目标位置,进度条不会"跳回"老位置;
     *  2. 同步更新 current 的 anchor,使 drift 循环看到与即将到来的 SYNC 一致;
     *  3. 记录 lastLocalSeekAt:在 seek 的 SYNC 回包到来前,丢弃任何 anchorAt 早于
     *     此时刻的非-seek SYNC(防止之前 ctl:play 的 SYNC 因排队后到达而把刚 seek
     *     的进度又拉回老位置)。
     * SYNC 回来后 applySnapshot 在 'seek' action 下会做一次精确对齐(forceAlign)。 */
    const ca = ControlAudioStore()
    if (ca.Audio.audio) {
      try {
        ca.Audio.audio.currentTime = time
      } catch {}
    }
    ca.setCurrentTime(time)
    const nowServer = Date.now() + clockOffset
    current.anchorPos = time
    current.anchorAt = nowServer
    lastLocalSeekAt = nowServer
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
    /* 带上当前 seq —— 服务端会做幂等检查:多 admin 同时点 next 只跳一首。
     * 没有 song 时也允许 skip(队列首播场景),不返回。 */
    debouncedEmit(ClientEvents.CTL_SKIP, { seq: current.seq })
  }

  /** 上一首 —— 与 skip 对称,共享列表模式按当前歌位置切前一首 */
  function previous(): void {
    if (!emitGuard()) return
    debouncedEmit(ClientEvents.CTL_PREV, { seq: current.seq })
  }

  function playQueueItem(itemId: string): void {
    if (!emitGuard()) return
    socket?.emit(ClientEvents.CTL_PLAY_QUEUE_ITEM, { itemId })
  }

  /**
   * 用户主动切歌时由 globaPlayList 调用 —— 标记"我正在本地加载这首歌"
   *
   * 防止 host 双击切歌后,server SYNC 回包到达,触发 ensureRoomSongLoadedAndSynced
   * 在 audio.src 暂时清空(playSong 内 removeAttribute('src') + load() 期间)
   * 看到 hasLoadedAudio=false 时再次进入 song-load 分支,与正在跑的 playSong 互相
   * 抢占,产生死循环("下一首加载完成又回到上一首"循环)。
   *
   * 用 source::songmid 作为 key,与 ensureRoom 内部使用的 loadingSongKey 共用,
   * SYNC handler 看到 loadingSongKey === target 直接走 applySnapshot 路径。
   */
  function markLocalLoadingSong(source: string | null, songmid?: string | null): void {
    if (!source || !songmid) {
      hostUserLoadingKey = null
      return
    }
    hostUserLoadingKey = `${source}::${songmid}`
  }

  /**
   * 仅当当前 hostUserLoadingKey 等于指定歌曲时才清掉 —— 防止用户连续切歌时,
   * 前一次 playSong 的 finally 误清掉后一次刚标记的 key。
   */
  function clearLocalLoadingSongIfMatch(source: string, songmid: string): void {
    if (hostUserLoadingKey === `${source}::${songmid}`) {
      hostUserLoadingKey = null
    }
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

  /**
   * admin+ 重排队列 —— 传入新的 itemId 顺序数组
   *
   * 服务端会严格校验数组与当前 queue 的完整匹配,不匹配返回 INVALID_PAYLOAD,
   * 客户端通过下一次 QUEUE_UPDATE 自然回到服务端权威顺序。
   *
   * 仅用于"全量重排"场景(如拖拽 drag-and-drop)。"上下移动一格"用更轻量的
   * moveQueueItem 节省带宽,大队列(7000+)差距很明显。
   */
  function reorderQueue(itemIds: string[]): void {
    if (!canControl.value) return
    if (!Array.isArray(itemIds) || itemIds.length === 0) return
    socket?.emit(ClientEvents.QUEUE_REORDER, { itemIds })
  }

  /**
   * admin+ 单项移动 patch —— { itemId, toIndex }
   *
   * 比 reorderQueue 的全量数组省带宽:7000 项 list 全量 ~200KB,patch ~50B。
   * 服务端验证 itemId 存在 + toIndex 合法,通过则广播 QUEUE_UPDATE。
   */
  function moveQueueItem(itemId: string, toIndex: number): void {
    if (!canControl.value) return
    if (typeof itemId !== 'string' || typeof toIndex !== 'number') return
    socket?.emit(ClientEvents.QUEUE_MOVE, { itemId, toIndex })
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
    content: string,
    meta?: Record<string, string>
  ): void {
    if (!isInRoom.value) return
    if (!content) return
    /* meta 仅在有内容时透传,空对象不发,避免后端做无意义的白名单过滤 */
    const payload: { type: typeof type; content: string; meta?: Record<string, string> } = {
      type,
      content
    }
    if (meta && Object.keys(meta).length > 0) payload.meta = meta
    socket?.emit(ClientEvents.CHAT_SEND, payload)
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
   *  - 切歌响应也由 SYNC handler 单点驱动 —— 之前的 watch(current.song) 与
   *    SYNC handler 并发调 ensureRoomSongLoadedAndSynced 会触发"切到新歌又跳回"的竞态
   *  - **不再** 监听 host 本地 list 变化反复上传 queue —— 那会让 host 双击切歌时
   *    本地 list 被插入新歌后整体覆盖 server queue,把 member 加的歌全冲掉。
   *    queue 现在完全由 server 增量管理(初次 syncRoomContextFromLocal +
   *    ctl:queue-add / queue-request+approve)。
   */
  function startAudioHooks(): void {
    clearAudioHooks() // 防重
    /* 当前没有需要在房间内自动同步的本地状态。
     * 如果后续要加(比如本地歌词偏移、播放速率),都用显式命令上传,不要 watch 本地 store。 */
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
  async function syncRoomContextFromLocal(options: { queueOnly?: boolean } = {}): Promise<void> {
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

  function replaceLocalPlaylistFromQueue(
    items: QueueItem[],
    fallbackCurrent?: SongRef | null
  ): void {
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
    localUserStore.replaceSongList(songs)
  }

  async function ensureRoomSongLoadedAndSynced(
    snapshot: PlaybackSnapshot,
    options: { immediate?: boolean; forceAlign?: boolean } = {}
  ): Promise<void> {
    if (!snapshot.song) {
      loadingSongKey = null
      await applySnapshot(snapshot, { forceAlign: options.forceAlign })
      return
    }

    const targetKey = `${snapshot.song.source}::${snapshot.song.songmid}`

    /* 已经在加载这首歌(无论是 ensureRoom 自己还是 user-initiated playSong),
     * 不重启 playSong,只等加载完成期间应用快照。
     * 两个 key 故意分开 —— 避免一方的 finally 清掉另一方的标记导致死循环。 */
    if (loadingSongKey === targetKey || hostUserLoadingKey === targetKey) {
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

    /* 强力防御:globalPlayStatus 已经是 target song(playSong 内部 updatePlayerInfo
     * 改的)且 audio readyState >= HAVE_METADATA(setUrl 已生效),即便 audio.src
     * 暂时被 GlobalAudio watch 的 a.load() 重置看起来"空",我们也不应该再次进入
     * song-load 分支重启 playSong —— 否则会出现同一 URL 反复 setUrl 的死循环。 */
    if (sameLocalSong && ca.Audio.audio && ca.Audio.audio.readyState >= 1) {
      await applySnapshot(snapshot, { forceAlign: options.forceAlign })
      return
    }

    const token = ++roomSongApplyToken
    loadingSongKey = targetKey
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
    } finally {
      /* 仅当我们仍然是最后一个加载者时清掉 key —— 否则后来的加载会继续持有 */
      if (loadingSongKey === targetKey && token === roomSongApplyToken) {
        loadingSongKey = null
      }
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
    /* 不在这里做 seq 校验:
     *  - SYNC 路径:SYNC handler 已经在外层校验 seq + 更新 localSeq 到 payload.seq,
     *    再 fire-and-forget 调 ensureRoom → applySnapshot。如果这里再校验 seq <= localSeq
     *    会永远命中(snapshot.seq === localSeq),导致 member 端 ca.stop()/ca.start()
     *    永不执行,出现"host 暂停了但 member 没同步"。
     *  - drift 循环:snapshot === current,本身就是当前权威,不需要校验。
     *  - 无论被哪条路径调,applySnapshot 自身是幂等的(audio 已是 target 状态时 no-op)。
     */
    const ca = ControlAudioStore()
    // 1. 估算服务器"现在"
    const nowServer = Date.now() + clockOffset
    const elapsed = snapshot.isPlaying ? Math.max((nowServer - snapshot.anchorAt) / 1000, 0) : 0
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
    console.debug(`[lt] clock offset = ${clockOffset.toFixed(0)}ms (${samples.length} samples)`)
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
      if (localSongmid === undefined || String(localSongmid) !== String(current.song.songmid)) {
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
    /* reconnect 过渡期:client 已 connect 但 server 端 ROOM_RESUME/JOIN 还没把
     * data.roomCode 设上,如果此时让用户主动 emit 会触发 server 误报 PERMISSION_DENIED。
     * 等 ROOM_STATE 回来(isReconnecting=false)再放行。 */
    if (isReconnecting.value) return false
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

  /* 注入通知激活回调 —— 点击系统通知时把浮层拉开。
   * 用 configureNotifier 注入而不是 notifier 直接 import store,
   * 是为了避免 store -> notifier -> store 的循环依赖。 */
  configureNotifier({ onActivate: openOverlay })

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
    fullPlayVisible,

    // getters
    isInRoom,
    canControl,
    isOwner,

    // 浮层（叠加在 FullPlay 内部）
    openOverlay,
    closeOverlay,
    toggleOverlay,
    setFullPlayVisible,
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
    previous,
    onSongEnded,
    markLocalLoadingSong,
    clearLocalLoadingSongIfMatch,

    // 队列 / 点歌
    requestSong,
    addToQueue,
    approveSong,
    rejectSong,
    removeFromQueue,
    reorderQueue,
    moveQueueItem,

    // 角色 / 成员
    promoteAdmin,
    demoteAdmin,
    kick,

    // 聊天
    sendChat
  }
})
