import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, net } from 'electron'
import { buildMirrorUrl, probeMirrors } from '../autoUpdate'
import { configManager } from './ConfigManager'
import {
  packBytes,
  type KaraokePack,
  type ModelFile,
  type ModelDownload
} from '../../common/karaoke'

interface DownloadRecord {
  createdAt: number
  hidden?: boolean
  phase?: 'failed' | 'cancelled'
  message?: string
}

async function size(path: string) {
  return (await stat(path).catch(() => null))?.size ?? 0
}
async function valid(path: string, file: ModelFile) {
  if ((await size(path)) !== file.bytes) return false
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex') === file.sha256
}

export class KaraokeModel {
  readonly directory: string
  state: ModelDownload
  private readonly historyKey: string
  private controller?: AbortController
  private job?: Promise<void>
  private removing = false
  readonly initialized: Promise<void>
  constructor(
    readonly pack: KaraokePack,
    private changed: (state: ModelDownload) => void
  ) {
    this.directory = join(app.getPath('userData'), 'models', 'karaoke', pack.id)
    this.historyKey = 'karaoke.download.' + pack.id
    this.state = { id: pack.id, phase: 'absent', bytes: 0, message: '', createdAt: 0 }
    this.initialized = this.restore().catch(() => this.set('failed', 0, '无法读取模型目录'))
  }
  private set(phase: ModelDownload['phase'], bytes = this.state.bytes, message = '', speed = 0) {
    this.state = { ...this.state, phase, bytes, message, speed }
    this.changed(this.state)
  }
  private saveRecord(record: DownloadRecord | null) {
    configManager.set(this.historyKey, record)
    this.state = {
      ...this.state,
      createdAt: record?.createdAt ?? 0,
      historyHidden: record?.hidden
    }
  }
  private async restore() {
    const record = configManager.get<DownloadRecord | null>(this.historyKey, null)
    let installed = 0,
      bytes = 0,
      updatedAt = 0
    for (const file of this.pack.files) {
      const path = join(this.directory, file.name)
      if (await valid(path, file)) {
        bytes += file.bytes
        installed++
        updatedAt = Math.max(updatedAt, (await stat(path)).mtimeMs)
        continue
      }
      const partial = await stat(path + '.part').catch(() => null)
      if (partial) {
        bytes += partial.size
        updatedAt = Math.max(updatedAt, partial.mtimeMs)
      }
    }
    this.state.createdAt = record?.createdAt || updatedAt
    this.state.historyHidden = record?.hidden
    const phase =
      installed === this.pack.files.length
        ? 'ready'
        : (record?.phase ?? (bytes || record?.createdAt ? 'paused' : 'absent'))
    this.set(phase, bytes, phase === 'failed' ? record?.message : undefined)
  }
  async start() {
    await this.initialized
    if (this.job || this.removing || this.state.phase === 'ready') return
    const { phase, createdAt, historyHidden } = this.state
    this.saveRecord({
      createdAt: phase === 'cancelled' || historyHidden ? Date.now() : createdAt || Date.now()
    })
    const controller = new AbortController()
    this.controller = controller
    this.job = this.fetchPack(controller.signal)
      .catch((error) => {
        if (controller.signal.aborted) {
          this.set('paused')
          return
        }
        const message = String(error.message ?? error)
        this.saveRecord({ createdAt: this.state.createdAt, phase: 'failed', message })
        this.set('failed', this.state.bytes, message)
      })
      .finally(() => {
        this.job = undefined
        this.controller = undefined
      })
  }
  async pause() {
    this.controller?.abort()
    await this.job
  }
  get usable() {
    return this.state.phase === 'ready' && !this.removing
  }
  async forget() {
    await this.initialized
    const { phase, createdAt, message } = this.state
    if (phase !== 'ready' && phase !== 'failed' && phase !== 'cancelled') return
    this.saveRecord({
      createdAt,
      hidden: true,
      phase: phase === 'ready' ? undefined : phase,
      message
    })
    this.changed(this.state)
  }
  async cancel(keepRecord: boolean) {
    await this.initialized
    if (!['probing', 'downloading', 'verifying', 'paused'].includes(this.state.phase)) return
    await this.clearFiles(keepRecord)
  }
  async remove(beforeDelete?: () => Promise<void>) {
    await this.initialized
    await this.clearFiles(false, beforeDelete)
  }
  private async clearFiles(keepRecord: boolean, beforeDelete?: () => Promise<void>) {
    if (this.removing) return
    this.removing = true
    try {
      await this.pause()
      await beforeDelete?.()
      for (const file of this.pack.files) {
        const path = join(this.directory, file.name)
        await rm(path, { force: true })
        await rm(path + '.part', { force: true })
      }
      this.saveRecord(keepRecord ? { createdAt: this.state.createdAt, phase: 'cancelled' } : null)
      this.set(keepRecord ? 'cancelled' : 'absent', 0)
    } finally {
      this.removing = false
    }
  }
  private async fetchPack(signal: AbortSignal) {
    this.set('probing')
    await mkdir(this.directory, { recursive: true })
    const mirrors = (await probeMirrors(undefined, signal)).sort(
      (a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity)
    )
    let finished = 0
    for (const file of this.pack.files) {
      const path = join(this.directory, file.name)
      if (!(await valid(path, file))) {
        let lastError = '没有可用的下载线路'
        let installed = false
        for (const mirror of mirrors) {
          signal.throwIfAborted()
          try {
            const partial = path + '.part'
            if ((await size(partial)) > file.bytes) await rm(partial, { force: true })
            if ((await size(partial)) !== file.bytes) {
              await this.transfer(
                buildMirrorUrl(mirror.url, this.pack.base + file.name),
                partial,
                file.bytes,
                finished,
                signal
              )
            }
            this.set('verifying', finished + file.bytes)
            if (!(await valid(partial, file))) {
              await rm(partial, { force: true })
              throw Error('模型校验失败')
            }
            signal.throwIfAborted()
            await rename(partial, path)
            installed = true
            break
          } catch (error) {
            signal.throwIfAborted()
            lastError = error instanceof Error ? error.message : String(error)
          }
        }
        if (!installed) throw Error(lastError)
      }
      finished += file.bytes
    }
    signal.throwIfAborted()
    this.set('ready', packBytes(this.pack))
  }
  private async transfer(
    url: string,
    partial: string,
    total: number,
    finished: number,
    signal: AbortSignal
  ) {
    let bytes = await size(partial)
    const idle = new AbortController()
    const timedSignal = AbortSignal.any([signal, idle.signal])
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => idle.abort(), 15000)
    }
    arm()
    try {
      const response = await net.fetch(url, {
        headers: bytes ? { Range: 'bytes=' + bytes + '-' } : {},
        signal: timedSignal
      })
      const range = response.headers.get('content-range')
      if (
        !response.ok ||
        !response.body ||
        response.headers.get('content-type')?.includes('text/html')
      )
        throw Error('线路未返回模型文件')
      if (response.status === 206 && range !== 'bytes ' + bytes + '-' + (total - 1) + '/' + total)
        throw Error('线路返回的文件范围不正确')
      if (response.status === 200) bytes = 0
      const length = response.headers.get('content-length')
      if (length && Number(length) !== total - bytes) throw Error('线路返回的文件大小不正确')
      const file = await open(partial, bytes ? 'a' : 'w')
      const reader = response.body.getReader()
      let notified = Date.now()
      let lastBytes = bytes
      try {
        this.set('downloading', finished + bytes)
        for (;;) {
          arm()
          const { value, done } = await reader.read()
          if (done) break
          if (bytes + value.length > total) throw Error('模型文件超出预期大小')
          await file.writeFile(value)
          bytes += value.length
          const now = Date.now()
          if (now - notified > 150) {
            this.set(
              'downloading',
              finished + bytes,
              '',
              ((bytes - lastBytes) * 1000) / (now - notified)
            )
            notified = now
            lastBytes = bytes
          }
        }
        if (bytes !== total) throw Error('模型下载中断')
        this.set('downloading', finished + bytes)
      } finally {
        await file.close()
        reader.releaseLock()
      }
    } finally {
      clearTimeout(timer!)
      idle.abort()
    }
  }
}
