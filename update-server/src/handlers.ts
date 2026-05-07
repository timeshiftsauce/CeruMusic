import { dump as ymlDump, load as ymlLoad } from 'js-yaml'
import {
  getLatestRelease,
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
  return ymlResponse(yml)
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

async function handleAsset(
  env: Env,
  ctx: ExecutionContext,
  file: string
): Promise<Response> {
  if (!file || file.includes('/') || file.includes('..') || file.startsWith('.')) {
    return new Response('bad request', { status: 400 })
  }
  const release = await getLatestRelease(env, ctx)
  const url = downloadUrl(env, release, file)
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'public, max-age=300, s-maxage=300'
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
