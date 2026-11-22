import { randomUUID } from 'node:crypto'
import type { CrLyric, OperationTrack } from '@shiqianjiang/ceru-plugin-sdk'
import { lyricResult } from '@shiqianjiang/ceru-plugin-core/operations'
import { normalizeAppTrackRef, isProviderTrackRef } from '@common/pluginMusic'
import { interceptsLyrics, lyricBus } from './bus'

/** Keep the provider/cache document intact; expose only lyric content and a public identity. */
export async function runLyrics(song: {source:string;songmid:string|number;name?:string;singer?:string;pluginResource?:unknown}, load:()=>Promise<CrLyric | null>):Promise<CrLyric | null> {
  if(!interceptsLyrics()) return load()
  const ref=normalizeAppTrackRef(song.pluginResource)
  const provider=ref?.providerId ?? song.source, id=String(ref?.id ?? song.songmid)
  const portable=provider!=='local' && provider!=='private' && (!ref || isProviderTrackRef(ref)) && /^[\w.-]{1,128}$/.test(provider) && /^[\w.-]{1,256}$/.test(id)
  const track:OperationTrack={ref:{kind:'track',providerId:portable?provider:'private',id:portable?id:randomUUID()},title:String(song.name??'').slice(0,512),metadata:{artists:String(song.singer??'').split('、').filter(Boolean).slice(0,32).map(artist=>artist.slice(0,256))}}
  const state:{original:CrLyric|null;failure?:unknown}={original:null}
  const loaded=await lyricBus.run('lyrics.load',{track},{kind:'system',location:'lyrics'},async()=>{
    try {state.original=await load()} catch(error) {state.failure=error;return null}
    return state.original ? lyricResult('lyrics.load',{...state.original,track:track.ref},{track}) : null
  })
  const lyric=loaded.result??null
  const transformed=await lyricBus.run('lyrics.transform',{track,lyric},{kind:'system',location:'lyrics'},async input=>'lyric' in input?input.lyric:null)
  const result=transformed.result??null
  if(!result) {if(state.failure)throw state.failure;return null}
  return {...result,track:state.original?.track ?? ref ?? {pluginId:'host.lyrics',providerId:song.source,kind:'track',id:String(song.songmid)}}
}
