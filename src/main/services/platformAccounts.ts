import { app, BrowserWindow, session, type Session } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  randomInt,
  randomUUID
} from 'crypto'
import QRCode from 'qrcode'
import {
  getKugouAccountPlaylistDetail,
  importAccountPlaylists,
  listAccountPlaylists,
  type PlaylistImportResult
} from './platformPlaylistSync'
import { kwB64decode, kwDecrypt, kwMakeQ } from './kuwoAuthCrypto'

export type MusicPlatform = 'netease' | 'qq' | 'kugou' | 'kuwo'

type StoredCookie = {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
}

type StoredPlatformSession = {
  version: 1
  createdAt: number
  cookies: StoredCookie[]
}

const loginWindows = new Map<MusicPlatform, BrowserWindow>()
const pollTimers = new Map<MusicPlatform, NodeJS.Timeout>()
const kugouQrState = new WeakMap<BrowserWindow, { key: string; mid: string }>()
const kugouLoginBase = 'https://login-user.kugou.com'
const kugouWebSignKey = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const savePaths: Record<MusicPlatform, string> = {
  netease: 'netease.bin',
  qq: 'qq-music.bin',
  kugou: 'kugou.bin',
  kuwo: 'kuwo.bin'
}

function sessionPath(platform: MusicPlatform): string {
  return path.join(app.getPath('userData'), 'platform-accounts', savePaths[platform])
}

function sessionKeyPath(): string {
  return path.join(app.getPath('userData'), 'platform-accounts', '.session-key')
}

function loginUrl(platform: MusicPlatform): string {
  if (platform === 'netease') return 'https://music.163.com/login'
  if (platform === 'kugou') return 'https://m3ws.kugou.com/loginReg.php?act=login'
  if (platform === 'kuwo') return 'https://www.kuwo.cn/login'
  const query = new URLSearchParams({
    appid: '716027609',
    daid: '383',
    style: '33',
    login_text: '登录',
    hide_title_bar: '1',
    hide_border: '1',
    target: 'self',
    s_url: 'https://graph.qq.com/oauth2.0/login_jump',
    pt_3rd_aid: '100497308',
    theme: '2',
    verify_theme: ''
  })
  return `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?${query}`
}

function isPlatform(value: unknown): value is MusicPlatform {
  return value === 'netease' || value === 'qq' || value === 'kugou' || value === 'kuwo'
}

function cookieMatches(platform: MusicPlatform, cookies: StoredCookie[]): boolean {
  if (platform === 'netease')
    return cookies.some((cookie) => cookie.name === 'MUSIC_U' && cookie.value.length > 8)
  if (platform === 'qq') {
    const hasAccount = cookies.some((cookie) => ['uin', 'p_uin', 'wxuin'].includes(cookie.name))
    const hasCredential = cookies.some((cookie) =>
      ['qqmusic_key', 'p_skey', 'skey', 'qm_keyst'].includes(cookie.name)
    )
    return hasAccount && hasCredential
  }
  if (platform === 'kugou') {
    const hasAccount = cookies.some((cookie) =>
      ['userid', 'user_id', 'kugooid', 'kugoo_id', 'kg_mid'].includes(cookie.name.toLowerCase())
    )
    const hasCredential = cookies.some((cookie) =>
      ['token', 'login_token', 'kugou_token', 'kg_token', 't'].includes(cookie.name.toLowerCase()) &&
      cookie.value.length >= 16
    )
    return hasAccount && hasCredential
  }
  const hasUser = cookies.some((cookie) =>
    ['uid', 'userid', 'user_id', 'username', 'loginuid'].includes(cookie.name.toLowerCase()) &&
    cookie.value.length > 3
  )
  const hasCredential = cookies.some((cookie) =>
    ['kw_token', 'sid', 'token', 'loginsid'].includes(cookie.name.toLowerCase()) && cookie.value.length > 8
  )
  return hasUser && hasCredential
}

