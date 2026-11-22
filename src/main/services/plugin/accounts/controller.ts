import { randomUUID } from 'node:crypto'
import { accountBus } from '../operations/bus'
import { accountCollectionPage } from './collections'
import type { AccountListCapability } from '@shiqianjiang/ceru-plugin-sdk'
import { qrPresentation, pollQrLogin } from './qrLogin'
import { accountOAuthCallbacks, oauthOptions } from './oauth'
import { browserLoginSite } from './browserPolicy'
import { isolatedBrowserLogin } from './browserLogin'
import type { AccountOAuthOptions, AccountLoginResult } from '@shiqianjiang/ceru-plugin-sdk'
import { assertAccountForm, type AccountDeclaration } from '@shiqianjiang/ceru-plugin-sdk'
import { callPluginUI, publishPluginAccountChanged } from '../uiBridge'
import { accountPresentation, readAccounts, saveAccounts, withAccountChange } from './connections'
import { pluginAccountVault, type AccountOwner } from './vault'
import { credentialHeaders, validateBinding, type CredentialBinding } from './requestBinding'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

export interface AccountQrView {
  session: PluginWebDrawerSession
  update(login: JsonObject): void
  close(): Promise<void>
}
type CreateQrView = (view: string, login: JsonObject, cancel: () => void) => Promise<AccountQrView>

