import { dump as ymlDump, load as ymlLoad } from 'js-yaml'
import {
  getLatestRelease,
  getReleaseByTag,
  findAsset,
  fetchAssetText,
  downloadUrl,
  absoluteDownloadUrl,
  getRepo,
  type Release,
  type ReleaseAsset
} from './github.js'
import type { Env } from './worker.js'

const ASSET_FILE_RE = /\.(exe|dmg|zip|AppImage|deb|snap|blockmap|yml|yaml)$/i

type ArchKey = 'x64' | 'ia32' | 'arm64'

// 按 (platform, arch) 维度精确匹配安装包文件名。
// 与 electron-builder.yml 的 artifactName 模板对应:
//   win:  ${name}-${version}-win-${arch}-setup.${ext}
//   mac:  ${name}-${version}-${arch}.${ext}
//   linux: ${name}-${version}-linux-${arch}.${ext}
const HAZEL_PATTERNS: Record<string, Partial<Record<ArchKey, RegExp>>> = {
  win32: {
    x64: /-win-x64-setup\.exe$/i,
    ia32: /-win-ia32-setup\.exe$/i,
    arm64: /-win-arm64-setup\.exe$/i
  },
  darwin: {
    x64: /-x64\.dmg$/i,
    arm64: /-arm64\.dmg$/i
  },
  linux: {
    x64: /-linux-x64\.AppImage$/i
  }
}

const DEFAULT_ARCH: Record<string, ArchKey> = {
  win32: 'x64',
  darwin: 'x64',
  linux: 'x64'
}

function normalizeArch(input: string | null | undefined): ArchKey | null {
  if (!input) return null
  const a = input.toLowerCase()
  if (a === 'arm64' || a === 'aarch64') return 'arm64'
  if (a === 'ia32' || a === 'x32' || a === 'x86' || a === 'i386') return 'ia32'
  if (a === 'x64' || a === 'amd64' || a === 'x86_64') return 'x64'
  return null
}