function notify(
  mainWindow: BrowserWindow,
  platform: MusicPlatform,
  loggedIn: boolean,
  extra: { playlistCount?: number; syncError?: string } = {}
): void {
  if (!mainWindow.isDestroyed())
    mainWindow.webContents.send('platform-accounts:changed', { platform, loggedIn, ...extra })
}

async function saveSession(platform: MusicPlatform, cookies: StoredCookie[]): Promise<void> {
  const stored: StoredPlatformSession = { version: 1, createdAt: Date.now(), cookies }
  const filePath = sessionPath(platform)
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.chmod(path.dirname(filePath), 0o700)
  const key = await getSessionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(stored), 'utf8'),
    cipher.final()
  ])
  const envelope = JSON.stringify({
    format: 'ceru-platform-session-v1',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  })
  const tempPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tempPath, envelope, { mode: 0o600 })
    await fs.rename(tempPath, filePath)
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}

async function getSessionKey(): Promise<Buffer> {
  const keyPath = sessionKeyPath()
  try {
    const key = await fs.readFile(keyPath)
    if (key.length !== 32) throw new Error('本地登录加密密钥无效，请删除并重新登录平台账号')
    await fs.chmod(keyPath, 0o600)
    return key
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const key = randomBytes(32)
  try {
    const handle = await fs.open(keyPath, 'wx', 0o600)
    try {
      await handle.writeFile(key)
      await handle.sync()
    } finally {
      await handle.close()
    }
    return key
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existingKey = await fs.readFile(keyPath)
    if (existingKey.length !== 32) throw new Error('本地登录加密密钥无效，请删除并重新登录平台账号')
    await fs.chmod(keyPath, 0o600)
    return existingKey
  }
}

async function readSession(platform: MusicPlatform): Promise<StoredPlatformSession | null> {
  try {
    const envelope = JSON.parse(await fs.readFile(sessionPath(platform), 'utf8')) as {
      format?: string
      iv?: string
      tag?: string
      data?: string
    }
    if (
      envelope.format !== 'ceru-platform-session-v1' ||
      !envelope.iv ||
      !envelope.tag ||
      !envelope.data
    ) {
      return null
    }
    const decipher = createDecipheriv('aes-256-gcm', await getSessionKey(), Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final()
    ]).toString('utf8')
    const stored = JSON.parse(plaintext) as StoredPlatformSession
    const now = Date.now() / 1000
    // QQ login cookies have different lifetimes. Expired analytics and UI
    // cookies must not invalidate the account's still-live login ticket.
    const cookies = platform === 'qq'
      ? stored.cookies.filter((cookie) => cookie.expirationDate === undefined || cookie.expirationDate > now)
      : stored.cookies
    if (
      stored.version !== 1 ||
      !Array.isArray(stored.cookies) ||
      !cookieMatches(platform, cookies) ||
      (platform !== 'qq' && cookies.some(
        (cookie) => cookie.expirationDate !== undefined && cookie.expirationDate <= Date.now() / 1000
      ))
    )
      return null
    return cookies === stored.cookies ? stored : { ...stored, cookies }
  } catch {
    return null
  }
}

async function captureLogin(
  platform: MusicPlatform,
  loginSession: Session,
  loginWindow: BrowserWindow,
  mainWindow: BrowserWindow
): Promise<void> {
  if (loginWindow.isDestroyed() || loginWindows.get(platform) !== loginWindow) return
  const cookies = (await loginSession.cookies.get({})).filter((cookie) => {
    const domain = (cookie.domain ?? '').replace(/^\./, '')
    const lower = domain.toLowerCase()
    return platform === 'netease'
      ? domain === '163.com' || domain.endsWith('.163.com')
      : platform === 'qq'
        ? lower === 'qq.com' || lower.endsWith('.qq.com')
        : platform === 'kugou'
          ? lower === 'kugou.com' || lower.endsWith('.kugou.com')
          : lower === 'kuwo.cn' || lower.endsWith('.kuwo.cn')
  }).map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {})
  })).filter((cookie) =>
    platform !== 'qq' || cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000
  )
  if (
    !cookieMatches(platform, cookies) ||
    loginWindow.isDestroyed() ||
    loginWindows.get(platform) !== loginWindow
  )
    return
  await saveSession(platform, cookies)
  notify(mainWindow, platform, true)
  loginWindows.get(platform)?.close()
}

