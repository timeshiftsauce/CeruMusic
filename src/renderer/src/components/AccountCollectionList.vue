<script setup lang="ts">
import {ref,onMounted,onBeforeUnmount} from 'vue'
import {useRouter} from 'vue-router'
import { MessagePlugin } from '@renderer/plugin/notifications'
import type {AccountListCapability,ContentEntity} from '@shiqianjiang/ceru-plugin-sdk'
import {desktopBridge} from '@renderer/services/desktopBridge'
import {handlePluginPlayback,openPluginPlaylist} from '@renderer/services/pluginPlaybackBridge'
import {refreshPluginAccounts} from '@renderer/services/pluginAccounts'

const props=defineProps<{capability:AccountListCapability;account:{pluginId:string;id:string;connection:string;title:string;displayName:string;syncLikes:boolean}}>()
const saving=ref(false)
async function toggleSync(value:boolean|string|number){
  if(saving.value)return
  saving.value=true
  try{const {pluginId,id,connection}=props.account;await desktopBridge.api.plugins.accountLikes(pluginId,id,connection,value===true);await refreshPluginAccounts(pluginId)}
  catch{MessagePlugin.error('未能更新此账号的同步设置')}
  finally{saving.value=false}
}
const labels={likes:'我喜欢',playlists:'我的歌单',history:'播放历史',recommend:'每日推荐'}
const router=useRouter(),items=ref<ContentEntity[]>([]),cursor=ref<string>(),loading=ref(false),error=ref('')
const visited=new Set<string>(),keys=new Set<string>()
let active=true
function key(item:ContentEntity){return JSON.stringify([item.ref.providerId,item.ref.kind,item.ref.id])}
async function load(){
  if(!active || loading.value)return
  loading.value=true;error.value=''
  try{
    const {pluginId,id,connection}=props.account
    const page=await desktopBridge.api.plugins.accountCollection(pluginId,id,props.capability,connection,cursor.value)
    if(!active)return
    if(page.nextCursor && visited.has(page.nextCursor))throw Error('平台返回重复的分页游标')
    for(const item of page.items){const identity=key(item);if(!keys.has(identity)){keys.add(identity);items.value.push(item)}}
    if(page.nextCursor)visited.add(page.nextCursor)
    cursor.value=page.nextCursor
  }catch(cause){if(active)error.value=cause instanceof Error?cause.message:'平台列表加载失败'}
  finally{if(active)loading.value=false}
}
async function open(item:ContentEntity){
  try{
    if(item.ref.kind==='playlist')await openPluginPlaylist(router,item.ref,{title:item.title,author:item.playlist?.author,description:item.playlist?.description,total:item.playlist?.trackCount})
    else await handlePluginPlayback('music.play',[[item]])
  }catch(cause){MessagePlugin.error(cause instanceof Error?cause.message:'无法打开平台资源')}
}
onMounted(load)
onBeforeUnmount(()=>{active=false})
</script>
<template>
  <section class="account-collection" :data-account-collection="capability" :aria-label="account.title+' · '+labels[capability]" :aria-busy="loading">
    <header><h3>{{ account.title }} · {{ labels[capability] }}</h3><span>{{ account.displayName }}</span><label v-if="capability==='likes'">同步点赞 <t-switch size="small" role="switch" :tabindex="saving?-1:0" aria-label="同步点赞" :aria-checked="account.syncLikes" :aria-disabled="saving" @keydown.space.prevent="toggleSync(!account.syncLikes)" @keydown.enter.prevent="toggleSync(!account.syncLikes)" :value="account.syncLikes" :disabled="saving" @change="toggleSync" /></label></header>
    <ul v-if="items.length"><li v-for="item in items" :key="key(item)"><button type="button" :disabled="item.playable===false && item.ref.kind==='track'" @click="open(item)">
      <t-icon :name="item.ref.kind==='playlist'?'folder-open':'play-circle'" /><strong>{{ item.title }}</strong><span>{{ item.metadata?.artists?.join('、') || item.playlist?.author }}</span>
    </button></li></ul>
    <p v-if="error" role="alert">{{ error }} <t-button variant="text" size="small" @click="load">重试</t-button></p>
    <p v-else-if="loading" role="status">正在加载…</p>
    <p v-else-if="!items.length">暂无内容</p>
    <t-button v-else-if="cursor" variant="text" size="small" @click="load">加载更多</t-button>
  </section>
</template>
<style scoped>
.account-collection{margin:18px 0;text-align:start}.account-collection header,.account-collection button{display:flex;align-items:center;gap:10px}.account-collection h3{margin:0;font-size:16px}.account-collection span,.account-collection p{color:var(--td-text-color-secondary)}.account-collection ul{list-style:none;padding:0;margin:8px 0}.account-collection li button{width:100%;min-height:36px;border:0;background:transparent;color:inherit;text-align:start;cursor:pointer}.account-collection li button:is(:hover,:focus-visible){background:var(--td-bg-color-container-hover)}.account-collection strong,.account-collection span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-collection strong{flex:1;font-weight:500}
</style>
