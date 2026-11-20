import { net } from 'electron'
import { pathToFileURL } from 'node:url'

export function createCoverHandler(resolveCover: (url: string) => Promise<{ path: string; mime: string } | null>, devUrl?: string) {
  const devOrigin = devUrl && new URL(devUrl).origin
  return async (request: Request): Promise<Response> => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
    const origin = request.headers.get('origin')
    if (origin && origin !== 'null' && origin !== 'file://' && origin !== devOrigin) return new Response(null, { status: 403 })
    try {
      const cover = await resolveCover(request.url)
      if (!cover) return new Response(null, { status: 404 })
      const headers = new Headers({ 'Content-Type': cover.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' })
      if (origin) headers.set('Access-Control-Allow-Origin', origin)
      if (request.method === 'HEAD') return new Response(null, { headers })
      const source = await net.fetch(pathToFileURL(cover.path).href, { signal: request.signal })
      if (!source.ok) return new Response(null, { status: 404 })
      return new Response(source.body, { headers })
    } catch { return new Response(null, { status: 404 }) }
  }
}
