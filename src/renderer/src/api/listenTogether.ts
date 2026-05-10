/**
 * 一起听 REST API 客户端
 *
 * 走 ceru-backend 的 /api/listen-together/* 接口，
 * 复用项目自带的 Request 类（已封装 Logto 鉴权 + 错误处理）。
 *
 * 接口：
 *  - createRoom         POST /create
 *  - resolveRoom        POST /resolve     —— 兼容纯口令 / 整段分享文案
 *  - getRoomPreview     GET  /:code        —— 公开（无需登录）
 *  - getMyCurrentRoom   GET  /my/current   —— 查询自己当前所在房间
 */

import { Request, unwrap } from '@renderer/utils/request'
import type {
  CreateRoomResponse,
  RoomMode,
  RoomPreview
} from '@renderer/utils/listenTogether/types'
import config from '@common/api/config.json'

/**
 * ceru-backend 的 API 根地址 —— 与 share.ts 保持一致
 *
 * 后续如果引入开发模式切换可走 import.meta.env.DEV，
 * 目前先硬编码到生产，与 share.ts 同步处理。
 */
const API_URL = config.baseUrl[0].url

/** 单例 Request 实例 —— 避免每次调用重复创建 axios */
const request = new Request(API_URL)

const BASE = '/listen-together'

/* ============================================================
 *  接口入参 / 出参
 * ============================================================ */

export interface CreateRoomPayload {
  /** 房间模式 —— intimate / group */
  mode: RoomMode
  /** 房间名（intimate 模式可省略，自动取昵称） */
  name?: string
  /** 多人房间最大人数（仅 group 模式生效，2~50） */
  maxMembers?: number
}

export interface ResolveCodePayload {
  /** 6 位口令，或包含 #口令# 标记的整段分享文案 */
  code: string
}

/* ============================================================
 *  API 调用
 * ============================================================ */

/**
 * 创建房间
 *
 * 返回完整 RoomMeta + shareUrl + shareText（用于剪贴板分享）。
 * 创建后房主**还没加入**房间，需要紧接着用 socket 发 ROOM_JOIN 才算进房。
 */
export async function createRoom(payload: CreateRoomPayload): Promise<CreateRoomResponse> {
  const res = await request.post<CreateRoomResponse>(`${BASE}/create`, payload)
  return unwrap(res)
}

/**
 * 解析口令 / 分享文案
 *
 * 支持两种入参：
 *  - 纯 6 位口令：'A7K9MX'
 *  - 整段文案：'「一起听」xxx 邀请...#A7K9MX#'
 *
 * 后端会自动用 `#code#` 正则提取，找不到口令或房间不存在时返回 null。
 * 前端拿到 null 应给用户友好提示"口令无效或房间已过期"。
 */
export async function resolveRoom(payload: ResolveCodePayload): Promise<RoomPreview | null> {
  const res = await request.post<RoomPreview | null>(`${BASE}/resolve`, payload)
  return unwrap(res)
}

/**
 * 通过 GET 直接查询房间预览（用于 deep-link 落地页 / 协议跳转）
 *
 * 这个接口**不需要登录**，所以用普通 fetch 即可，避免无谓走鉴权流程。
 */
export async function getRoomPreview(code: string): Promise<RoomPreview | null> {
  try {
    const res = await fetch(`${API_URL}${BASE}/${encodeURIComponent(code)}`)
    if (!res.ok) return null
    const body = await res.json()
    // 后端响应格式 { data, code, success, message }
    return body?.data ?? null
  } catch {
    return null
  }
}

/**
 * 查询当前用户所在的房间
 *
 * 用途：客户端启动时检查"上次还没退出的房间"，弹"是否回到房间 XXX"提示。
 * 注意：仅在用户通过 socket joinRoom 后才会被记录；createRoom 不会写入此状态。
 */
export async function getMyCurrentRoom(): Promise<{
  code: string
  mode: RoomMode
  name: string
} | null> {
  const res = await request.get<{
    code: string
    mode: RoomMode
    name: string
  } | null>(`${BASE}/my/current`)
  return unwrap(res)
}
