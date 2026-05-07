import { dump as ymlDump, load as ymlLoad } from 'js-yaml'
import {
  getLatestRelease,
  getReleaseByTag,
  findAsset,
  fetchAssetText,
  downloadUrl,
  getRepo,
  type Release,
  type ReleaseAsset
} from './github.js'
import type { Env } from './worker.js'

const ASSET_FILE_RE = /\.(exe|dmg|zip|AppImage|deb|snap|blockmap|yml|yaml)$/i

const HAZEL_PATTERNS: Record<string, RegExp[]> = {
  win32: [/-win-x64-setup\.exe$/i, /-win-ia32-setup\.exe$/i, /-win-x64\.exe$/i],
  darwin: [/-(arm64|x64)\.dmg$/i, /\.dmg$/i],
  linux: [/-linux-x64\.AppImage$/i, /\.AppImage$/i]
}

interface UpdateInfoFile {
  url: string
  sha512: string
  size?: number
  blockMapSize?: number
}

interface UpdateInfo {
  version: string
  files: UpdateInfoFile[]
  path?: string
  sha512?: string
  releaseDate?: string
  [k: string]: unknown
}

function getWindowsFilePriority(url: string): number {
  if (/win-x64-setup\.exe$/i.test(url)) return 0
  if (/win-ia32-setup\.exe$/i.test(url)) return 1
  if (/win-setup\.exe$/i.test(url)) return 2
  return 3
}

function reorderWindowsFiles(files: UpdateInfoFile[]): UpdateInfoFile[] {
  return [...files].sort((a, b) => getWindowsFilePriority(a.url) - getWindowsFilePriority(b.url))
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  try {
    if (path === '/' || path === '') {
      return await handleIndex(env, ctx)
    }

    if (path === '/latest.yml') return await handleLatest(env, ctx, 'latest.yml')
    if (path === '/latest-mac.yml') return await handleLatest(env, ctx, 'latest-mac.yml')
    if (path === '/latest-linux.yml') return await handleLatest(env, ctx, 'latest-linux.yml')

    const hazelMatch = path.match(/^\/update\/([^/]+)\/([^/]+)\/?$/)
    if (hazelMatch) {
      return await handleHazel(env, ctx, hazelMatch[1], hazelMatch[2])
    }

    if (path.startsWith('/') && !path.slice(1).includes('/')) {
      const file = decodeURIComponent(path.slice(1))
      if (ASSET_FILE_RE.test(file)) {
        return await handleAsset(env, ctx, file, request)
      }
    }

    return new Response('not found', { status: 404 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal error'
    return new Response(msg, { status: 500 })
  }
}

async function handleIndex(env: Env, ctx: ExecutionContext): Promise<Response> {
  const release = await getLatestRelease(env, ctx)
  const body = JSON.stringify(
    {
      service: 'ceru-update-server',
      runtime: 'cloudflare-workers',
      repo: getRepo(env),
      latest: {
        tag: release.tag_name,
        name: release.name,
        published_at: release.published_at,
        assets: release.assets.map((a) => ({ name: a.name, size: a.size }))
      },
      endpoints: {
        electronUpdater: {
          windows: '/latest.yml',
          macos: '/latest-mac.yml',
          linux: '/latest-linux.yml'
        },
        asset: '/<filename>',
        legacyHazel: '/update/{win32|darwin|linux}/{currentVersion}'
      }
    },
    null,
    2
  )
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60'
    }
  })
}

async function handleLatest(env: Env, ctx: ExecutionContext, name: string): Promise<Response> {
  const release = await getLatestRelease(env, ctx)

  if (name === 'latest-mac.yml') {
    const merged = await tryMergeMac(env, release)
    if (merged) return ymlResponse(merged)
  }

  const asset = findAsset(release, name)
  if (!asset) {
    return new Response(`${name} not in release ${release.tag_name}`, { status: 404 })
  }
  const yml = await fetchAssetText(env, asset)
  // electron-builder 26.x 配的 app-builder-bin@5.0.0-alpha 不会在 latest.yml 里写 blockMapSize,
  // 没有这个字段 electron-updater 不会走差分下载. 这里从 release.assets 查 .blockmap 文件 size 注入回去.
  const patched = injectBlockMapSizes(yml, release)
  return ymlResponse(patched)
}

