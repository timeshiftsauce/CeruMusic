import {
  app,
  ipcMain,
  shell,
  utilityProcess,
  type BrowserWindow,
  type UtilityProcess
} from 'electron'
import { join } from 'node:path'
import { stat, open } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { localMediaPath } from '../services/musicSdk/localSource'
import { localMusicIndexService } from '../services/LocalMusicIndex'
import { musicCacheService } from '../services/musicCache'
import { normPath } from '../utils/fileUtils'

async function audioPath(url: string) {
  if (url.startsWith('ceru-local:')) {
    const file = await localMediaPath(url)
    if (file) return file
  } else {
    const file = fileURLToPath(url)
    if (
      localMusicIndexService.getStatByPath(normPath(file) || file) ||
      localMusicIndexService.getStatByPath(file) ||
      musicCacheService.hasCachedAudioFile(file)
    )
      return file
  }
  throw Error('本地曲目不可用')
}
import { KaraokeModel } from '../services/karaokeModel'
import { karaokePacks, type PackId, type SeparatedAudio } from '../../common/karaoke'

let attachWindow: ((window: BrowserWindow) => void) | undefined

export function registerKaraoke(window: BrowserWindow) {
  if (attachWindow) {
    attachWindow(window)
    return
  }
  let owner = window
  const models = karaokePacks.map(
    (pack) =>
      new KaraokeModel(pack, (state) => {
        if (!owner.isDestroyed()) owner.webContents.send('karaoke:state', state)
      })
  )
  function get(id: PackId) {
    const model = models.find((m) => m.pack.id === id)
    if (!model) throw Error('未知资源包')
    return model
  }
  let loadedPack: PackId | undefined
  let worker: UtilityProcess | undefined
  let sequence = 0
  const jobs = new Map<
    number,
    { resolve(value: SeparatedAudio): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >()
  const stop = (error = Error('伴唱处理已结束')) => {
    const previous = worker
    worker = undefined
    previous?.kill()
    for (const job of jobs.values()) {
      clearTimeout(job.timer)
      job.reject(error)
    }
    jobs.clear()
  }
  const handle = (name: string, fn: (...args: any[]) => unknown) => {
    ipcMain.handle('karaoke:' + name, (event, ...args) => {
      if (
        owner.isDestroyed() ||
        event.sender !== owner.webContents ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw Error('无效的伴唱请求')
      return fn(...args)
    })
  }
  handle('status', () =>
    Promise.all(
      models.map(async (model) => {
        await model.initialized
        return model.state
      })
    )
  )
  handle('download', (id: PackId) => get(id).start())
  handle('pause', (id: PackId) => get(id).pause())
  handle('cancel', (id: PackId, keepRecord = true) => get(id).cancel(keepRecord))
  handle('forget', (id: PackId) => get(id).forget())
  handle('open-location', async (id: PackId) => {
    const model = get(id)
    await model.initialized
    if (model.state.phase !== 'ready') return
    const error = await shell.openPath(model.directory)
    if (error) throw Error(error)
  })
  handle('remove', (id: PackId) =>
    get(id).remove(async () => {
      if (!worker || loadedPack !== id) return
      const child = worker
      await new Promise<void>((resolve, reject) => {
        const exited = () => {
          clearTimeout(timer)
          resolve()
        }
        const timer = setTimeout(() => {
          child.removeListener('exit', exited)
          reject(Error('伴唱引擎还在退出，请重试卸载'))
        }, 5000)
        child.once('exit', exited)
        stop()
      })
    })
  )
  handle('release', () => stop())
  handle('file-size', async (url: string) => (await stat(await audioPath(url))).size)
  handle('read-file', async (url: string, start: number, end: number) => {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end <= start ||
      end - start > 4 * 1024 * 1024
    )
      throw Error('音频读取范围无效')
    const f = await open(await audioPath(url), 'r')
    try {
      const buffer = Buffer.alloc(end - start)
      const { bytesRead } = await f.read(buffer, 0, buffer.length, start)
      if (bytesRead !== buffer.length) throw Error('本地音频读取不完整')
      return buffer
    } finally {
      await f.close()
    }
  })
  handle('separate', async (packId: PackId, samples: Float32Array[], sampleRate: number) => {
    const model = get(packId)
    await model.initialized
    if (!model.usable || jobs.size >= 4) throw Error('伴唱引擎尚未就绪')
    if (
      sampleRate !== 44100 ||
      !Array.isArray(samples) ||
      samples.length !== 2 ||
      !samples.every(
        (ch) =>
          ch instanceof Float32Array &&
          ch.length === samples[0].length &&
          ch.length > 0 &&
          ch.length <= sampleRate * 8
      )
    )
      throw Error('无效的音频片段')
    if (loadedPack !== packId) stop()
    if (!worker) {
      loadedPack = packId
      const child = utilityProcess.fork(
        join(__dirname, 'karaokeWorker.js'),
        [packId, model.directory],
        { serviceName: 'CeruMusic Karaoke' }
      )
      worker = child
      child.on('message', ({ id, output, error }) => {
        const job = jobs.get(id)
        if (!job || worker !== child) return
        jobs.delete(id)
        clearTimeout(job.timer)
        if (error) job.reject(Error(error))
        else job.resolve(output)
      })
      child.once('exit', () => {
        if (worker === child) stop(Error('伴唱引擎意外退出'))
      })
    }
    const id = ++sequence
    return new Promise<SeparatedAudio>((resolve, reject) => {
      const timer = setTimeout(() => stop(Error('伴唱推理超时')), 25000)
      jobs.set(id, { resolve, reject, timer })
      try {
        worker!.postMessage({ id, samples, sampleRate })
      } catch (error) {
        clearTimeout(timer)
        jobs.delete(id)
        reject(error)
      }
    })
  })
  attachWindow = (current) => {
    owner = current
    const stopIfCurrent = () => {
      if (owner === current) stop()
    }
    current.webContents.on('render-process-gone', stopIfCurrent)
    current.once('closed', stopIfCurrent)
  }
  attachWindow(window)
  app.once('before-quit', () => stop())
}
