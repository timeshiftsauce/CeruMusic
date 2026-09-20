import { assertResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

/** Data-only app links. No plugin source, private resource data, token or media URL. */
export function createShareDescriptor(input: any) {
  const ref = input.track
  assertResourceRef(ref)
  if (ref.kind !== 'track') throw new Error('只能分享歌曲资源')
  const data = {
    version: 1,
    track: { pluginId: ref.pluginId, providerId: ref.providerId, kind: 'track', id: ref.id },
    title: String(input.title || '').slice(0, 200),
    artists: (input.artists || []).slice(0, 12).map((name: any) => String(name).slice(0, 120))
  }
  const text = JSON.stringify(data)
  if (Buffer.byteLength(text) > 3072) throw new Error('分享信息过长')
  const id = 'v2_' + Buffer.from(text).toString('base64url')
  const url = 'cerumusic://share/' + id
  return { id, url, template: `${data.artists.join('、')}《${data.title}》 ${url}（在澜音中打开）` }
}

export function readShareDescriptor(id: string) {
  if (!/^v2_[A-Za-z0-9_-]{1,4096}$/.test(id)) throw new Error('分享链接格式错误')
  const data = JSON.parse(Buffer.from(id.slice(3), 'base64url').toString('utf8'))
  assertResourceRef(data.track)
  if (
    data.version !== 1 ||
    data.track.kind !== 'track' ||
    typeof data.title !== 'string' ||
    !Array.isArray(data.artists) ||
    data.artists.some((name: any) => typeof name !== 'string')
  )
    throw new Error('分享信息格式错误')
  const { pluginId, providerId, kind, id: resourceId } = data.track
  return {
    version: 1,
    track: { pluginId, providerId, kind, id: resourceId },
    title: data.title,
    artists: data.artists
  }
}
