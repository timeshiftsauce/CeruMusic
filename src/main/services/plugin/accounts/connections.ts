import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { assertAccountSummary, type AccountConnection, type AccountSummary } from '@shiqianjiang/ceru-plugin-sdk'
import { pluginAccountVault, type AccountOwner } from './vault'
import type { CredentialBinding } from './requestBinding'

type Row = AccountConnection & { summary: AccountSummary; platformId: string; expired?: boolean; syncLikes?:boolean; binding?: CredentialBinding }
interface Accounts { active: string | null; rows: Row[] }
const busy = new Set<string>()
export async function withAccountChange<T>(owner: AccountOwner, task: () => Promise<T>) {
  const key = JSON.stringify([owner.pluginId,owner.accountId])
  if (busy.has(key)) throw Error('账号操作正在进行')
  busy.add(key)
  try { return await task() } finally { busy.delete(key) }
}
export async function readAccounts(owner: AccountOwner): Promise<Accounts> {
  let raw: string
  try { raw = await readFile(join(pluginAccountVault.accountDirectory(owner),'connections.json'),'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {active:null,rows:[]}; throw error }
  const data = JSON.parse(raw)
  if (!Array.isArray(data.rows) || data.rows.length > 64 || (data.active !== null && !data.rows.some((row: Row) => row.id === data.active))) throw Error('账号索引不可用')
  for (const row of data.rows) { assertAccountSummary(row.summary); if (typeof row.id !== 'string' || row.credential?.kind !== 'credential' || typeof row.credential.id !== 'string') throw Error('账号索引不可用') }
  return data
}
export async function saveAccounts(owner: AccountOwner, state: Accounts) {
  const dir = pluginAccountVault.accountDirectory(owner), file = join(dir,'connections.json'), temp = file + '.' + randomUUID()
  await mkdir(dir,{recursive:true,mode:0o700})
  try { await writeFile(temp,JSON.stringify(state),{flag:'wx',mode:0o600}); await rename(temp,file) }
  finally { await rm(temp,{force:true}) }
}
export function accountPresentation(profile: any) {
  if (!profile || typeof profile.id !== 'string' || !profile.id || profile.id.length > 256 || (profile.vip !== undefined && typeof profile.vip !== 'boolean')) throw Error('插件账号资料无效')
  const summary: AccountSummary = { signedIn:true, displayName:profile.displayName, ...(profile.avatar !== undefined ? {avatarUrl:profile.avatar} : {}), ...(profile.vip ? {badge:'会员'} : {}) }
  assertAccountSummary(summary)
  return { platformId:profile.id, summary }
}