function injectBlockMapSizes(yml: string, release: Release): string {
  let info: UpdateInfo
  try {
    info = ymlLoad(yml) as UpdateInfo
  } catch {
    return yml
  }
  if (!info || !Array.isArray(info.files)) return yml

  let mutated = false
  const reorderedFiles = reorderWindowsFiles(info.files)
  if (reorderedFiles.some((file, index) => file !== info.files[index])) {
    info.files = reorderedFiles
    mutated = true
  }

  for (const file of info.files) {
    if (!file || typeof file.url !== 'string') continue
    if (typeof file.blockMapSize === 'number') continue
    const blockmap = release.assets?.find((a) => a.name === `${file.url}.blockmap`)
    if (blockmap && typeof blockmap.size === 'number') {
      file.blockMapSize = blockmap.size
      mutated = true
    }
  }

  const x64File = info.files.find((f) => f.url.includes('x64'))
  if (x64File && (info.path !== x64File.url || info.sha512 !== x64File.sha512)) {
    info.path = x64File.url
    info.sha512 = x64File.sha512
    mutated = true
  }

  return mutated ? ymlDump(info, { lineWidth: -1 }) : yml
}

async function tryMergeMac(env: Env, release: Release): Promise<string | null> {
  const variants = [
    findAsset(release, 'latest-mac-x64.yml'),
    findAsset(release, 'latest-mac-arm64.yml')
  ].filter((a): a is ReleaseAsset => Boolean(a))

  if (variants.length < 2) return null

  const docs = await Promise.all(variants.map((a) => fetchAssetText(env, a)))
  const parsed = docs.map((d) => ymlLoad(d) as UpdateInfo)

  const seen = new Set<string>()
  const allFiles: UpdateInfoFile[] = []
  for (const p of parsed) {
    for (const f of p.files || []) {
      if (seen.has(f.url)) continue
      seen.add(f.url)
      allFiles.push(f)
    }
  }
  for (const f of allFiles) {
    if (typeof f.blockMapSize === 'number') continue
    const blockmap = release.assets?.find((a) => a.name === `${f.url}.blockmap`)
    if (blockmap && typeof blockmap.size === 'number') {
      f.blockMapSize = blockmap.size
    }
  }
  const merged: UpdateInfo = { ...parsed[0], files: allFiles }
  return ymlDump(merged, { lineWidth: -1 })
}

function ymlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
    }
  })
}

interface NormalizedRange {
  start: number
  end: number
}

interface AssetMetadata {
  size: number
  contentType: string
  etag?: string | null
  lastModified?: string | null
}

interface MultipartPart {
  range: NormalizedRange
  data: Uint8Array
}

interface UpstreamSegment {
  start: number
  end: number
  ranges: NormalizedRange[]
}

function isMultiRangeRequest(request: Request): boolean {
  const range = request.headers.get('Range')
  return Boolean(range?.includes(','))
}

function parseRangeHeader(rangeHeader: string, size: number): NormalizedRange[] | null {
  const match = rangeHeader.match(/^bytes=(.+)$/i)
  if (!match) return null

  const ranges: NormalizedRange[] = []
  for (const rawPart of match[1].split(',')) {
    const part = rawPart.trim()
    if (!part) return null

    const [startPart, endPart] = part.split('-', 2)
    let start: number
    let end: number

    if (!startPart) {
      const suffixLength = Number.parseInt(endPart, 10)
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
      start = Math.max(size - suffixLength, 0)
      end = size - 1
    } else {
      start = Number.parseInt(startPart, 10)
      if (!Number.isFinite(start) || start < 0) return null
      end = endPart ? Number.parseInt(endPart, 10) : size - 1
      if (!Number.isFinite(end)) return null
    }

    if (start >= size || end < start) return null
    ranges.push({ start, end: Math.min(end, size - 1) })
  }

  return ranges
}

