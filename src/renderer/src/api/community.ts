/**
 * 社区接口客户端
 *
 * 与后端 src/community/* 对齐。所有写操作都走 unwrap,把 nest 的 { code, data } 解出来。
 */
import { Request, unwrap } from '@renderer/utils/request'
import config from '@common/api/config.json'

const API_URL = config.baseUrl[0].url
const request = new Request(API_URL)

const BASE = '/community'

/** 帖子图片 —— 上传时记录宽高,前端可立即设 aspect-ratio 渲染骨架 */
export interface PostImage {
  url: string
  /** 上传后存的原图宽度(px) */
  w: number
  /** 上传后存的原图高度(px) */
  h: number
}

/** 兼容旧帖子: 老客户端只存 string URL,无宽高 */
export type PostImageOrUrl = PostImage | string

/** 帖子附件 —— 服务端透传,只校验形状 */
export interface PostAttachment {
  type: 'song' | 'playlist'
  /** type=song 时整首歌的元数据 */
  song?: Record<string, any>
  /** type=playlist 时 */
  listId?: string
  name?: string
  cover?: string
  songCount?: number
  preview?: Array<Record<string, any>>
}

export interface CommunityPost {
  id: string
  userId: string
  username: string
  userAvatar: string | null
  content: string
  /** 新格式 {url,w,h};兼容老格式 string */
  images: PostImageOrUrl[]
  attachment: PostAttachment | null
  likeCount: number
  commentCount: number
  createdAt: string
  /** 当前登录用户是否已点赞 */
  liked: boolean
}

export interface CommunityComment {
  id: string
  postId: string
  userId: string
  username: string
  userAvatar: string | null
  content: string
  /** 父评论 id —— null = 一级评论 */
  parentId: string | null
  /** "回复 @某某"显示用 */
  replyToUsername: string | null
  /** 点赞数 */
  likeCount: number
  /** 当前用户是否已点赞(后端拼装) */
  liked: boolean
  createdAt: string
}

export interface ListResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export const communityAPI = {
  /** 上传图片得到 URL + 宽高,前端拿到再发帖 */
  uploadImage(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    return unwrap<PostImage>(request.post(`${BASE}/upload-image`, fd))
  },

  createPost(payload: {
    content: string
    images?: PostImageOrUrl[]
    attachment?: PostAttachment
  }) {
    return unwrap<CommunityPost>(request.post(`${BASE}/posts`, payload))
  },

  listPosts(params: {
    sort?: 'latest' | 'recommend'
    page?: number
    pageSize?: number
    userId?: string
  }) {
    return unwrap<ListResult<CommunityPost>>(request.get(`${BASE}/posts`, { params }))
  },

  getPost(id: string) {
    return unwrap<CommunityPost>(request.get(`${BASE}/posts/${id}`))
  },

  deletePost(id: string) {
    return unwrap<{ ok: boolean }>(request.delete(`${BASE}/posts/${id}`))
  },

  toggleLike(id: string) {
    return unwrap<{ liked: boolean }>(request.post(`${BASE}/posts/${id}/like`, {}))
  },

  listComments(id: string, page = 1, pageSize = 20) {
    return unwrap<ListResult<CommunityComment>>(
      request.get(`${BASE}/posts/${id}/comments`, { params: { page, pageSize } })
    )
  },

  createComment(payload: {
    postId: string
    content: string
    parentId?: string
    replyToUsername?: string
  }) {
    return unwrap<CommunityComment>(request.post(`${BASE}/comments`, payload))
  },

  deleteComment(id: string) {
    return unwrap<{ ok: boolean }>(request.delete(`${BASE}/comments/${id}`))
  },

  toggleCommentLike(id: string) {
    return unwrap<{ liked: boolean }>(request.post(`${BASE}/comments/${id}/like`, {}))
  },

  report(payload: { postId: string; reason: string }) {
    return unwrap<{ ok: boolean; already?: boolean; autoOffline?: boolean }>(
      request.post(`${BASE}/report`, payload)
    )
  }
}
