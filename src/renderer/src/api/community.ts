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

/** 自伤信号命中时,后端随发布响应下发的援助信息(对应后端 action='review') */
export interface SelfHarmSupport {
  title: string
  text: string
  /** 援助热线,前端可直接做拨号链接 */
  hotline?: string
}

/** 发布类响应 —— 可能带一条援助提示,客户端应弹窗而不是静默忽略 */
export type PublishResult<T> = T & { support?: SelfHarmSupport }

export interface CommunityPost {
  id: string
  userId: string
  username: string
  userAvatar: string | null
  content: string
  /** 新格式 {url,w,h};兼容老格式 string */
  images: PostImageOrUrl[]
  attachment: PostAttachment | null
  /** IP 归属地快照(如 "福建·厦门"),旧数据为空 */
  ipLocation?: string | null
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
  /** IP 归属地快照(如 "福建·厦门"),旧数据为空 */
  ipLocation?: string | null
  /** 点赞数 */
  likeCount: number
  /** 当前用户是否已点赞(后端拼装) */
  liked: boolean
  createdAt: string
  /** 仅一级评论:该评论的回复总数 —— 首屏只带回前 50 条,剩下的点「加载更多回复」 */
  replyCount?: number
}

export interface ListResult<T> {
  items: T[]
  /** 评论列表里是「全部评论数(含回复)」,帖子列表里就是总数 */
  total: number
  page: number
  pageSize: number
  /** 仅评论列表返回:一级评论数 —— 分页单位是它,判断还有没有下一页要用它 */
  rootTotal?: number
  /** 仅评论列表返回:后端算好的"还有下一页" */
  hasMore?: boolean
}

export const communityAPI = {
  /** 上传图片得到 URL + 宽高,前端拿到再发帖 */
  uploadImage(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    return unwrap<PostImage>(request.post(`${BASE}/upload-image`, fd))
  },

  createPost(payload: { content: string; images?: PostImageOrUrl[]; attachment?: PostAttachment }) {
    return unwrap<PublishResult<CommunityPost>>(request.post(`${BASE}/posts`, payload))
  },

  listPosts(params: {
    sort?: 'latest' | 'recommend'
    page?: number
    pageSize?: number
    userId?: string
  }) {
    return unwrap<ListResult<CommunityPost>>(request.getPublic(`${BASE}/posts`, { params }))
  },

  getPost(id: string) {
    return unwrap<CommunityPost>(request.getPublic(`${BASE}/posts/${id}`))
  },

  /** 编辑自己的帖子 —— 字段与发帖一致,全量覆盖 */
  updatePost(
    id: string,
    payload: { content: string; images?: PostImageOrUrl[]; attachment?: PostAttachment }
  ) {
    return unwrap<PublishResult<CommunityPost>>(request.patch(`${BASE}/posts/${id}`, payload))
  },

  deletePost(id: string) {
    return unwrap<{ ok: boolean }>(request.delete(`${BASE}/posts/${id}`))
  },

  toggleLike(id: string) {
    return unwrap<{ liked: boolean }>(request.post(`${BASE}/posts/${id}/like`, {}))
  },

  listComments(id: string, page = 1, pageSize = 20) {
    return unwrap<ListResult<CommunityComment>>(
      request.getPublic(`${BASE}/posts/${id}/comments`, { params: { page, pageSize } })
    )
  },

  /** 某条一级评论的回复(按根评论分页,正序)—— 首屏由 listComments 各带 50 条 */
  listReplies(rootId: string, page = 1, pageSize = 50) {
    return unwrap<ListResult<CommunityComment>>(
      request.getPublic(`${BASE}/comments/${rootId}/replies`, { params: { page, pageSize } })
    )
  },

  createComment(payload: {
    postId: string
    content: string
    parentId?: string
    replyToCommentId?: string
    replyToUsername?: string
  }) {
    return unwrap<PublishResult<CommunityComment>>(request.post(`${BASE}/comments`, payload))
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
