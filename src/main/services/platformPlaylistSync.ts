import { createCipheriv, createHash, randomInt, randomUUID } from 'crypto'
import ManageSongList from './songList/ManageSongList'
import type { SongList } from '@common/types/songList'
import type { MusicPlatform } from './platformAccounts'

type RemotePlaylist = {
  id: string
  name: string
  cover?: string
  count?: number
  description?: string
}

const sourceByPlatform: Record<MusicPlatform, SongList['source']> = {
  netease: 'wy',
  qq: 'tx',
  kugou: 'kg',
  kuwo: 'kw'
}

const platformName: Record<MusicPlatform, string> = {
  netease: '网易云音乐',
  qq: 'QQ音乐',
  kugou: '酷狗音乐',
  kuwo: '酷我音乐'
}

function cookieHeader(cookies: { name: string; value: string }[]): string {
  return cookies
    .filter(({ name, value }) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) && /^[\x21-\x3A\x3C-\x7E]*$/.test(value))
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ')
}

function cookieMap(cookies: { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(cookies.map(({ name, value }) => [name.toLowerCase(), value]))
}

async function responseJson(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`平台接口请求失败 (${response.status})`)
  const result = await response.json()
  return result
}

function aesCbc(value: Buffer, key: string): Buffer {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from('0102030405060708'))
  return Buffer.concat([cipher.update(value), cipher.final()])
}

export function neteaseWeapi(payload: Record<string, unknown>): URLSearchParams {
  const presetKey = '0CoJUm6Qyw8W8jud'
  const secretKey = 'kumone2026abcDEF'
  const encryptedOnce = aesCbc(Buffer.from(JSON.stringify(payload)), presetKey).toString('base64')
  const encryptedTwice = aesCbc(Buffer.from(encryptedOnce), secretKey).toString('base64')
  const encSecKey =
    '38cef2efdbcc1cfd6a44d81620dae5d23091f50ef27e01a1b1bb7e998e0fde2d' +
    '7ab6002a9e79a3c195f661cbde80e21e6245997b11b54d28407115822f95d447' +
    '7cc06b5a77de46fab6568410abf1229abef81b4c8588f386149010d190bb0b04' +
    'f064be330bd877a4d4b99514febbdb4335b10744b13d9f7ee24d314d6e62cdc9'
  return new URLSearchParams({ params: encryptedTwice, encSecKey })
}

function qqGtk(credential: string): number {
  let hash = 5381
  for (const character of credential) hash = (hash * 33 + character.charCodeAt(0)) & 0x7fffffff
  return hash
}

