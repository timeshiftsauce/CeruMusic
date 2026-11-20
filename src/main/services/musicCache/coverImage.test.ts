import { test, expect } from '@jest/globals'
import { mkdtemp, mkdir, unlink, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCachedCover, coverId, coverUrl, parseCoverUrl } from './coverImage'

test('reuses a short identifier and only resolves the indexed cover', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ceru-cover-'))
  const covers = join(root, 'covers')
  const hash = 'edc6a437d8899813040a532c374157f6'
  const image = join(covers, `${hash}.jpg`)
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  await mkdir(covers)
  await writeFile(image, bytes)
  try {
    const urls = new Set(Array.from({ length: 10000 }, () => coverUrl(coverId('song-a'))))
    expect(urls.size).toBe(1)
    const url = [...urls][0]
    expect(parseCoverUrl(url)).toBe(coverId('song-a'))
    expect(coverId('song-b')).not.toBe(coverId('song-a'))
    expect(parseCoverUrl(url + '?path=x')).toBeUndefined()
    expect(await resolveCachedCover(covers, image, hash)).toMatchObject({ mime: 'image/jpeg' })
    expect(await resolveCachedCover(covers, image, 'another-key')).toBeNull()
    expect(await resolveCachedCover(covers, join(root, `${hash}.jpg`), hash)).toBeNull()
    expect(await resolveCachedCover(covers, join(covers, `${hash}.html`), hash)).toBeNull()
  } finally {
    await unlink(image)
    await rmdir(covers)
    await rmdir(root)
  }
})
