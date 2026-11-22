interface LoginSite { url: URL; cookie: string }

export function browserLoginSite(input:unknown, domains:readonly string[], origins:readonly string[]):LoginSite {
  const options=input as {url?:unknown; until?:{cookie?:unknown}}
  if (typeof options?.url!=='string' || options.url.length>2048 || typeof options.until?.cookie!=='string' || !/^[A-Za-z0-9_~-]{1,128}$/.test(options.until.cookie)) throw Error('网页登录参数无效')
  const url=new URL(options.url)
  if (url.protocol!=='https:' || url.username || url.password || !domains.includes(url.hostname) || !origins.includes(url.origin)) throw Error('此登录网站尚未获得授权')
  return {url,cookie:options.until.cookie}
}

export function browserLoginCredential(site:LoginSite,cookie:Electron.Cookie,now=Date.now()) {
  if (cookie.name!==site.cookie || cookie.domain!==site.url.hostname || cookie.hostOnly!==true || cookie.secure!==true || cookie.path!=='/' || (cookie.expirationDate!==undefined && cookie.expirationDate*1000<=now)) return null
  if (!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]{1,4096}$/.test(cookie.value)) return null
  return {credential:cookie.name+'='+cookie.value,binding:{origin:site.url.origin,sendAs:'cookie' as const}}
}