function openLogin(platform: MusicPlatform, mainWindow: BrowserWindow): void {
  const active = loginWindows.get(platform)
  if (active && !active.isDestroyed()) {
    active.focus()
    return
  }

  if (platform === 'kugou') {
    void openKugouQrLogin(mainWindow)
    return
  }
  const partition = `platform-login-${platform}-${randomUUID()}`
  const loginSession = session.fromPartition(partition)
  const window = new BrowserWindow({
    // Keep the macOS title bar visible so the native close control remains available
    // even though the login page itself is hosted by the music platform.
    frame: true,
    titleBarStyle: 'default',
    width: 480,
    height: 660,
    minWidth: 420,
    minHeight: 580,
    parent: mainWindow,
    modal: true,
    title: {
      netease: '网易云音乐扫码登录',
      qq: 'QQ 音乐扫码登录',
      kugou: '酷狗音乐登录',
      kuwo: '酷我音乐登录'
    }[platform],
    autoHideMenuBar: true,
    webPreferences: {
      session: loginSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })
  if (process.platform === 'darwin') {
    window.setWindowButtonVisibility(true)
  }
  loginWindows.set(platform, window)

  let checking = false
  let lastCaptureErrorAt = 0
  const timer = setInterval(() => {
    if (checking || window.isDestroyed()) return
    checking = true
    void captureLogin(platform, loginSession, window, mainWindow)
      .catch((error) => {
        if (Date.now() - lastCaptureErrorAt < 30000) return
        lastCaptureErrorAt = Date.now()
        console.warn(
          `[platform-login] cookie capture failed platform=${platform}: ${error instanceof Error ? error.message : 'unknown error'}`
        )
      })
      .finally(() => {
        checking = false
      })
  }, 1000)
  pollTimers.set(platform, timer)

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'ceru-platform-login://close') {
      if (!window.isDestroyed()) window.close()
      return { action: 'deny' }
    }
    try {
      const target = new URL(url)
      if (target.protocol === 'https:' && isLoginHost(target.hostname))
        void window.loadURL(url).catch(() => {})
    } catch {}
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url === 'ceru-platform-login://close') {
      event.preventDefault()
      if (!window.isDestroyed()) window.close()
      return
    }
    try {
      const target = new URL(url)
      if (target.protocol !== 'https:' || !isLoginHost(target.hostname)) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  // The native macOS traffic lights can be hidden by the host app's custom window
  // chrome. Add an in-page close control that remains visible on every platform.
  const installCloseButton = () => {
    if (window.isDestroyed()) return
    void window.webContents
      .executeJavaScript(`(() => {
        if (!document.documentElement || document.getElementById('__ceru-platform-login-close')) return
        const button = document.createElement('button')
        button.id = '__ceru-platform-login-close'
        button.type = 'button'
        button.setAttribute('aria-label', '关闭登录窗口')
        button.title = '关闭登录窗口'
        button.textContent = '×'
        button.style.cssText = 'position:fixed!important;top:12px!important;right:12px!important;z-index:2147483647!important;width:36px!important;height:36px!important;border:1px solid rgba(0,0,0,.12)!important;border-radius:50%!important;background:rgba(255,255,255,.96)!important;color:#333!important;font:28px/30px -apple-system,BlinkMacSystemFont,sans-serif!important;text-align:center!important;box-shadow:0 2px 8px rgba(0,0,0,.2)!important;cursor:pointer!important;padding:0!important;'
        button.addEventListener('click', () => window.open('ceru-platform-login://close'))
        document.documentElement.appendChild(button)
      })()`)
      .catch(() => {})
  }
  window.webContents.on('did-finish-load', installCloseButton)
  if (platform === 'kuwo') {
    // Keep the login page at its native scale and let users scroll to its
    // right-hand controls inside the existing compact window.
    const enableHorizontalLoginScroll = () => {
      if (window.isDestroyed()) return
      void window.webContents.executeJavaScript(`(() => {
        if (!document.documentElement) return
        let style = document.getElementById('__ceru-kuwo-login-scroll')
        if (!style) {
          style = document.createElement('style')
          style.id = '__ceru-kuwo-login-scroll'
          style.textContent = 'html,body{overflow-x:auto!important;min-width:760px!important}body{box-sizing:border-box!important;padding-right:100px!important}::-webkit-scrollbar{height:8px!important}'
          document.documentElement.appendChild(style)
        }
      })()`).catch(() => {})
    }
    window.webContents.on('did-finish-load', enableHorizontalLoginScroll)
  }
  window.on('closed', () => {
    clearInterval(timer)
    if (loginWindows.get(platform) === window) loginWindows.delete(platform)
    pollTimers.delete(platform)
  })
  void window.loadURL(loginUrl(platform)).catch(() => {})
}