async function neteasePlaylists(cookies: { name: string; value: string }[]): Promise<RemotePlaylist[]> {
  const header = cookieHeader(cookies)
  const account = await responseJson('https://music.163.com/weapi/w/nuser/account/get', {
    method: 'POST',
    headers: {
      Cookie: header,
      Referer: 'https://music.163.com/',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: neteaseWeapi({})
  })
  const uid = account?.profile?.userId ?? account?.account?.id
  if (!uid) throw new Error('网易云音乐登录状态无效')
  const result = await responseJson('https://music.163.com/weapi/user/playlist', {
    method: 'POST',
    headers: {
      Cookie: header,
      Referer: 'https://music.163.com/',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: neteaseWeapi({ uid, limit: 2000, offset: 0, includeVideo: true })
  })
  if (Number(result?.code) !== 200) throw new Error(`网易云歌单接口返回异常 (${result?.code ?? 'unknown'})`)
  console.info(`[platform-playlist-sync] netease response playlists=${Array.isArray(result?.playlist) ? result.playlist.length : 0}`)
  return (result?.playlist ?? []).flatMap((item: any) => {
    const id = String(item?.id ?? '')
    const name = String(item?.name ?? '').trim()
    return id && name
      ? [{ id, name, cover: item.coverImgUrl, count: Number(item.trackCount) || 0, description: item.description }]
      : []
  })
}

async function qqPlaylists(cookies: { name: string; value: string }[]): Promise<RemotePlaylist[]> {
  const header = cookieHeader(cookies)
  const values = cookieMap(cookies)
  const uin = (values.uin || values.p_uin || values.wxuin || '').replace(/^o/, '').replace(/\D/g, '')
  if (!uin) throw new Error('QQ音乐登录状态中没有账号标识')
  const credential = values.qqmusic_key || values.p_skey || values.skey || ''
  const gtk = qqGtk(credential)
  const payload = {
    comm: { g_tk: gtk, uin, format: 'json', ct: 20, cv: 4747474 },
    req_0: {
      module: 'music.musicasset.PlaylistBaseRead',
      method: 'GetPlaylistByUin',
      param: { uin }
    }
  }
  const result = await responseJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      Cookie: header,
      Referer: 'https://y.qq.com/',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify(payload)
  })
  let rows = result?.req_0?.data?.v_playlist
  if (!Array.isArray(rows) || rows.length === 0) {
    const fallback = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss')
    fallback.search = new URLSearchParams({
      cv: '4747474', ct: '24', format: 'json', inCharset: 'utf-8', outCharset: 'utf-8',
      notice: '0', platform: 'yqq.json', needNewCode: '1', uin, hostuin: uin,
      sin: '0', size: '200', g_tk: String(gtk), g_tk_new_20200303: String(gtk)
    }).toString()
    const legacy = await responseJson(fallback.toString(), {
      headers: { Cookie: header, Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0' }
    })
    rows = legacy?.data?.disslist
    console.info(`[platform-playlist-sync] qq fallback code=${legacy?.code ?? 'unknown'} playlists=${Array.isArray(rows) ? rows.length : 0}`)
  } else {
    console.info(`[platform-playlist-sync] qq musicu playlists=${rows.length}`)
  }
  if (!Array.isArray(rows)) throw new Error(`QQ音乐没有返回歌单列表 (${result?.req_0?.code ?? result?.code ?? 'unknown'})`)
  const playlists = rows.flatMap((item: any) => {
    const id = String(item?.tid ?? item?.dissid ?? '')
    const name = String(item?.dirName ?? item?.diss_name ?? '').trim()
    return id && id !== '0' && name
      ? [{ id, name, cover: item.picUrl ?? item.diss_cover, count: Number(item.songNum ?? item.song_cnt) || 0 }]
      : []
  })
  if (playlists.length === 0) throw new Error('QQ音乐接口返回了空歌单，请检查登录账号或 Cookie 权限')
  return playlists
}

async function kugouPlaylists(cookies: { name: string; value: string }[]): Promise<RemotePlaylist[]> {
  const values = cookieMap(cookies)
  const token = values.token || values.login_token || values.kugou_token || values.kg_token || values.t
  const userId = values.userid || values.user_id || values.kugooid || values.kugoo_id || values.kg_mid
  if (!token || !userId) throw new Error('酷狗音乐登录状态中缺少账号凭据')
  // Match the working mobile client request profile: this endpoint rejects the
  // older 1005/20489 profile and its signature with "The request is illegal!".
  const userIdNumber = Number(userId)
  const derivedMid = BigInt(`0x${createHash('md5').update(`ceru-kugou-${userId}`).digest('hex').slice(0, 15)}`).toString()
  const params: Record<string, string> = {
    dfid: values.dfid || values.DFID || '-',
    mid: values.kugou_api_mid || values.mid || derivedMid,
    uuid: '-',
    appid: '3116',
    clientver: '11440',
    clienttime: String(Math.floor(Date.now() / 1000)),
    token,
    userid: userId,
    total_ver: '979',
    type: '2',
    page: '1',
    pagesize: '200'
  }
  const body = JSON.stringify({
    total_ver: 979,
    type: 2,
    page: 1,
    pagesize: 200,
    userid: Number.isFinite(userIdNumber) ? userIdNumber : 0,
    token
  })
  const signKey = 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA'
  const signingText = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('')
  params.signature = createHash('md5').update(`${signKey}${signingText}${body}${signKey}`).digest('hex')
  const authCookie = `userid=${userId}; token=${token}; KUGOU_API_MID=${params.mid}; dfid=${params.dfid}`
  const url = new URL('https://gateway.kugou.com/v7/get_all_list')
  url.search = new URLSearchParams(params).toString()
  const result = await responseJson(url.toString(), {
    method: 'POST',
    headers: {
      Cookie: `${cookieHeader(cookies)}; ${authCookie}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Android15-1070-11440-46-0-DiscoveryDRADProtocol-wifi',
      'x-router': 'cloudlist.service.kugou.com',
      'kg-rc': '1',
      'kg-thash': '5d816a0',
      'kg-rec': '1',
      'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
      dfid: params.dfid,
      mid: params.mid,
      clienttime: params.clienttime
    },
    body
  })
  const rows = [
    result?.data?.lists,
    result?.data?.list,
    result?.data?.info,
    result?.data?.listinfo,
    result?.data?.collection_list,
    result?.data?.playlist,
    result?.lists,
    result?.list,
    result?.info
  ].find(Array.isArray)
  const status = result?.status ?? 'unknown'
  const errorCode = result?.error_code ?? result?.errcode ?? result?.code ?? 'unknown'
  console.info(`[platform-playlist-sync] kugou response status=${status} error=${errorCode} playlists=${Array.isArray(rows) ? rows.length : 0}`)
  if (Number(errorCode) !== 0) {
    throw new Error(`酷狗歌单接口拒绝了当前登录凭据 (错误码 ${errorCode})`)
  }
  if (!Array.isArray(rows)) {
    const message = String(result?.error ?? result?.msg ?? result?.message ?? '')
    throw new Error(message ? `酷狗歌单接口失败 (${status}): ${message}` : `酷狗歌单接口未返回列表 (${status})`)
  }
  return rows.flatMap((item: any) => {
    const id = String(item?.listid ?? item?.id ?? item?.global_collection_id ?? item?.specialid ?? item?.list_create_gid ?? '')
    const name = String(item?.name ?? item?.title ?? item?.listname ?? '').trim()
    return id && name
      ? [{ id, name, cover: item.pic ?? item.img ?? item.create_user_pic ?? item.cover, count: Number(item.count ?? item.song_count ?? item.songnum) || 0 }]
      : []
  })
}

async function kuwoPlaylists(cookies: { name: string; value: string }[]): Promise<RemotePlaylist[]> {
  const values = cookieMap(cookies)
  const loginUid = values.loginuid
  if (loginUid && values.loginsid) {
    const url = new URL('https://nplserver.kuwo.cn/pl.svc')
    url.search = new URLSearchParams({
      op: 'getlistbyuid', uid: loginUid, pn: '0', rn: '100', encode: 'utf-8', keyset: 'pl2012',
      vipver: '1', newver: '1'
    }).toString()
    const result = await responseJson(url.toString(), {
      headers: { 'User-Agent': 'okhttp/3.10.0', Referer: 'https://www.kuwo.cn/' }
    })
    const rows = result?.plist
    console.info(`[platform-playlist-sync] kuwo mobile-ticket response=${result?.result ?? 'unknown'} playlists=${Array.isArray(rows) ? rows.length : 0}`)
    if (result?.result !== 'ok' || !Array.isArray(rows))
      throw new Error(`酷我音乐没有返回歌单列表 (${String(result?.result ?? 'unknown')})`)
    return rows.filter((item: any) => item && item.id && !item.hidden).map((item: any) => ({
      id: String(item.id), name: String(item.title ?? '未命名歌单'), cover: item.pic || undefined,
      count: Number(item.musicnum) || 0
    }))
  }
  const header = cookieHeader(cookies)
  const uid = values.uid || values.userid || values.user_id
  if (!uid) throw new Error('酷我音乐登录状态中没有用户 ID，无法读取个人歌单')
  const url = new URL('https://www.kuwo.cn/api/www/user/playlist')
  const reqId = kuwoReqId()
  const kuwoSessionCookie = values.hm_iuvt_cdb524f42f23cer9b268564v7y735ewrq2324 || ''
  if (!/^[a-z\d]{16,128}$/i.test(kuwoSessionCookie)) {
    throw new Error('酷我音乐登录会话缺少有效的网页验证 Cookie，请退出后重新登录')
  }
  const nonce = randomInt(10_000_000, 100_000_000)
  url.search = new URLSearchParams({
    uid,
    pn: '1',
    rn: '200',
    httpsStatus: '1',
    reqId,
    plat: 'web_www',
    from: ''
  }).toString()
  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(20000),
    headers: {
      Cookie: header,
      Secret: kuwoSecret(kuwoSessionCookie, nonce),
      Referer: 'https://www.kuwo.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    }
  })
  if (!response.ok) {
    console.warn(`[platform-playlist-sync] kuwo request failed status=${response.status}`)
    throw new Error(`酷我歌单接口请求失败 (${response.status})`)
  }
  const result = await response.json()
  const rows = result?.data?.list ?? result?.data?.playlist ?? result?.playlist ?? result?.data?.rows
  console.info(`[platform-playlist-sync] kuwo response code=${result?.code ?? result?.status ?? 'unknown'} playlists=${Array.isArray(rows) ? rows.length : 0}`)
  if (!Array.isArray(rows)) {
    console.warn(`[platform-playlist-sync] kuwo playlist endpoint returned no list; http=${response.status} success=${String(result?.success)} message=${String(result?.message ?? result?.msg ?? '').slice(0, 120)}`)
    throw new Error(result?.msg || result?.message || `酷我歌单接口未返回列表 (${response.status})`)
  }
  return rows.flatMap((item: any) => {
    const id = String(item?.id ?? item?.pid ?? '')
    const name = String(item?.name ?? item?.title ?? '').trim()
    return id && name
      ? [{ id, name, cover: item.pic ?? item.img ?? item.cover, count: Number(item.total ?? item.musicCount) || 0 }]
      : []
  })
}

function kuwoSecret(cookie: string, nonce: number): string {
  const cookieName = 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324'
  let seedText = ''
  for (let index = 0; index < cookieName.length; index += 1)
    seedText += cookieName.charCodeAt(index).toString()
  const offset = Math.floor(seedText.length / 5)
  const multiplier = Number.parseInt(
    seedText[offset] + seedText[offset * 2] + seedText[offset * 3] + seedText[offset * 4] + seedText[offset * 5],
    10
  )
  const increment = Math.ceil(cookieName.length / 2)
  const modulus = 2 ** 31 - 1
  seedText += nonce
  while (seedText.length > 10)
    seedText = (Number.parseInt(seedText.slice(0, 10), 10) + Number.parseInt(seedText.slice(10), 10)).toString()
  let state = (multiplier * Number(seedText) + increment) % modulus
  let signature = ''
  for (let index = 0; index < cookie.length; index += 1) {
    const value = cookie.charCodeAt(index) ^ Math.floor((state / modulus) * 255)
    signature += value.toString(16).padStart(2, '0')
    state = (multiplier * state + increment) % modulus
  }
  return `${signature}${nonce.toString(16).padStart(8, '0')}`
}

function kuwoReqId(): string {
  const timestamp = Date.now().toString(16).padStart(12, '0')
  const random = randomUUID().replace(/-/g, '').slice(0, 20)
  return `${timestamp}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}-${random.slice(12)}`
}

async function fetchRemotePlaylists(
  platform: MusicPlatform,
  cookies: { name: string; value: string }[]
): Promise<RemotePlaylist[]> {
  switch (platform) {
    case 'netease': return neteasePlaylists(cookies)
    case 'qq': return qqPlaylists(cookies)
    case 'kugou': return kugouPlaylists(cookies)
    case 'kuwo': return kuwoPlaylists(cookies)
  }
}

export async function listAccountPlaylists(
  platform: MusicPlatform,
  cookies: { name: string; value: string }[]
): Promise<RemotePlaylist[]> {
  const playlists = await fetchRemotePlaylists(platform, cookies)
  if (!playlists.length) throw new Error(`${platformName[platform]}没有返回任何歌单`)
  return playlists
}

export async function importAccountPlaylists(
  platform: MusicPlatform,
  cookies: { name: string; value: string }[],
  selectedIds?: string[]
): Promise<number> {
  try {
    const selected = selectedIds ? new Set(selectedIds.map(String)) : undefined
    const fetched = await fetchRemotePlaylists(platform, cookies)
    const remotePlaylists = fetched.filter((playlist) => !selected || selected.has(String(playlist.id)))
    console.info(
      `[platform-playlist-sync] ${platform} import requested=${selected?.size ?? 'all'} fetched=${fetched.length} matched=${remotePlaylists.length}`
    )
    if (remotePlaylists.length === 0) {
      throw new Error(`${platformName[platform]}没有匹配到所选歌单，请重新获取歌单列表后再试`)
    }
    const source = sourceByPlatform[platform]
    const existing = ManageSongList.Read()
    let imported = 0
    for (const remote of remotePlaylists) {
      const meta = {
        source,
        playlistId: remote.id,
        accountPlaylist: true,
        providerIdentity: platform,
        remotePlaylistId: remote.id,
        remoteTrackCount: remote.count ?? 0,
        ...(remote.description ? { description: remote.description } : {})
      }
      const linked = existing.find(
        (item) => item.meta?.providerIdentity === platform && item.meta?.remotePlaylistId === remote.id
      )
      if (linked) {
        ManageSongList.editById(linked.id, {
          name: `${remote.name} · ${platformName[platform]}`,
          source,
          coverImgUrl: remote.cover || linked.coverImgUrl,
          meta
        })
      } else {
        const { id: localId } = ManageSongList.createPlaylist(
          `${remote.name} · ${platformName[platform]}`,
          remote.description || `来自${platformName[platform]}的歌单`,
          source,
          { ...meta, ...(remote.cover ? { cover: remote.cover } : {}) }
        )
        if (remote.cover) ManageSongList.updateCoverImgById(localId, remote.cover)
        imported += 1
      }
    }
    console.info(`[platform-playlist-sync] ${platform} synced remote=${remotePlaylists.length} added=${imported}`)
    return remotePlaylists.length
  } catch (error) {
    console.error(
      `[platform-playlist-sync] ${platform} import failed:`,
      error instanceof Error ? error.message : String(error)
    )
    throw error
  }
}