type Invoke = (id: string, method: string, input: unknown, signal: AbortSignal) => Promise<any>
type LoginMethod = 'qrcode'|'form'|'oauth'|'browser'
interface LoginSession { title:string; accountId:string; modeless:boolean; method:LoginMethod; signal:AbortSignal; shown:boolean; confirmed:boolean; cancelled:boolean; expired:boolean; cancel:AbortController; completion?:{id:string;result:AccountLoginResult;check:()=>void} }
export class AccountController {
  private provisional = new Map<string,{owner:AccountOwner;binding:CredentialBinding}>()
  private tickets = new Map<string, LoginSession>()
  constructor(private pluginId:string, private publicId:string, private invoke:Invoke, private stopped:AbortSignal,
    private notify: (name:'account.changed'|'account.expired', payload:unknown)=>Promise<void>,
    private createQrView?: CreateQrView) {}
  async form(ticket:string, form:unknown) {
    const entry = this.tickets.get(ticket)
    if (!entry || entry.method!=='form' || entry.shown || entry.signal.aborted) throw Error('没有正在进行的账号登录')
    assertAccountForm(form)
    entry.shown = true
    const fields = form.fields.map(({key,type,label,optional})=>({key,type,label,optional:optional === true}))
    const result = await callPluginUI(this.pluginId,'accounts.form',{title:entry.title,fields,modeless:entry.modeless},entry.signal)
    entry.signal.throwIfAborted()
    if (result === null) { entry.cancelled = true; return null }
    const values: Record<string,string> = {}
    for (const {key,optional} of fields) {
      if (typeof result?.[key] !== 'string' || result[key].length > 4096 || (!optional && !result[key])) throw Error('账号表单数据无效')
      values[key] = result[key]
    }
    return values
  }
  cancelQr(ticket:string) {
    const entry=this.tickets.get(ticket)
    if (entry && entry.method!=='form') { entry.cancelled=true; entry.cancel.abort() }
  }
  async oauth(ticket:string,input:AccountOAuthOptions,check:(origin:string)=>void,open:(url:string)=>Promise<void>,exchange:(url:string,body:string,signal:AbortSignal)=>Promise<any>) {
    const entry=this.tickets.get(ticket)
    if (!entry || entry.method!=='oauth' || entry.shown || entry.signal.aborted) throw Error('没有正在进行的 OAuth 登录')
    const options=oauthOptions(input)
    const allowed=()=>{ entry.signal.throwIfAborted(); check(options.resourceOrigin) }
    allowed(); entry.shown=true
    const ui=(phase:string)=>callPluginUI(this.pluginId,'accounts.oauthDisplay',{ticket,title:entry.title,origin:options.resourceOrigin,phase,modeless:entry.modeless},phase==='close' ? undefined : entry.signal)
    try {
      if (!await ui('confirm')) { entry.cancelled=true; return null }
      allowed()
      if (!await ui('open')) throw Error('请先关闭已有登录窗口')
      const result=await accountOAuthCallbacks.authorize(options,entry.signal,async url=>{allowed();await open(url)},(url,body,signal)=>{allowed();return exchange(url,body,signal)})
      allowed()
      if (!result) {entry.cancelled=true;return null}
      const id=randomUUID()
      entry.completion={id,result,check:()=>check(options.resourceOrigin)}
      return {completionId:id}
    } finally { await ui('close').catch(()=>{}) }
  }
  async browser(ticket:string,input:unknown,grants:()=>{domains:string[];origins:string[];privateAllowed:boolean}) {
    const entry=this.tickets.get(ticket)
    if (!entry || entry.method!=='browser' || entry.shown || entry.signal.aborted) throw Error('没有正在进行的网页登录')
    const current=()=>{const {domains,origins}=grants();return browserLoginSite(input,domains,origins)}
    const site=current();entry.shown=true
    if (!await callPluginUI(this.pluginId,'accounts.browserConfirm',{title:entry.title,origin:site.url.origin,cookie:site.cookie,modeless:entry.modeless},entry.signal)) {entry.cancelled=true;return null}
    entry.signal.throwIfAborted()
    const result=await isolatedBrowserLogin(site,entry.signal,current,()=>grants().privateAllowed)
    if (!result) {entry.cancelled=true;return null}
    const id=randomUUID();entry.completion={id,result,check:current}
    return {completionId:id}
  }
  async qrCode(ticket:string,image:unknown,expiresInMs:number,url?:unknown,view?:unknown) {
    const entry=this.tickets.get(ticket)
    if (!entry || entry.method!=='qrcode' || entry.shown || entry.signal.aborted) throw Error('没有正在进行的扫码登录')
    const presentation=qrPresentation(image,url)
    if (!Number.isSafeInteger(expiresInMs) || expiresInMs < 1000 || expiresInMs > 300000) throw Error('二维码有效期无效')
    if (view !== undefined && (typeof view !== 'string' || !/^[a-zA-Z][\w.-]{0,127}$/.test(view) || !this.createQrView)) throw Error('自定义扫码视图无效')
    const login:JsonObject={kind:'qrcode',accountId:entry.accountId,status:'waiting',expiresAt:Date.now()+expiresInMs}
    Object.assign(login,presentation)
    let custom:AccountQrView|undefined
    entry.shown=true
    const ui=(phase:string,details:Record<string,unknown>={})=>callPluginUI(this.pluginId,'accounts.qrDisplay',{ticket,phase,modeless:entry.modeless,...details},phase==='close' ? undefined : entry.signal)
    try {
      if (typeof view==='string') custom=await this.createQrView!(view,login,()=>this.cancelQr(ticket))
      entry.signal.throwIfAborted()
      if (!await ui('open',{...presentation,title:entry.title,accountId:entry.accountId,...(custom ? {view:custom.session} : {})})) throw Error('请先关闭已有扫码登录')
      const result=await pollQrLogin(expiresInMs,entry.signal,signal=>this.invoke(entry.accountId,'qrPoll',{ticket},signal),status=>{
        custom?.update({...login,status})
        return ui('status',{status})
      })
      if (result && 'expired' in result) entry.expired=true
      if (result && 'credential' in result) entry.confirmed=true
      if (!result) entry.cancelled=true
      return result
    } finally { await ui('close').catch(()=>{}); await custom?.close().catch(()=>{}) }
  }
  async providerConnection(item:AccountDeclaration, requested?:string) {
    const state = await readAccounts({pluginId:this.pluginId,accountId:item.id})
    if (requested !== undefined && requested !== state.active) throw Error('资源不属于当前子账号')
    const row = state.rows.find(entry=>entry.id===state.active)
    if (row?.expired) throw Error('此账号需要重新登录')
    return row?.id
  }
  async credential(items:AccountDeclaration[], id:unknown) {
    if (typeof id !== 'string' || id.length > 128) return null
    for (const item of items) {
      const state = await readAccounts({pluginId:this.pluginId,accountId:item.id})
      const entry = state.rows.find(row=>row.id===id && !row.expired)
      if (entry) return entry.credential
    }
    return null
  }
  async authorizeRequest(items:AccountDeclaration[], data:any, originAllowed:(origin:string)=>boolean) {
    const ref = data.credential, url = new URL(data.url)
    if (ref?.kind !== 'credential' || typeof ref.id !== 'string' || !originAllowed(url.origin)) throw Error('未授权此来源使用账号凭据')
    let match = this.provisional.get(ref.id)
    if (!match) for (const item of items) {
      const owner = {pluginId:this.pluginId,accountId:item.id}
      const row = (await readAccounts(owner)).rows.find(entry=>!entry.expired && entry.credential.id===ref.id)
      if (row?.binding) { match={owner,binding:row.binding}; break }
    }
    if (!match || url.origin !== match.binding.origin) throw Error('此账号凭据不可用于请求地址')
    const secret = await pluginAccountVault.read(match.owner,ref)
    this.stopped.throwIfAborted()
    if (!originAllowed(url.origin)) throw Error('账号授权已撤销')
    return {...data,headers:credentialHeaders(match.binding,url,data.headers,secret)}
  }
  async validate(item:AccountDeclaration) {
    const owner = {pluginId:this.pluginId,accountId:item.id}
    const {active,rows} = await readAccounts(owner)
    const row = rows.find(entry=>entry.id===active)
    if (!row || row.expired) return
    const signal = AbortSignal.any([this.stopped,AbortSignal.timeout(5000)])
    const result = await this.invoke(item.id,'validate',{id:row.id,credential:row.credential},signal)
    if (result?.valid !== false) return
    await this.reportExpired(item,row.id,row.credential,signal)
  }
  async reportExpired(item:AccountDeclaration,connectionId:string,credential:import('@shiqianjiang/ceru-plugin-sdk').CredentialRef,signal=this.stopped) {
    const owner = {pluginId:this.pluginId,accountId:item.id}
    return withAccountChange(owner,async()=>{
      const state = await readAccounts(owner)
      const current = state.rows.find(entry=>entry.id===connectionId)
      if (state.active!==connectionId || !current || current.expired || credential?.kind!=='credential' || current.credential.id!==credential.id) return false
      signal.throwIfAborted()
      current.expired=true
      await saveAccounts(owner,state)
      publishPluginAccountChanged(this.pluginId)
      await this.notify('account.expired',{accountId:item.id,connectionId})
      return true
    })
  }
  async list(item:AccountDeclaration) {
    const state = await readAccounts({pluginId:this.pluginId,accountId:item.id})
    return { active:state.active, rows:state.rows.map(({id,summary,expired,syncLikes})=>({id,summary,...(expired ? {expired:true} : {}),...(syncLikes===true ? {syncLikes:true}: {})})) }
  }
  async likes(item:AccountDeclaration,connection:string,enabled:boolean,ref?:import('@shiqianjiang/ceru-plugin-sdk').ResourceRef){
    if(typeof enabled!=='boolean' || !item.capabilities?.includes('likes'))throw Error('此平台未声明收藏能力')
    const owner={pluginId:this.pluginId,accountId:item.id}
    return withAccountChange(owner,async()=>{
      const state=await readAccounts(owner),row=state.rows.find(entry=>entry.id===connection && entry.id===state.active && !entry.expired)
      this.stopped.throwIfAborted()
      if(!row)throw Error('当前账号不可用')
      if(ref===undefined){row.syncLikes=enabled;await saveAccounts(owner,state);publishPluginAccountChanged(this.pluginId);return}
      if(!row.syncLikes)throw Error('未开启平台收藏同步')
      if(ref.kind!=='track' || ref.pluginId!==this.publicId || !item.providers?.includes(ref.providerId) || (ref.connectionId!==undefined && ref.connectionId!==connection) || typeof ref.id!=='string' || !ref.id || ref.id.length>2048)throw Error('歌曲不属于此平台账号')
      await this.invoke(item.id,'likes.set',{account:{id:row.id,credential:row.credential},request:{liked:enabled,ref:{kind:'track',pluginId:this.publicId,providerId:ref.providerId,id:ref.id,connectionId:connection}}},AbortSignal.any([this.stopped,AbortSignal.timeout(15000)]))
    })
  }
  async collection(item:AccountDeclaration,capability:AccountListCapability,connectionId:string,cursor?:string,limit=30) {
    if (!['likes','playlists','history','recommend'].includes(capability) || !item.capabilities?.includes(capability) || !Number.isInteger(limit) || limit<1 || limit>100 || (cursor!==undefined && (typeof cursor!=='string' || !cursor || cursor.length>2048))) throw Error('平台列表请求无效')
    const owner={pluginId:this.pluginId,accountId:item.id}
    const current=async()=>{const state=await readAccounts(owner);const row=state.rows.find(entry=>entry.id===connectionId && entry.id===state.active && !entry.expired);if(!row)throw Error('账号已切换或需要重新登录');return row}
    const row=await current(),signal=AbortSignal.any([this.stopped,AbortSignal.timeout(15000)])
    signal.throwIfAborted()
    const raw=await this.invoke(item.id,capability+'.list',{account:{id:row.id,credential:row.credential},request:{cursor,limit}},signal)
    if ((await current()).credential.id!==row.credential.id) throw Error('账号已重新登录')
    signal.throwIfAborted()
    return accountCollectionPage(raw,capability,this.publicId,item.providers??[],connectionId,limit,cursor)
  }
  async change(item:AccountDeclaration, action: 'login' | 'switch' | 'logout', id?:string, method:LoginMethod=item.loginMethods.includes('form') ? 'form' : item.loginMethods.includes('qrcode') ? 'qrcode' : item.loginMethods.includes('oauth') ? 'oauth' : 'browser', requestSignal?:AbortSignal) {
    const owner = {pluginId:this.pluginId,accountId:item.id}
    return withAccountChange(owner, async () => {
      const state = await readAccounts(owner)
      const signal = AbortSignal.any([this.stopped, AbortSignal.timeout(action==='login' && method!=='form' ? 300000 : 120000), ...(requestSignal ? [requestSignal] : [])])
      signal.throwIfAborted()
      if (action === 'login') {
        if (!['form','qrcode','oauth','browser'].includes(method) || !item.loginMethods.includes(method)) throw Error('此账号未声明此登录方式')
        const previous = id === undefined ? undefined : state.rows.find(row=>row.id===id && row.expired)
        if (id !== undefined && !previous) throw Error('账号不需要重新登录')
        if (!previous && (state.rows.length >= 64 || (state.rows.length && !item.multiple))) throw Error('请先退出已有账号')
        let response, checkGrant:(()=>void)|undefined
        for (let attempt=0;attempt<8;attempt++) {
          signal.throwIfAborted()
          const cancel=new AbortController(), ticket=randomUUID()
          const session:LoginSession={title:item.title + ' · 登录',accountId:item.id,modeless:!!requestSignal,method,signal:AbortSignal.any([signal,cancel.signal]),shown:false,confirmed:false,cancelled:false,expired:false,cancel}
          this.tickets.set(ticket,session)
          try { response=await this.invoke(item.id,'login',{ticket,method},session.signal) }
          catch { if (session.cancelled) return false; throw Error('插件未能完成账号登录') }
          finally { this.tickets.delete(ticket); cancel.abort() }
          if (session.cancelled) return false
          if (session.expired) { if (attempt===7) throw Error('二维码连续过期，请重新登录'); continue }
          if (response===null) return false
          if (method==='oauth' || method==='browser') {
            if (!session.completion || response?.completionId!==session.completion.id) throw Error('账号登录回执无效')
            checkGrant=session.completion.check; checkGrant(); response=session.completion.result
          }
          if (!session.shown || (method==='qrcode' && !session.confirmed) || typeof response?.credential !== 'string') throw Error('账号登录结果无效')
          break
        }
        signal.throwIfAborted()
        const binding = validateBinding(response.binding)
        const credential = await pluginAccountVault.create(owner,response.credential)
        if (binding) this.provisional.set(credential.id,{owner,binding})
        const connection = {id:previous?.id ?? randomUUID(),credential}
        try {
          const details = accountPresentation(await this.invoke(item.id,'profile',connection,signal))
          signal.throwIfAborted()
          checkGrant?.()
          if (previous && details.platformId !== previous.platformId) throw Error('必须使用原平台账号')
          if (state.rows.some(row=>row.id !== connection.id && row.platformId===details.platformId)) throw Error('此账号已登录')
          const next = {...connection,...details,...(previous?.syncLikes?{syncLikes:true}:{}),...(binding ? {binding} : {})}
          if (previous) state.rows[state.rows.indexOf(previous)] = next
          else state.rows.push(next)
          state.active = connection.id
          await saveAccounts(owner,state)
        } catch { await pluginAccountVault.forget(owner,credential); throw Error('无法添加账号，请确认账号资料或是否已登录') }
        finally { this.provisional.delete(credential.id) }
        if (previous) await pluginAccountVault.forget(owner,previous.credential)
      } else {
        const row = state.rows.find(entry=>entry.id === (id ?? state.active))
        if (!row) throw Error('找不到子账号')
        if (action === 'logout') {
          try { await this.invoke(item.id,'logout',{id:row.id,credential:row.credential},signal) }
          catch { throw Error('插件退出账号失败，原账号仍保留') }
          state.rows = state.rows.filter(entry=>entry.id !== row.id)
          if (state.active === row.id) state.active = state.rows[0]?.id ?? null
          await saveAccounts(owner,state)
          await pluginAccountVault.forget(owner,row.credential)
        } else if (action === 'switch') {
          if (row.expired) throw Error('此账号需要重新登录')
          if (row.id===state.active) return true
          const apply=async()=>{signal.throwIfAborted();state.active=row.id;await saveAccounts(owner,state)}
          if (accountBus.names().includes('account.switch')) {
            const result=await accountBus.run('account.switch',{pluginId:this.publicId,accountId:item.id,fromConnectionId:state.active,connectionId:row.id},{kind:'ui',location:'account-menu'},apply)
            if(result.prevented)return false
          } else await apply()
        }
        else throw Error('未知账号操作')
      }
      publishPluginAccountChanged(this.pluginId)
      const current = state.rows.find(row=>row.id===state.active)
      await this.notify('account.changed',{accountId:item.id,connectionId:state.active,loggedIn:!!current && !current.expired,profile:current && !current.expired ? {id:current.id,displayName:current.summary.displayName,identityScope:'plugin'} : null})
      return true
    })
  }
}
