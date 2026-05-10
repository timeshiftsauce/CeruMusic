/**
 * 前端版本的分享文案工具 —— 与后端 src/listen-together/share-text.ts 保持同步
 *
 * 用于：房间顶栏"分享"按钮直接生成文案放剪贴板（避免再调一次 /create）
 * 注意：与后端 buildShareText 输出完全一致，两边改时同步更新
 */

const SHARE_BASE_URL = 'https://cerumusic.top/r'

export function buildShareUrl(code: string): string {
  return `${SHARE_BASE_URL}/${code}`
}

export function buildShareText(nickname: string, code: string, appName = 'CeruMusic'): string {
  const safeNick = (nickname || '某位朋友').slice(0, 20)
  const url = buildShareUrl(code)
  return [
    `「一起听」${safeNick}邀请你一起听歌～`,
    `🎧 点击链接直达：${url}`,
    `或复制本条打开 ${appName} 加入：#${code}#`
  ].join('\n')
}

export function extractCodeFromShareText(text: string): string | null {
  if (typeof text !== 'string' || text.length === 0) return null
  const m = text.match(/#([A-Za-z0-9]{6})#/)
  if (!m) return null
  return m[1].toUpperCase()
}
