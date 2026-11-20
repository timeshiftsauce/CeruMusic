<script setup lang="ts">
import {computed} from 'vue'
import type {AccountListCapability} from '@shiqianjiang/ceru-plugin-sdk'
import {accountLikesRevision,pluginAccountItems,pluginConnections} from '@renderer/services/pluginAccounts'
import AccountCollectionList from './AccountCollectionList.vue'

const props=defineProps<{capability:AccountListCapability;sourceKey?:string}>()
const accounts=computed(()=>pluginAccountItems.value.flatMap(item=>{
  if(item.runtime!==3 || !item.capabilities?.includes(props.capability) || (props.sourceKey && props.sourceKey!==item.key))return []
  const state=pluginConnections.value[item.key],row=state?.rows.find(entry=>entry.id===state.active && !entry.expired)
  return row?[{pluginId:item.pluginId,id:item.id,connection:row.id,title:item.title,displayName:row.summary.displayName,syncLikes:row.syncLikes===true,key:item.key+':'+row.id}]:[]
}))
</script>
<template>
  <AccountCollectionList v-for="account in accounts" :key="account.key+':'+capability+(capability==='likes'?accountLikesRevision:'')" :account="account" :capability="capability" />
</template>