async function kugouQrRequest(pathname: string, params: Record<string, string>, mid: string): Promise<any> {
  const requestParams: Record<string, string> = {
    dfid: '-', mid, uuid: '-', appid: '3116', clientver: '11440',
    clienttime: String(Math.floor(Date.now() / 1000)), ...params
  }
  const signingText = Object.keys(requestParams).sort().map((key) => `${key}=${requestParams[key]}`).join('')
  requestParams.signature = createHash('md5')
    .update(`${kugouWebSignKey}${signingText}${kugouWebSignKey}`)
    .digest('hex')
  const url = new URL(pathname, kugouLoginBase)
  url.search = new URLSearchParams(requestParams).toString()
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'x-router': 'login-user.kugou.com'
    }
  })
  if (!response.ok) throw new Error(`酷狗二维码请求失败 (${response.status})`)
  return response.json()
}

function kugouDeepValue(value: unknown, keys: string[]): string {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = kugouDeepValue(child, keys)
      if (found) return found
    }
  } else if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    for (const key of keys) {
      const found = row[key]
      if ((typeof found === 'string' || typeof found === 'number') && String(found))
        return String(found)
    }
    for (const child of Object.values(row)) {
      const found = kugouDeepValue(child, keys)
      if (found) return found
    }
  }
  return ''
}

async function openKugouQrLogin(mainWindow: BrowserWindow): Promise<void> {
  const window = new BrowserWindow({
    frame: true,
    titleBarStyle: 'default',
    width: 480,
    height: 660,
    minWidth: 420,
    minHeight: 580,
    parent: mainWindow,
    modal: true,
    title: '酷狗音乐扫码登录',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  if (process.platform === 'darwin') window.setWindowButtonVisibility(true)
  loginWindows.set('kugou', window)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'ceru-platform-login://close') {
      if (!window.isDestroyed()) window.close()
    }
    return { action: 'deny' }
  })
  let lastPollErrorAt = 0
  const timer = setInterval(() => {
    if (window.isDestroyed() || !kugouQrState.has(window)) return
    void pollKugouQr(window, mainWindow).catch((error) => {
      if (Date.now() - lastPollErrorAt > 30000) {
        lastPollErrorAt = Date.now()
        console.warn(`[platform-login] kugou QR poll failed: ${error instanceof Error ? error.message : 'network error'}`)
      }
    })
  }, 1200)
  pollTimers.set('kugou', timer)
  window.on('closed', () => {
    clearInterval(timer)
    if (loginWindows.get('kugou') === window) loginWindows.delete('kugou')
    pollTimers.delete('kugou')
  })
  try {
    const mid = BigInt(`0x${createHash('md5').update(randomUUID()).digest('hex').slice(0, 15)}`).toString()
    const response = await kugouQrRequest('/v2/qrcode', {
      appid: '1001', type: '1', plat: '4',
      qrcode_txt: 'https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=3116&',
      srcappid: '2919'
    }, mid)
    if (window.isDestroyed()) return
    const key = kugouDeepValue(response, ['qrcode', 'key'])
    if (!key) throw new Error('酷狗二维码生成失败')
    kugouQrState.set(window, { key, mid })
    const qrUrl = `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${encodeURIComponent(key)}`
    const qrImage = await QRCode.toDataURL(qrUrl, { width: 250, margin: 1 })
    const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:#25262a;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}.card{text-align:center;padding:30px 24px;width:100%}h1{font-size:20px;margin:0 0 8px}p{font-size:13px;color:#737780;margin:0 0 22px}.qr{width:276px;height:276px;padding:12px;border-radius:18px;background:white;box-shadow:0 8px 24px #0002}.hint{margin-top:18px}.close{position:fixed;right:14px;top:8px;border:0;background:transparent;color:#737780;font-size:26px;cursor:pointer}</style><button class="close" onclick="window.open('ceru-platform-login://close')" aria-label="关闭登录窗口">×</button><main class="card"><h1>登录酷狗音乐</h1><p>请使用酷狗音乐 App 扫码确认</p><img class="qr" src="${qrImage}"><p class="hint" id="status">等待扫码…</p></main>`
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`)
  } catch (error) {
    if (!window.isDestroyed()) {
      console.error(`[platform-login] kugou QR creation failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<meta charset="utf-8"><body style="font:14px -apple-system;text-align:center;padding:120px 30px">${error instanceof Error ? error.message : '酷狗二维码生成失败'}<p>请关闭窗口后重试。</p></body>`)}`)
    }
  }
}

