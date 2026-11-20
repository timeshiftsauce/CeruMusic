import { realpath } from 'node:fs/promises'
import { createHmac, randomBytes } from 'node:crypto'
import { basename, dirname, extname, resolve } from 'node:path'

const formats = new Map([
  ['.jpg', 'jpeg'], ['.jpeg', 'jpeg'], ['.png', 'png'],
  ['.gif', 'gif'], ['.webp', 'webp'], ['.bmp', 'bmp']
])

const secret = randomBytes(32)

export const coverId = (songKey: string) => createHmac('sha256', secret).update(songKey).digest('hex').slice(0, 32)
export const coverUrl = (id: string) => `ceru-cover://cache/${id}`
export const parseCoverUrl = (url: string) => /^ceru-cover:\/\/cache\/([a-f0-9]{32})$/.exec(url)?.[1]
export const isCoverExtension = (extension: string) => formats.has(extension.toLowerCase())

export async function resolveCachedCover(directory: string, file: string, hash: string) {
  const extension = extname(file)
  const format = formats.get(extension.toLowerCase())
  if (!format || basename(file, extension) !== hash || dirname(resolve(file)) !== resolve(directory)) return null
  const [folder, target] = await Promise.all([realpath(directory), realpath(file)])
  if (dirname(target) !== folder || basename(target) !== basename(file)) return null
  return { path: target, mime: `image/${format}` }
}
