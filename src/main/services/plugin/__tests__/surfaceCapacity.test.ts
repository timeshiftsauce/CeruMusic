import { expect, test } from '@jest/globals'
import { SurfaceCapacity } from '../shared/surfaceCapacity'

test('pending mounts reserve independent per-plugin slot and page capacities', async () => {
  const capacity = new SurfaceCapacity()
  let resume!: () => void
  const pending = new Promise<void>((resolve) => {
    resume = resolve
  })
  const mount = async (slot?: string) => {
    const release = capacity.reserve(slot)
    await pending
    return release
  }
  const slot = 'playlist.header.actions'
  const slots = Array.from({ length: 200 }, () => mount(slot))
  const pages = Array.from({ length: 16 }, () => mount())
  await expect(mount(slot)).rejects.toThrow('槽位')
  await expect(mount()).rejects.toThrow('页面')
  expect(() => capacity.reserve('home.header')).not.toThrow()
  expect(() => new SurfaceCapacity().reserve(slot)).not.toThrow()
  resume()
  const [release] = await Promise.all(slots)
  const [releasePage] = await Promise.all(pages)
  release()
  release()
  releasePage()
  await expect(mount(slot)).resolves.toBeInstanceOf(Function)
  await expect(mount(slot)).rejects.toThrow('槽位')
  await expect(mount()).resolves.toBeInstanceOf(Function)
  capacity.stop()
  await expect(mount('home.header')).rejects.toThrow('已停止')
})