async function pollKugouQr(window: BrowserWindow, mainWindow: BrowserWindow): Promise<void> {
  if (window.isDestroyed() || loginWindows.get('kugou') !== window) return
  const qrState = kugouQrState.get(window)
  if (!qrState) return
  const response = await kugouQrRequest('/v2/get_userinfo_qrcode', {
    plat: '4', appid: '3116', srcappid: '2919', qrcode: qrState.key
  }, qrState.mid)
  const token = kugouDeepValue(response, ['token', 'user_token', 'access_token', 'key'])
  const userId = kugouDeepValue(response, ['userid', 'user_id', 'uid', 'kugooid', 'kugouid']).replace(/\D/g, '')
  if (!token || !userId) {
    const status = Number(kugouDeepValue(response, ['status']))
    if (status === 3) void window.webContents.executeJavaScript("document.getElementById('status').textContent='二维码已过期，请关闭后重新打开'").catch(() => {})
    else if (status === 2) void window.webContents.executeJavaScript("document.getElementById('status').textContent='已扫码，请在手机上确认登录…'").catch(() => {})
    return
  }
  const dfid = await registerKugouDevice(userId, token, qrState.mid)
  await saveSession('kugou', [
    { name: 'userid', value: userId }, { name: 'token', value: token },
    { name: 'KUGOU_API_MID', value: qrState.mid }, { name: 'dfid', value: dfid || '-' }
  ])
  console.info('[platform-login] kugou QR login succeeded; auth token saved')
  notify(mainWindow, 'kugou', true)
  window.close()
}