function buildMultipartHeader(
  boundary: string,
  range: NormalizedRange,
  metadata: AssetMetadata
): Uint8Array {
  return new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: ${metadata.contentType}\r\nContent-Range: bytes ${range.start}-${range.end}/${metadata.size}\r\n\r\n`
  )
}

function buildMultipartFooter(boundary: string): Uint8Array {
  return new TextEncoder().encode(`\r\n--${boundary}--\r\n`)
}

function calculateMultipartContentLength(
  boundary: string,
  metadata: AssetMetadata,
  parts: MultipartPart[]
): number {
  if (parts.length === 0) return 0

  let total = 0
  for (const part of parts) {
    total += buildMultipartHeader(boundary, part.range, metadata).byteLength
    total += part.data.byteLength
    total += 2
  }
  total += boundary.length + 4
  return total
}

export function buildMultipartCompatibleChunks(
  boundary: string,
  metadata: AssetMetadata,
  parts: MultipartPart[]
): Uint8Array[] {
  const chunks: Uint8Array[] = []

  for (const part of parts) {
    chunks.push(buildMultipartHeader(boundary, part.range, metadata))
    chunks.push(part.data)
  }

  chunks.push(buildMultipartFooter(boundary))
  return chunks
}

async function fetchUpstream(
  url: string,
  method: 'GET' | 'HEAD',
  headers: Headers
): Promise<Response> {
  let target = url
  let upstream = await fetch(target, {
    method,
    headers,
    redirect: 'manual'
  })

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get('location')
    if (location) {
      target = location
      upstream = await fetch(target, {
        method,
        headers,
        redirect: 'follow'
      })
    }
  }

  return upstream
}

async function getAssetMetadata(url: string): Promise<AssetMetadata> {
  const headers = new Headers({ 'User-Agent': 'CeruMusic-UpdateServer' })
  let upstream = await fetchUpstream(url, 'HEAD', headers)

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  if (upstream.ok && contentLength) {
    return {
      size: Number.parseInt(contentLength, 10),
      contentType,
      etag: upstream.headers.get('etag'),
      lastModified: upstream.headers.get('last-modified')
    }
  }

  headers.set('Range', 'bytes=0-0')
  upstream = await fetchUpstream(url, 'GET', headers)
  const contentRange = upstream.headers.get('content-range') || ''
  const totalMatch = contentRange.match(/\/(\d+)$/)
  if (upstream.status !== 206 || !totalMatch) {
    throw new Error(`cannot determine asset size, upstream status ${upstream.status}`)
  }

  return {
    size: Number.parseInt(totalMatch[1], 10),
    contentType: upstream.headers.get('content-type') || contentType,
    etag: upstream.headers.get('etag'),
    lastModified: upstream.headers.get('last-modified')
  }
}

function buildAssetResponseHeaders(upstream: Response): Headers {
  const respHeaders = new Headers()
  const passThrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified'
  ]
  for (const h of passThrough) {
    const v = upstream.headers.get(h)
    if (v) respHeaders.set(h, v)
  }
  if (!respHeaders.has('accept-ranges')) respHeaders.set('Accept-Ranges', 'bytes')
  respHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400')
  return respHeaders
}

function rangeNotSatisfiable(size: number): Response {
  return new Response('range not satisfiable', {
    status: 416,
    headers: {
      'Content-Range': `bytes */${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    }
  })
}

function mergeRangesForUpstream(ranges: NormalizedRange[]): UpstreamSegment[] {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const maxGap = 64 * 1024
  const maxSegmentSize = 4 * 1024 * 1024
  const segments: UpstreamSegment[] = []

  let current: UpstreamSegment = {
    start: sorted[0].start,
    end: sorted[0].end,
    ranges: [sorted[0]]
  }

  for (let i = 1; i < sorted.length; i++) {
    const range = sorted[i]
    const nextEnd = Math.max(current.end, range.end)
    const gap = range.start - current.end - 1
    const nextSize = nextEnd - current.start + 1

    if (gap <= maxGap && nextSize <= maxSegmentSize) {
      current.end = nextEnd
      current.ranges.push(range)
      continue
    }

    segments.push(current)
    current = {
      start: range.start,
      end: range.end,
      ranges: [range]
    }
  }

  segments.push(current)
  return segments
}

