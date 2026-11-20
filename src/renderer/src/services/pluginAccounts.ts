import { desktopBridge } from '@renderer/services/desktopBridge'
import { computed, shallowRef } from 'vue'
import type { AccountSummary,ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import { MessagePlugin } from 'tdesign-vue-next'
import { activePluginContributions } from './pluginState'

export const pluginAccountItems = computed(() =>
  activePluginContributions.value.flatMap(({ pluginId, descriptor }) =>
    (descriptor.accounts ?? []).map((item) => ({
      ...item,
      ...item.legacy,
      runtime:descriptor.runtime,
      ownerId:descriptor.id,
      pluginId,
      key: `plugin-account:${pluginId}:${item.id}`
    }))
  )
)
export const pluginAccountSummaries = shallowRef<Record<string, AccountSummary>>({})
export const pluginConnections = shallowRef<Record<string,{active:string|null;rows:{id:string;expired?:boolean;syncLikes?:boolean;summary:AccountSummary}[]}>>({})
export const accountLikesRevision=shallowRef(0)
export async function syncPlatformLike(song:{pluginResource?:ResourceRef}|unknown,liked:boolean){
  const ref=(song as {pluginResource?:ResourceRef})?.pluginResource
  if(!ref || ref.kind!=='track')return
  const target=pluginAccountItems.value.find(item=>item.runtime===3 && item.ownerId===ref.pluginId && item.capabilities?.includes('likes') && item.providers?.includes(ref.providerId))
  if(!target)return
  const state=pluginConnections.value[target.key],row=state?.rows.find(entry=>entry.id===state.active && entry.syncLikes && !entry.expired)
  if(!row || (ref.connectionId!==undefined && ref.connectionId!==row.id))return
  try{await desktopBridge.api.plugins.accountLikes(target.pluginId,target.id,row.id,liked,{kind:'track',pluginId:ref.pluginId,providerId:ref.providerId,id:ref.id,connectionId:row.id});accountLikesRevision.value++}
  catch{MessagePlugin.warning('本地收藏已更新，平台同步未确认成功')}
}
const revisions = new Map<string, number>()

/** Only public, plugin-declared summaries reach the account menu. */
export async function refreshPluginAccounts(pluginId?: string,validate=false) {
  const items = pluginAccountItems.value
  const keys = new Set(items.map((item) => item.key))
  pluginAccountSummaries.value = Object.fromEntries(
    Object.entries(pluginAccountSummaries.value).filter(([key]) => keys.has(key))
  )
  pluginConnections.value = Object.fromEntries(Object.entries(pluginConnections.value).filter(([key])=>keys.has(key)))
  await Promise.all(
    items
      .filter((item) => !pluginId || item.pluginId === pluginId)
      .map(async (item) => {
        const revision = (revisions.get(item.key) ?? 0) + 1
        revisions.set(item.key, revision)
        try {
          const connections = item.runtime === 3 ? await desktopBridge.api.plugins.accountConnections(item.pluginId,item.id,validate) : undefined
          const summary = connections ? connections.rows.find(row=>row.id===connections.active)?.summary ?? {signedIn:false,displayName:'未登录'} : await desktopBridge.api.plugins.accountSummary(item.pluginId, item.id)
          if (
            revisions.get(item.key) !== revision ||
            !pluginAccountItems.value.some((current) => current.key === item.key)
          )
            return
          if (connections) pluginConnections.value = {...pluginConnections.value,[item.key]:connections}
          pluginAccountSummaries.value = { ...pluginAccountSummaries.value, [item.key]: summary }
        } catch {
          if (revisions.get(item.key) !== revision) return
          const next = { ...pluginAccountSummaries.value }
          delete next[item.key]
          const remaining={...pluginConnections.value};delete remaining[item.key];pluginConnections.value=remaining
          pluginAccountSummaries.value = next
        }
      })
  )
}