async function registerKugouDevice(userId: string, token: string, mid: string): Promise<string> {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  const aes = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('')
  const guid = randomUUID()
  const device = {
    availableRamSize: 4983533568, availableRomSize: 48114719, availableSDSize: 48114717,
    basebandVer: '', batteryLevel: 100, batteryStatus: 3, brand: 'Redmi',
    buildSerial: 'unknown', device: 'marble', imei: guid, imsi: '',
    manufacturer: 'Xiaomi', uuid: guid, accelerometer: false, gyroscope: false
  }
  // The companion client splits the 32-character MD5 hex digest into two
  // 16-byte UTF-8 strings. Using the raw 16-byte digest made the IV empty.
  const aesDigest = createHash('md5').update(aes).digest('hex')
  const aesKey = Buffer.from(aesDigest.slice(0, 16), 'utf8')
  const aesIv = Buffer.from(aesDigest.slice(16, 32), 'utf8')
  const cipher = createCipheriv('aes-128-cbc', aesKey, aesIv)
  const encryptedDevice = Buffer.concat([cipher.update(JSON.stringify(device), 'utf8'), cipher.final()])
  const rsaKey = createPublicKey({
    key: Buffer.from('MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDECi0Np2UR87scwrvTr72L6oO01rBbbBPriSDFPxr3Z5syug0O24QyQO8bg27+0+4kBzTBTBOZ/WWU0WryL1JSXRTXLgFVxtzIY41Pe7lPOgsfTCn5kZcvKhYKJesKnnJDNr5/abvTGf+rHG3YRwsCHcQ08/q6ifSioBszvb3QiwIDAQAB', 'base64'),
    format: 'der', type: 'spki'
  })
  const credentials = Buffer.from(JSON.stringify({ aes, uid: Number(userId), token }))
  const encryptedCredentials = publicEncrypt({ key: rsaKey, padding: constants.RSA_PKCS1_PADDING }, credentials).toString('hex')
  const params: Record<string, string> = {
    dfid: '-', mid, uuid: '-', appid: '3116', clientver: '11440',
    clienttime: String(Math.floor(Date.now() / 1000)), part: '1', platid: '1', p: encryptedCredentials
  }
  const androidSignKey = 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA'
  const signatureText = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('')
  params.signature = createHash('md5').update(`${androidSignKey}${signatureText}${androidSignKey}`).digest('hex')
  const url = new URL('/risk/v2/r_register_dev', 'https://userservice.kugou.com')
  url.search = new URLSearchParams(params).toString()
  try {
    const response = await fetch(url, {
      method: 'POST', body: encryptedDevice, signal: AbortSignal.timeout(20000),
      headers: {
        'User-Agent': 'Android15-1070-11440-46-0-DiscoveryDRADProtocol-wifi',
        'x-router': 'userservice.kugou.com',
        'Content-Type': 'application/octet-stream',
        Cookie: `userid=${userId}; token=${token}; KUGOU_API_MID=${mid}; dfid=-`
      }
    })
    if (!response.ok) return ''
    const data = Buffer.from(await response.arrayBuffer())
    let result: any
    try {
      result = JSON.parse(data.toString('utf8'))
    } catch {
      const decipher = createDecipheriv('aes-128-cbc', aesKey, aesIv)
      result = JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'))
    }
    const dfid = kugouDeepValue(result, ['dfid'])
    console.info(`[platform-login] kugou device registration ${dfid ? 'succeeded' : 'returned no dfid'}`)
    return dfid
  } catch (error) {
    console.warn(`[platform-login] kugou device registration failed: ${error instanceof Error ? error.message : 'network error'}`)
    return ''
  }
}

