import {randomUUID} from 'node:crypto'
import type {OperationTrack} from '@shiqianjiang/ceru-plugin-sdk'
import {normalizeAppTrackRef,isProviderTrackRef} from '@common/pluginMusic'

export function operationTrack(song:any):OperationTrack {
  const ref=normalizeAppTrackRef(song.pluginResource)
  const provider=String(ref?.providerId??song.source??''),id=String(ref?.id??song.songmid??'')
  const portable=provider!=='local'&&provider!=='private'&&(!ref||isProviderTrackRef(ref))&&/^[\w.-]{1,128}$/.test(provider)&&/^[\w.-]{1,256}$/.test(id)
  return {ref:{kind:'track',providerId:portable?provider:'private',id:portable?id:randomUUID()},title:String(song.name??'').slice(0,512),metadata:{artists:String(song.singer??'').split('、').filter(Boolean).slice(0,32).map(artist=>artist.slice(0,256))}}
}
