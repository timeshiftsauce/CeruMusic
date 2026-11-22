import { randomUUID } from 'node:crypto'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import {
  assertResolveResult,
  type ResolveResult,
  type StreamTransformFactory
} from '@shiqianjiang/ceru-plugin-sdk'
import {
  openMediaStream,
  MediaRangeError,
  type MediaResponse
} from '@shiqianjiang/ceru-plugin-core/media'
import { requestNetworkStream, isPrivateAddress } from '@shiqianjiang/ceru-plugin-core/network'

type Success = Extract<ResolveResult, { ok: true }>
type Entry = {
  owner: string
  result: Success
  controller: AbortController
  expires: number
  remove: () => void
  transform?: StreamTransformFactory
}

export class PluginMediaRegistry {
  private entries = new Map<string, Entry>()
  private ports = new Map<string, Set<number>>()
  private runtimes = new Map<string, (id: string, signal: AbortSignal) => StreamTransformFactory | undefined>()
  private transformPermissions = new Map<string, () => Promise<void>>()
  private server?: Server
  private listening?: Promise<number>
  registerRuntime(owner: string, resolve: (id: string, signal: AbortSignal) => StreamTransformFactory | undefined, authorizeTransform?: () => Promise<void>): () => void {
    this.runtimes.set(owner,resolve)
    if (authorizeTransform) this.transformPermissions.set(owner, authorizeTransform)
    return ()=>{if(this.runtimes.get(owner)===resolve){this.runtimes.delete(owner);this.transformPermissions.delete(owner)}}
  }
  async prepare(owner: string, result: Success, signal: AbortSignal): Promise<Success> {
    assertResolveResult(result)
    signal.throwIfAborted()
    this.assertPlaybackUrl(owner, result.url)
    const url = new URL(result.url)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (!isIP(hostname) && !this.owns(owner, url)) {
      const addresses = await lookup(hostname, { all: true, verbatim: true })
      if (!addresses.length || addresses.some(row => isPrivateAddress(row.address)))
        throw Error('Media address is not an owned plugin service')
    }
    if (result.stream && 'transform' in result.stream) {
      const authorize = this.transformPermissions.get(owner)
      if (!authorize) throw Error('Plugin stream permission unavailable')
      await authorize()
    }
    signal.throwIfAborted()
    return result.stream
      ? { ok: true, url: this.register(owner, result, signal), expiresAt: result.expiresAt }
      : result
  }