async function loginKuwoAccount(username: string, password: string): Promise<{ uid: string; sid: string; nickname?: string }> {
  const account = username.trim()
  if (!account || !password) throw new Error('请输入酷我账号和密码')
  const version = '11.1.8.2'
  const product = `kwplayer_ar_${version}`
  const source = `${product}_newpcguanwangmobile.apk`
  const deviceId = randomBytes(8).toString('hex')
  const appUid = String(2000000000 + randomInt(900000000))
  const plain = `username=${encodeURIComponent(account)}&password=${encodeURIComponent(Buffer.from(password, 'utf8').toString('base64'))}&dev_id=${appUid}&user=${deviceId}&dev_name=${product}&urlencode=0&src=${source}&devResolution=1080*2400&from=android&devType=PJZ110&sx=mr8kw3sx&version=${version}`
  const encrypted = kwMakeQ(plain, 'kwks&@69')
  const url = `http://ar.i.kuwo.cn/US_NEW/kuwo/login_kw?f=ar&q=${encodeURIComponent(encrypted)}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'okhttp/3.10.0' }
  })
  if (!response.ok) throw new Error(`酷我登录接口请求失败 (${response.status})`)
  const encryptedResult = await response.text()
  const decoded = kwDecrypt(kwB64decode(encryptedResult.trim()), 'mr8kw3sx')
    .toString('utf8').replace(/ +$/, '').replace(/\x00+$/, '')
  let result: any
  try { result = JSON.parse(decoded) }
  catch {
    result = Object.fromEntries(Array.from(decoded.matchAll(/"?(\w+)"?\s*[:=]\s*"?([^",&}]+)"?/g), (match) => [match[1], match[2]]))
  }
  const success = result?.result === 'succ' || result?.ret === 'succ'
  const userInfo = result?.userInfo ?? {}
  const uid = String(result?.uid ?? result?.userid ?? userInfo.uid ?? '')
  const sid = String(result?.sid ?? '')
  if (!success || !uid || !sid) throw new Error(String(result?.msg ?? result?.message ?? '酷我账号或密码错误，或平台拒绝了登录请求'))
  return { uid, sid, nickname: String(userInfo.nickName ?? result?.nick ?? userInfo.name ?? '') }
}

function isLoginHost(hostname: string): boolean {
  return (
    hostname === '163.com' ||
    hostname.endsWith('.163.com') ||
    hostname === 'qq.com' ||
    hostname.endsWith('.qq.com') ||
    hostname === 'kugou.com' ||
    hostname.endsWith('.kugou.com') ||
    hostname === 'kuwo.cn' ||
    hostname.endsWith('.kuwo.cn')
  )
}

export const platformAccounts = {
  status: async () => ({
    netease: Boolean(await readSession('netease')),
    qq: Boolean(await readSession('qq')),
    kugou: Boolean(await readSession('kugou')),
    kuwo: Boolean(await readSession('kuwo'))
  }),

  openLogin(platform: unknown, mainWindow: BrowserWindow) {
    if (!isPlatform(platform)) throw new Error('不支持的音乐平台')
    openLogin(platform, mainWindow)
  },

  async loginKuwo(username: unknown, password: unknown, mainWindow: BrowserWindow) {
    const account = await loginKuwoAccount(String(username ?? ''), String(password ?? ''))
    await saveSession('kuwo', [
      { name: 'loginUid', value: account.uid },
      { name: 'loginSid', value: account.sid },
      ...(account.nickname ? [{ name: 'nickname', value: account.nickname }] : [])
    ])
    console.info('[platform-login] kuwo account login succeeded; auth ticket saved')
    notify(mainWindow, 'kuwo', true)
    return { success: true, nickname: account.nickname }
  },

  async syncPlaylists(
    platform: unknown,
    selectedIds?: string[]
  ): Promise<PlaylistImportResult | Awaited<ReturnType<typeof listAccountPlaylists>>> {
    if (!isPlatform(platform)) throw new Error('不支持的音乐平台')
    const stored = await readSession(platform)
    if (!stored) throw new Error('请先登录该平台')
    if (!selectedIds) return listAccountPlaylists(platform, stored.cookies)
    return importAccountPlaylists(platform, stored.cookies, selectedIds)
  },

  async getPlaylistTracks(platform: unknown, playlistId: unknown, page: unknown = 1) {
    if (platform !== 'kugou') throw new Error('该平台暂不支持此歌单详情接口')
    const stored = await readSession('kugou')
    if (!stored) throw new Error('请先登录酷狗音乐')
    const id = String(playlistId ?? '').trim()
    if (!id) throw new Error('酷狗歌单 ID 为空')
    return getKugouAccountPlaylistDetail(stored.cookies, id, Number(page) || 1)
  },

  async logout(platform: unknown, mainWindow: BrowserWindow) {
    if (!isPlatform(platform)) throw new Error('不支持的音乐平台')
    loginWindows.get(platform)?.close()
    await fs.rm(sessionPath(platform), { force: true })
    notify(mainWindow, platform, false)
  }
}

export function closePlatformLoginWindows(): void {
  for (const timer of pollTimers.values()) clearInterval(timer)
  pollTimers.clear()
  for (const window of loginWindows.values()) if (!window.isDestroyed()) window.close()
  loginWindows.clear()
}

app.on('before-quit', closePlatformLoginWindows)
