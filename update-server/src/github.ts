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
  const res = await fetch(`${GH_API}/repos/${repo}/releases/latest`, {
    headers: authHeaders(env)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
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
  const res = await fetch(`${GH_API}/repos/${repo}/releases/tags/${tag}`, {
    headers: authHeaders(env)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
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
  return data
}

export function findAsset(release: Release, name: string): ReleaseAsset | undefined {
  return release.assets?.find((a) => a.name === name)
}

export async function fetchAssetText(env: Env, asset: ReleaseAsset): Promise<string> {
  const res = await fetch(asset.url, {
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