async function handleMultiRangeRequest(url: string, request: Request): Promise<Response> {
  const rangeHeader = request.headers.get('Range')
  if (!rangeHeader) return new Response('missing range header', { status: 400 })

  const metadata = await getAssetMetadata(url)
  const ranges = parseRangeHeader(rangeHeader, metadata.size)
  if (!ranges?.length) return rangeNotSatisfiable(metadata.size)

  const boundary = `ceru-${crypto.randomUUID()}`

  if (request.method === 'HEAD') {
    const headHeaders = new Headers({
      'Content-Type': `multipart/byteranges; boundary=${boundary}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    })
    if (metadata.etag) headHeaders.set('ETag', metadata.etag)
    if (metadata.lastModified) headHeaders.set('Last-Modified', metadata.lastModified)
    return new Response(null, { status: 206, headers: headHeaders })
  }

  const baseHeaders = new Headers({ 'User-Agent': 'CeruMusic-UpdateServer' })
  for (const h of ['If-Range', 'If-Modified-Since', 'If-None-Match']) {
    const v = request.headers.get(h)
    if (v) baseHeaders.set(h, v)
  }

  const parts: MultipartPart[] = []
  const segments = mergeRangesForUpstream(ranges)
  for (const segment of segments) {
    const partHeaders = new Headers(baseHeaders)
    partHeaders.set('Range', `bytes=${segment.start}-${segment.end}`)
    const upstream = await fetchUpstream(url, 'GET', partHeaders)
    if (upstream.status !== 206) {
      throw new Error(`upstream range fetch failed with status ${upstream.status}`)
    }
    const data = new Uint8Array(await upstream.arrayBuffer())
    const expectedSegmentLength = segment.end - segment.start + 1
    if (data.byteLength !== expectedSegmentLength) {
      throw new Error(
        `segment size mismatch, expected ${expectedSegmentLength}, got ${data.byteLength}`
      )
    }

    for (const range of segment.ranges) {
      const offsetStart = range.start - segment.start
      const offsetEnd = range.end - segment.start + 1
      const partData = data.slice(offsetStart, offsetEnd)
      const expectedLength = range.end - range.start + 1
      if (partData.byteLength !== expectedLength) {
        throw new Error(
          `range size mismatch, expected ${expectedLength}, got ${partData.byteLength}`
        )
      }
      parts.push({ range, data: partData })
    }
  }

  const chunks = buildMultipartCompatibleChunks(boundary, metadata, parts)
  const responseHeaders = new Headers({
    'Content-Type': `multipart/byteranges; boundary=${boundary}`,
    'Content-Length': String(calculateMultipartContentLength(boundary, metadata, parts)),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400'
  })
  if (metadata.etag) responseHeaders.set('ETag', metadata.etag)
  if (metadata.lastModified) responseHeaders.set('Last-Modified', metadata.lastModified)

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      try {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    }
  })

  return new Response(body, { status: 206, headers: responseHeaders })
}

async function handleAsset(
  env: Env,
  _ctx: ExecutionContext,
  file: string,
  request: Request
): Promise<Response> {
  if (!file || file.includes('/') || file.includes('..') || file.startsWith('.')) {
    return new Response('bad request', { status: 400 })
  }

  // 尝试从文件名提取版本号 (例如 ceru-music-1.11.0-win-x64-setup.exe -> 1.11.0)
  const versionMatch = file.match(/(\d+\.\d+\.\d+)/)
  let release: Release | null = null

  if (versionMatch) {
    const version = versionMatch[1]
    // 优先尝试 v + 版本号的标签，因为项目规范通常带 v
    try {
      release = await getReleaseByTag(env, _ctx, `v${version}`)
    } catch {
      // 失败则尝试直接用版本号作为标签
      try {
        release = await getReleaseByTag(env, _ctx, version)
      } catch {
        // 都失败了则后面会回退到 latest
      }
    }
  }

  if (!release) {
    release = await getLatestRelease(env, _ctx)
  }

  const url = downloadUrl(env, release, file)

  if (isMultiRangeRequest(request)) {
    try {
      return await handleMultiRangeRequest(url, request)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(`upstream multi-range fetch failed: ${msg}`, { status: 502 })
    }
  }

  // 反向代理: Worker 拉 GitHub → 流式吐给客户端,绕开国内访问 github 困难的问题。
  // 仅转发跟范围下载/缓存校验相关的 header,避免泄漏客户端凭据。
  const upstreamHeaders = new Headers()
  for (const h of ['Range', 'If-Range', 'If-Modified-Since', 'If-None-Match']) {
    const v = request.headers.get(h)
    if (v) upstreamHeaders.set(h, v)
  }
  upstreamHeaders.set('User-Agent', 'CeruMusic-UpdateServer')

  let upstream: Response
  try {
    let target = url
    let first = await fetch(target, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
      redirect: 'manual'
    })
    if (first.status >= 300 && first.status < 400) {
      const loc = first.headers.get('location')
      if (loc) {
        target = loc
        // 第二跳 (实际 CDN) 才打开 CF 缓存,让边缘节点缓存最终的二进制.
        first = await fetch(target, {
          method: request.method === 'HEAD' ? 'HEAD' : 'GET',
          headers: upstreamHeaders,
          redirect: 'follow'
        })
      }
    }
    upstream = first
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`upstream fetch failed: ${msg}`, { status: 502 })
  }

  // 仅透传跟内容/缓存相关的 header,过滤掉上游的 Set-Cookie 等
  const respHeaders = buildAssetResponseHeaders(upstream)

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders
  })
}

function compareVer(a: string, b: string): number {
  const pa = a
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const pb = b
    .replace(/^v/, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = pa[i] || 0
    const bv = pb[i] || 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

async function handleHazel(
  env: Env,
  ctx: ExecutionContext,
  platform: string,
  version: string
): Promise<Response> {
  const patterns = HAZEL_PATTERNS[platform]
  if (!patterns) {
    return new Response('unsupported platform', { status: 400 })
  }

  const release = await getLatestRelease(env, ctx)
  const tag = release.tag_name.replace(/^v/, '')
  if (compareVer(tag, version) <= 0) {
    return new Response(null, { status: 204 })
  }

  let asset: ReleaseAsset | undefined
  for (const pat of patterns) {
    asset = release.assets?.find((a) => pat.test(a.name))
    if (asset) break
  }
  if (!asset) {
    return new Response('no matching asset', { status: 404 })
  }

  return new Response(
    JSON.stringify({
      url: asset.browser_download_url,
      name: release.tag_name,
      notes: release.body || '',
      pub_date: release.published_at
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=60'
      }
    }
  )
}
