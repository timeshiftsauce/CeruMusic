import type { Env } from './worker.js'

const GH_API = 'https://api.github.com'

export interface ReleaseAsset {
  name: string
  url: string
  browser_download_url: string
  size: number
  content_type: string
}

export interface Release {
  tag_name: string
  name: string
  body: string
  published_at: string
  prerelease: boolean
  draft: boolean
  assets: ReleaseAsset[]
}

export function getRepo(env: Env): string {
  return env.GITHUB_REPO || 'timeshiftsauce/CeruMusic'
}

function authHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'CeruMusic-UpdateServer',
    Accept: 'application/vnd.github+json',
    ...extra
  }
  if (env.GITHUB_TOKEN) h.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  return h
}

const RELEASE_CACHE_KEY = 'https://internal.cache/release-latest'
const TAG_RELEASE_CACHE_PREFIX = 'https://internal.cache/release-tag-'
// 长期保留「最后一次成功」的副本：即使 GitHub 慢/被墙导致上游失败，
// 也能用它兜底，避免整个更新检查 500/超时（stale-on-error）。
const STALE_RELEASE_CACHE_PREFIX = 'https://internal.cache/stale-release-'

/** 上游请求默认超时（毫秒）。GitHub API 国内直连常常十几秒，必须设上限。 */
const GITHUB_FETCH_TIMEOUT_MS = 8000

/** 带超时的 fetch：超时或网络错误抛错，由调用方决定回退策略。 */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), GITHUB_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 读长期兜底缓存（不做 TTL 检查，永久保留直到被新数据覆盖）。 */
async function readStaleRelease(cacheKey: string): Promise<Release | null> {
  try {
    const hit = await caches.default.match(new Request(STALE_RELEASE_CACHE_PREFIX + cacheKey))
    return hit ? ((await hit.json()) as Release) : null
  } catch {
    return null
  }
}

/** 写入长期兜底缓存。Cloudflare Cache API 的过期靠 max-age，这里给 30 天。 */
function writeStaleRelease(ctx: ExecutionContext, cacheKey: string, data: Release) {
  const body = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=2592000, s-maxage=2592000'
    }
  })
  ctx.waitUntil(caches.default.put(new Request(STALE_RELEASE_CACHE_PREFIX + cacheKey), body))
}

// 用 Cloudflare 边缘缓存替代 Vercel 版本里的进程内缓存。
// Workers 是 stateless 的, 模块级变量在不同 isolate 之间不共享。
export async function getLatestRelease(env: Env, ctx: ExecutionContext): Promise<Release> {
  const ttl = Number(env.RELEASE_CACHE_TTL || 60)
  const cache = caches.default
  const cacheReq = new Request(RELEASE_CACHE_KEY)

  const cached = await cache.match(cacheReq)
  if (cached) {
    return (await cached.json()) as Release
  }

  const repo = getRepo(env)
  let res: Response
  try {
    res = await fetchWithTimeout(`${GH_API}/repos/${repo}/releases/latest`, {
      headers: authHeaders(env)
    })
  } catch (err) {
    // 上游超时/网络错误：用「最后一次成功」兜底，而不是把失败抛给客户端。
    const stale = await readStaleRelease(RELEASE_CACHE_KEY)
    if (stale) return stale
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const stale = await readStaleRelease(RELEASE_CACHE_KEY)
    if (stale) return stale
    throw new Error(`GitHub releases/latest ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as Release

  const cacheable = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`
    }
  })
  ctx.waitUntil(cache.put(cacheReq, cacheable))
  writeStaleRelease(ctx, RELEASE_CACHE_KEY, data)
  return data
}

export async function getReleaseByTag(
  env: Env,
  ctx: ExecutionContext,
  tag: string
): Promise<Release> {
  const ttl = Number(env.RELEASE_CACHE_TTL || 300) // 标签 Release 缓存久一点,因为通常不会变
  const cache = caches.default
  const cacheReq = new Request(`${TAG_RELEASE_CACHE_PREFIX}${tag}`)

  const cached = await cache.match(cacheReq)
  if (cached) {
    return (await cached.json()) as Release
  }

  const repo = getRepo(env)
  const staleKey = `${TAG_RELEASE_CACHE_PREFIX}${tag}`
  let res: Response
  try {
    res = await fetchWithTimeout(`${GH_API}/repos/${repo}/releases/tags/${tag}`, {
      headers: authHeaders(env)
    })
  } catch (err) {
    const stale = await readStaleRelease(staleKey)
    if (stale) return stale
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const stale = await readStaleRelease(staleKey)
    if (stale) return stale
    throw new Error(`GitHub releases/tags/${tag} ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as Release

  const cacheable = new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`
    }
  })
  ctx.waitUntil(cache.put(cacheReq, cacheable))
  writeStaleRelease(ctx, staleKey, data)
  return data
}

export function findAsset(release: Release, name: string): ReleaseAsset | undefined {
  return release.assets?.find((a) => a.name === name)
}

export async function fetchAssetText(env: Env, asset: ReleaseAsset): Promise<string> {
  const res = await fetchWithTimeout(asset.url, {
    headers: authHeaders(env, { Accept: 'application/octet-stream' }),
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`fetch asset ${asset.name}: ${res.status}`)
  return res.text()
}

export function downloadUrl(env: Env, release: Release, filename: string): string {
  const tag = encodeURIComponent(release.tag_name)
  const name = encodeURIComponent(filename)
  return `https://github.com/${getRepo(env)}/releases/download/${tag}/${name}`
}

/**
 * 把 latest.yml 里的相对文件名改写成 GitHub 直链。
 *
 * 背景:electron-updater 拿到相对 url 会拼上本服务 origin，等于又让 Worker 反代一次
 * 二进制。Worker 只应负责「查版本 + 发直链」，下载交给客户端直连 GitHub。
 *
 * 已是绝对地址(含 `http(s)://` 或协议相对 `//`)时原样返回，避免二次拼接。
 */
export function absoluteDownloadUrl(env: Env, release: Release, url: string): string {
  if (!url) return url
  if (/^(https?:)?\/\//i.test(url)) return url
  const name = url.split('/').pop() || url
  return downloadUrl(env, release, name)
}
