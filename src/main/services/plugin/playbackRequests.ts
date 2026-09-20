type PlaybackRequest = {
  headers: Readonly<Record<string, string>>
  expiresAt: number
}

const requests = new Map<string, PlaybackRequest>()
const maximumLifetimeMs = 6 * 60 * 60 * 1000

const keyFor = (url: string): string => new URL(url).href

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value)
  if (entries.length > 32) throw new Error('播放请求头数量超过限制')
  const result: Record<string, string> = {}
  for (const [name, headerValue] of entries) {
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) ||
      /^(host|connection|content-length|transfer-encoding|proxy-.*|upgrade)$/i.test(name) ||
      typeof headerValue !== 'string' ||
      headerValue.length > 8192 ||
      /[\r\n]/.test(headerValue)
    )
      throw new Error('播放请求头无效')
    result[name] = headerValue
  }
  return result
}

function cleanup(now = Date.now()): void {
  for (const [url, request] of requests) if (request.expiresAt <= now) requests.delete(url)
}

/** Keep media request headers in the main process; renderer code only receives the URL. */
export function registerPlaybackRequest(
  url: string,
  requestHeaders: unknown,
  expiresAt?: number
): void {
  const headers = safeHeaders(requestHeaders)
  if (!Object.keys(headers).length) return
  const now = Date.now()
  cleanup(now)
  requests.set(keyFor(url), {
    headers: Object.freeze({ ...headers }),
    expiresAt: Math.max(
      now + 1000,
      Math.min(Number(expiresAt) || now + maximumLifetimeMs, now + maximumLifetimeMs)
    )
  })
}

export function playbackRequestHeaders(url: string): Record<string, string> {
  cleanup()
  const request = requests.get(keyFor(url))
  return request ? { ...request.headers } : {}
}

export function applyPlaybackRequestHeaders(
  url: string,
  current: Record<string, string>,
  resourceType?: string
): Record<string, string> {
  // External artwork must not inherit the application's page URL as its referrer.
  // This covers img, CSS backgrounds and Image() without platform-specific rules.
  // Explicit headers registered for this exact URL still take precedence below.
  if (resourceType === 'image') {
    for (const name of Object.keys(current))
      if (name.toLowerCase() === 'referer') delete current[name]
  }
  const configured = playbackRequestHeaders(url)
  for (const [name, value] of Object.entries(configured)) {
    for (const existing of Object.keys(current))
      if (existing.toLowerCase() === name.toLowerCase()) delete current[existing]
    current[name] = value
  }
  return current
}