function readArchHint(request: Request, url: URL): ArchKey | null {
  return (
    normalizeArch(url.searchParams.get('arch')) ?? normalizeArch(request.headers.get('X-Arch'))
  )
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

    const archHint = readArchHint(request, url)

    if (path === '/latest.yml') {
      return await handleLatest(env, ctx, 'latest.yml', 'win32', archHint)
    }
    if (path === '/latest-mac.yml') {
      return await handleLatest(env, ctx, 'latest-mac.yml', 'darwin', archHint)
    }
    if (path === '/latest-linux.yml') {
      return await handleLatest(env, ctx, 'latest-linux.yml', 'linux', archHint)
    }
    // 直接命中的 mac 架构 yml: 走 handleLatest 走相同的过滤 + blockmap 注入路径,
    // 而不是 fallthrough 到 handleAsset 拿原始文件(后者会丢 blockMapSize → 差分失败)。
    if (path === '/latest-mac-x64.yml') {
      return await handleLatest(env, ctx, 'latest-mac.yml', 'darwin', 'x64')
    }
    if (path === '/latest-mac-arm64.yml') {
      return await handleLatest(env, ctx, 'latest-mac.yml', 'darwin', 'arm64')
    }

    // 新版 Hazel: 显式带 arch (/update/{platform}/{arch}/{version})
    const hazelArchMatch = path.match(/^\/update\/([^/]+)\/(x64|ia32|arm64)\/([^/]+)\/?$/)
    if (hazelArchMatch) {
      return await handleHazel(
        env,
        ctx,
        hazelArchMatch[1],
        hazelArchMatch[3],
        hazelArchMatch[2] as ArchKey
      )
    }

    // 兼容旧客户端 Hazel: /update/{platform}/{version}; 从 header/query 取 arch,缺省取该平台默认。
    const hazelMatch = path.match(/^\/update\/([^/]+)\/([^/]+)\/?$/)
    if (hazelMatch) {
      const platform = hazelMatch[1]
      const arch = archHint ?? DEFAULT_ARCH[platform] ?? 'x64'
      return await handleHazel(env, ctx, platform, hazelMatch[2], arch)
    }

    if (path.startsWith('/') && !path.slice(1).includes('/')) {
      const file = decodeURIComponent(path.slice(1))
      if (ASSET_FILE_RE.test(file)) {
        return await handleAsset(env, ctx, file)
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

async function handleLatest(
  env: Env,
  ctx: ExecutionContext,
  name: string,
  platform: string,
  arch: ArchKey | null
): Promise<Response> {
  const release = await getLatestRelease(env, ctx)

  if (name === 'latest-mac.yml') {
    const merged = await tryMergeMac(env, release, arch)
    if (merged) return ymlResponse(merged, arch)
  }

  const asset = findAsset(release, name)
  if (!asset) {
    return new Response(`${name} not in release ${release.tag_name}`, { status: 404 })
  }
  const yml = await fetchAssetText(env, asset)
  // electron-builder 26.x 配的 app-builder-bin@5.0.0-alpha 不会在 latest.yml 里写 blockMapSize,
  // 没有这个字段 electron-updater 不会走差分下载. 这里从 release.assets 查 .blockmap 文件 size 注入回去.
  const patched = injectBlockMapSizes(env, yml, release, platform, arch)
  return ymlResponse(patched, arch)
}

function injectBlockMapSizes(
  env: Env,
  yml: string,
  release: Release,
  platform: string,
  arch: ArchKey | null
): string {
  let info: UpdateInfo
  try {
    info = ymlLoad(yml) as UpdateInfo
  } catch {
    return yml
  }
  if (!info || !Array.isArray(info.files)) return yml

  let mutated = false

  // Windows: 按客户端 arch 过滤 files[](让 electron-updater 的 first-match 拿到正确架构)。
  // 缺省 arch 时保留旧行为: 把 x64 排到第一位、其他次之。
  if (platform === 'win32') {
    if (arch) {
      const archPattern = HAZEL_PATTERNS.win32?.[arch]
      if (archPattern) {
        const filtered = info.files.filter((f) => f && typeof f.url === 'string' && archPattern.test(f.url))
        // 安全网: 若过滤后空了(release 里没这个 arch),保留原列表,避免给客户端发空。
        if (filtered.length > 0 && filtered.length !== info.files.length) {
          info.files = filtered
          mutated = true
        }
      }
    } else {
      const reorderedFiles = reorderWindowsFiles(info.files)
      if (reorderedFiles.some((file, index) => file !== info.files[index])) {
        info.files = reorderedFiles
        mutated = true
      }
    }
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

  // 把 files[].url 全部换成 GitHub 直链(必须放在上面按相对名匹配 .blockmap 之后)。
  // 保持相对名时 electron-updater 会拼上本服务 origin，等于让 Worker 再反代一次二进制；
  // 换成直链后 Worker 只负责发版本信息，下载由客户端直连 GitHub。
  for (const file of info.files) {
    if (!file || typeof file.url !== 'string') continue
    const absolute = absoluteDownloadUrl(env, release, file.url)
    if (absolute !== file.url) {
      file.url = absolute
      mutated = true
    }
  }

  // 顶层 path / sha512 必须指向 files[] 里"该客户端实际要下载"的那个文件,
  // 否则 electron-updater 的差分校验会对不上,直接 fallback 全量。
  const primary = info.files[0]
  if (primary && (info.path !== primary.url || info.sha512 !== primary.sha512)) {
    info.path = primary.url
    info.sha512 = primary.sha512
    mutated = true
  }

  return mutated ? ymlDump(info, { lineWidth: -1 }) : yml
}

async function tryMergeMac(
  env: Env,
  release: Release,
  arch: ArchKey | null
): Promise<string | null> {
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

  // 按 arch 过滤; 客户端没给 arch 就保留所有(由 electron-updater 自行从 files[] 选)。
  const filtered =
    arch === 'arm64'
      ? allFiles.filter((f) => /arm64/i.test(f.url))
      : arch === 'x64'
        ? allFiles.filter((f) => !/arm64/i.test(f.url))
        : allFiles
  const finalFiles = filtered.length > 0 ? filtered : allFiles

  // 与 injectBlockMapSizes 一致:交付给客户端的 url 一律为 GitHub 直链,
  // 否则 electron-updater 会拼回本服务 origin 走 Worker 代理。
  for (const f of finalFiles) {
    if (f && typeof f.url === 'string') f.url = absoluteDownloadUrl(env, release, f.url)
  }

  const base = finalFiles[0]
  const merged: UpdateInfo = {
    ...parsed[0],
    files: finalFiles,
    // 没有 arch 提示时不动顶层 (保持旧行为兼容,parsed[0] 本身就是 x64);
    // 有 arch 时强制顶层指向该 arch 的首个文件。
    ...(arch && base ? { path: base.url, sha512: base.sha512 } : {})
  }
  return ymlDump(merged, { lineWidth: -1 })
}

function ymlResponse(body: string, arch: ArchKey | null): Response {
  // 客户端显式带了 arch → 响应是 arch 特化的,不能让 CF 边缘缓存把一个 arch 的 yml 喂给另一个 arch。
  // yml 文件 <2KB,关掉边缘缓存的开销可忽略。
  const cacheCtrl = arch
    ? 'private, no-store'
    : 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'
  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-yaml; charset=utf-8',
      'Cache-Control': cacheCtrl,
      Vary: 'X-Arch'
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


async function handleAsset(
  env: Env,
  _ctx: ExecutionContext,
  file: string
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

  // 只做「发直链」:302 到 GitHub Release 资产。不再由 Worker 反代二进制,
  // 客户端直连 GitHub 下载,Worker 不承担流量与稳定性风险。
  // 用 302(临时) 而非 301:资产地址随 tag 变化,避免客户端长期缓存错误跳转。
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'no-store'
    }
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
  version: string,
  arch: ArchKey
): Promise<Response> {
  const platformPatterns = HAZEL_PATTERNS[platform]
  if (!platformPatterns) {
    return new Response('unsupported platform', { status: 400 })
  }
  const pattern = platformPatterns[arch]
  if (!pattern) {
    return new Response(`unsupported arch ${arch} for ${platform}`, { status: 400 })
  }

  const release = await getLatestRelease(env, ctx)
  const tag = release.tag_name.replace(/^v/, '')
  if (compareVer(tag, version) <= 0) {
    return new Response(null, { status: 204 })
  }

  const asset = release.assets?.find((a) => pattern.test(a.name))
  if (!asset) {
    return new Response(`no ${platform}/${arch} asset in ${release.tag_name}`, { status: 404 })
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
