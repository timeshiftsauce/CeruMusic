import { createHash, randomBytes } from 'node:crypto'
import type { AccountOAuthOptions } from '@shiqianjiang/ceru-plugin-sdk'

export function accountRedirectUri(origin:string) {
  return 'ceru://oauth/callback/'+createHash('sha256').update(origin).digest('hex')
}
function httpsEndpoint(value:unknown) {
  if (typeof value !== 'string' || value.length>2048) throw Error('OAuth 地址无效')
  const url=new URL(value)
  if (url.protocol!=='https:' || url.username || url.password || url.search || url.hash) throw Error('OAuth 端点必须为 HTTPS 地址')
  return url
}
export function oauthOptions(input:AccountOAuthOptions) {
  const authorization=httpsEndpoint(input?.authorizationUrl), token=httpsEndpoint(input?.tokenUrl)
  if (authorization.origin!==token.origin || typeof input.clientId!=='string' || !input.clientId.trim() || input.clientId.length>256) throw Error('OAuth 客户端无效')
  const scopes=input.scopes ?? []
  if (!Array.isArray(scopes) || scopes.length>32 || scopes.some(value=>typeof value!=='string' || !/^[a-zA-Z0-9:._/-]{1,128}$/.test(value))) throw Error('OAuth 授权范围无效')
  const resource=httpsEndpoint(input.resourceOrigin ?? authorization.origin)
  if (resource.pathname!=='/' || resource.origin!==authorization.origin) throw Error('OAuth 资源必须与授权端点同来源')
  return {authorization,token,resourceOrigin:resource.origin,clientId:input.clientId,scopes}
}
export class OAuthCallbacks {
  private pending=new Map<string,{redirect:string;finish:(code:string|null)=>void}>()
  accept(raw:string) {
    if (!/^ceru:\/\/oauth(?:[/?#:]|$)/i.test(raw)) return false
    if (raw.length>8192) return true
    let url:URL
    try { url=new URL(raw) } catch { return true }
    if (raw.includes('#')) return true
    const states=url.searchParams.getAll('state'),codes=url.searchParams.getAll('code'),errors=url.searchParams.getAll('error')
    if (states.length!==1 || !states[0] || errors.length>1 || codes.length>1 || (codes.length && errors.length)) return true
    const denied=errors.length===1 && !!errors[0]
    if (!denied && (codes.length!==1 || !codes[0] || codes[0].length>4096)) return true
    const entry=this.pending.get(states[0])
    if (entry && raw.split('?',1)[0]===entry.redirect) entry.finish(denied ? null : codes[0])
    return true
  }
  async authorize(options:ReturnType<typeof oauthOptions>,signal:AbortSignal,open:(url:string)=>Promise<void>,exchange:(url:string,body:string,signal:AbortSignal)=>Promise<any>) {
    signal.throwIfAborted()
    const state=randomBytes(32).toString('base64url'), verifier=randomBytes(48).toString('base64url')
    const start=new URL(options.authorization)
    const redirect=accountRedirectUri(options.authorization.origin)
    start.search=new URLSearchParams({response_type:'code',client_id:options.clientId,redirect_uri:redirect,state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),...(options.scopes.length ? {scope:options.scopes.join(' ')} : {})}).toString()
    let finish!:(code:string|null)=>void
    const received=new Promise<string|null>(resolve=>{finish=code=>{this.pending.delete(state);resolve(code)}})
    const cancel=()=>finish(null)
    this.pending.set(state,{redirect,finish});signal.addEventListener('abort',cancel,{once:true})
    try {
      await open(start.href)
      const code=await received
      signal.throwIfAborted()
      if (!code) return null
      const body=new URLSearchParams({grant_type:'authorization_code',code,code_verifier:verifier,client_id:options.clientId,redirect_uri:redirect})
      const reply=await exchange(options.token.href,body.toString(),signal)
      signal.throwIfAborted()
      if (reply.status!==200 || String(reply.body?.token_type).toLowerCase()!=='bearer' || typeof reply.body?.access_token!=='string' || !/^[\x21-\x7e]{1,8192}$/.test(reply.body.access_token)) throw Error('OAuth 令牌交换失败')
      return {credential:reply.body.access_token as string,binding:{origin:options.resourceOrigin,sendAs:'bearer' as const}}
    } finally { this.pending.delete(state);signal.removeEventListener('abort',cancel) }
  }
}
export const accountOAuthCallbacks=new OAuthCallbacks()
