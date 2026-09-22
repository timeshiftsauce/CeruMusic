import { Request, unwrap } from '@renderer/utils/request'
import { CERU_API_RESOURCE } from '@common/api/resources'

export type MessageCategory = 'all' | 'notice' | 'interaction' | 'comment'
export interface InboxMessage {
  id: string
  category: Exclude<MessageCategory, 'all'>
  kind: string
  title: string
  content: string
  format: 'plain' | 'markdown' | 'iframe'
  embedUrl: string | null
  maxHeight: number
  actorId: string | null
  actorName: string | null
  actorAvatar: string | null
  postId: string | null
  commentId: string | null
  cover: string | null
  createdAt: string
  read: boolean
}
export type UnreadCounts = Record<MessageCategory, number>
const request = new Request(CERU_API_RESOURCE)
export const notificationsAPI = {
  list: (category: MessageCategory, cursor?: string) =>
    unwrap<{ items: InboxMessage[]; nextCursor: string | null }>(
      request.get('/notifications', { params: { category, cursor, limit: 30 } })
    ),
  counts: () => unwrap<UnreadCounts>(request.get('/notifications/unread')),
  read: (ids: string[]) => unwrap<{ ids: string[] }>(request.post('/notifications/read', { ids })),
  clear: () => unwrap<{ count: number }>(request.delete('/notifications/read'))
}