  registerService(owner: string, port: number): () => void {
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
      throw Error('Invalid plugin service port')
    const ports = this.ports.get(owner) ?? new Set<number>()
    ports.add(port)
    this.ports.set(owner, ports)
    return () => {
      ports.delete(port)
      if (!ports.size) this.ports.delete(owner)
    }
  }
  private owns(owner: string, url: URL) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    return (
      ['127.0.0.1', 'localhost', '::1'].includes(hostname) &&
      !!this.ports.get(owner)?.has(Number(url.port || (url.protocol === 'https:' ? 443 : 80)))
    )
  }
  assertPlaybackUrl(owner: string, value: string): void {
    const url = new URL(value),
      hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (
      (hostname === 'localhost' ||
        hostname === 'localhost.' ||
        (isIP(hostname) && isPrivateAddress(hostname))) &&
      !this.owns(owner, url)
    )
      throw Error('Media address is not an owned plugin service')
  }
  register(
    owner: string,
    result: Success,
    signal: AbortSignal = new AbortController().signal,
    transform?: StreamTransformFactory
  ): string {
    signal.throwIfAborted()
    assertResolveResult(result)
    this.assertPlaybackUrl(owner, result.url)
    if (!result.stream) throw Error('Missing media stream specification')
    if ('transform' in result.stream && !transform && !this.runtimes.get(owner)?.(result.stream.transform,signal))
      throw Error('Plugin stream transform unavailable')
    this.prune()
    if (this.entries.size >= 256) throw Error('Too many active plugin media streams')
    const token = randomUUID(),
      controller = new AbortController()
    let expiry: ReturnType<typeof setTimeout> | undefined
    const remove = () => {
      clearTimeout(expiry)
      controller.abort(Error('Plugin media access revoked'))
      this.entries.delete(token)
      signal.removeEventListener('abort', remove)
    }
    const expires = Math.min(
      result.expiresAt ?? Date.now() + 6 * 60 * 60_000,
      Date.now() + 24 * 60 * 60_000
    )
    if (expires <= Date.now()) throw Error('Plugin media URL has expired')
    this.entries.set(token, {
      owner,
      result: structuredClone(result),
      controller,
      expires,
      remove,
      transform
    })
    signal.addEventListener('abort', remove, { once: true })
    expiry = setTimeout(remove, expires - Date.now())
    expiry.unref()
    return 'ceru-media://' + token
  }
  private token(url: string): string | undefined {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'ceru-media:' &&
        ['', '/'].includes(parsed.pathname) &&
        !parsed.search &&
        !parsed.hash &&
        /^[a-f0-9-]{36}$/.test(parsed.hostname)
        ? parsed.hostname
        : undefined
    } catch {
      return undefined
    }
  }
  has(url: string): boolean {
    this.prune()
    return this.entries.has(this.token(url) ?? '')
  }
  contentType(url: string): string | undefined {
    this.prune()
    return this.entries.get(this.token(url) ?? '')?.result.stream?.contentType
  }
  private prune() {
    for (const entry of this.entries.values()) if (entry.expires <= Date.now()) entry.remove()
  }
  async open(url: string, range?: string, signal?: AbortSignal): Promise<MediaResponse> {
    this.prune()
    const entry = this.entries.get(this.token(url) ?? '')
    if (!entry) throw Error('Plugin media token is unavailable')
    const lifetime = signal
      ? AbortSignal.any([signal, entry.controller.signal])
      : entry.controller.signal
    return openMediaStream(
      entry.result.stream!,
      (upstreamRange, requestSignal) =>
        requestNetworkStream(
          {
            url: entry.result.url,
            headers: {
              ...entry.result.requestHeaders,
              ...(upstreamRange ? { Range: upstreamRange } : {})
            }
          },
          (target) => this.owns(entry.owner, target),
          requestSignal
        ),
      { range, signal: lifetime, transform: entry.transform ?? ('transform' in entry.result.stream! ? this.runtimes.get(entry.owner)?.(entry.result.stream!.transform,lifetime) : undefined) }
    )
  }
  async handle(request: Request, rendererOrigin?: string): Promise<Response> {
    const origin = request.headers.get('origin')
    if (origin && origin !== rendererOrigin && origin !== 'file://' && origin !== 'null')
      return new Response(null, { status: 403 })
    const headers = new Headers()
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers })
    if (!this.has(request.url)) return new Response(null, { status: 404, headers })
    try {
      const result = await this.open(
        request.url,
        request.headers.get('range') ?? undefined,
        request.signal
      )
      for (const [key, value] of Object.entries(result.headers)) headers.set(key, value)
      if (request.method === 'HEAD') {
        result.body.destroy()
        return new Response(null, { status: result.status, headers })
      }
      return new Response(Readable.toWeb(result.body) as ReadableStream<Uint8Array>, {
        status: result.status,
        headers
      })
    } catch (error) {
      if (error instanceof MediaRangeError) {
        if (error.length !== undefined) headers.set('Content-Range', 'bytes */' + error.length)
        return new Response(null, { status: 416, headers })
      }
      return new Response(null, { status: 502, headers })
    }
  }
  async serve(url: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405)
      response.end()
      return
    }
    if (!this.has(url)) {
      response.writeHead(404)
      response.end()
      return
    }
    const controller = new AbortController()
    const cancel = () => controller.abort()
    response.once('close', cancel)
    try {
      const result = await this.open(url, request.headers.range, controller.signal)
      response.writeHead(result.status, result.headers)
      if (request.method === 'HEAD') {
        result.body.destroy()
        response.end()
        return
      }
      await pipeline(result.body, response)
    } catch (error) {
      if (response.headersSent) {
        response.destroy()
        return
      }
      response.writeHead(
        error instanceof MediaRangeError ? 416 : 502,
        error instanceof MediaRangeError && error.length !== undefined
          ? { 'Content-Range': 'bytes */' + error.length }
          : {}
      )
      response.end()
    } finally {
      response.removeListener('close', cancel)
    }
  }
  /** Private loopback endpoint for existing download workers; it uses the same token and decoder. */
  async downloadUrl(url: string): Promise<string> {
    const token = this.token(url)
    if (!token || !this.has(url)) throw Error('Plugin media token is unavailable')
    this.listening ??= new Promise<number>((resolve, reject) => {
      const server = (this.server = createServer((request, response) => {
        const match = /^\/media\/([a-f0-9-]{36})$/.exec(request.url ?? '')
        if (!match || !['GET', 'HEAD'].includes(request.method ?? '')) {
          response.writeHead(404)
          response.end()
          return
        }
        void this.serve('ceru-media://' + match[1], request, response)
      }))
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.unref()
        resolve((server.address() as { port: number }).port)
      })
    }).catch((error) => {
      this.listening = undefined
      throw error
    })
    const port = await this.listening
    if (!this.has(url)) throw Error('Plugin media token is unavailable')
    return `http://127.0.0.1:${port}/media/${token}`
  }
  revoke(owner: string) {
    for (const entry of this.entries.values()) if (entry.owner === owner) entry.remove()
    this.ports.delete(owner)
  }
  dispose() {
    for (const entry of this.entries.values()) entry.remove()
    this.ports.clear()
    this.runtimes.clear()
    this.transformPermissions.clear()
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = undefined
    this.listening = undefined
  }
}

export const pluginMedia = new PluginMediaRegistry()
export const isPluginMediaUrl = (url: string) => url.startsWith('ceru-media:')
