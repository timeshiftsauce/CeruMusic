import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'

async function load(path,mocks={}){
 const output=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}))}}]})
 const module={exports:{}};runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,console,state,queueMicrotask,setTimeout});return module.exports
}
const state={dialogs:[],joined:[],loggedIn:true}
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve()}
const {createEntryQueue}=await load('src/renderer/src/services/entryQueue.ts')
const {enqueueDeepLink,getPendingDeepLinks,acknowledgeDeepLink}=await load('src/main/router/pendingLinks.ts')
const incoming=[enqueueDeepLink('playlist-share','p'),enqueueDeepLink('listen-together','ABC123'),enqueueDeepLink('song-share','s'),enqueueDeepLink('plugin-file','G:/fixture.js'),enqueueDeepLink('plugin-link','cerumusic://plugin/add/link?url=https://example.test/plugin.js')]
assert.equal(enqueueDeepLink('listen-together','ABC123').sequence,incoming[1].sequence)
assert.deepEqual(Array.from(getPendingDeepLinks(),x=>x.kind),['playlist-share','listen-together','song-share','plugin-file','plugin-link'])
const order=[],errors=[];let release
const queue=createEntryQueue(e=>errors.push(e.message))
const tasks=incoming.map(item=>queue.enqueue(String(item.sequence),async()=>{
 order.push(item.kind)
 if(item.kind==='listen-together')await new Promise(resolve=>{release=resolve})
 acknowledgeDeepLink(item.sequence)
}))
await tick();assert.equal(order.length,0,'wait for home readiness')
queue.setReady(true);await tick();assert.deepEqual(order,['playlist-share','listen-together'])
const duplicate=queue.enqueue(String(incoming[1].sequence),async()=>{throw Error('duplicate executed')})
assert.equal(duplicate,tasks[1])
queue.setReady(false);release();await tick();assert.equal(order.length,2,'navigation away pauses the next item')
queue.setReady(true);await Promise.all(tasks);assert.equal(order[2],'song-share');assert.equal(getPendingDeepLinks().length,0)
await queue.enqueue('failure',async()=>{throw Error('bad link')});await queue.enqueue('after',async()=>{order.push('after')});assert.deepEqual(errors,['bad link'])
assert.equal(order.at(-1),'after')

const invites=await load('src/renderer/src/services/listenTogetherInvite.ts',{
 vue:'export const h=()=>null;',
 'tdesign-vue-next':"export const MessagePlugin={error:()=>{}};export const DialogPlugin={confirm:o=>{state.dialogs.push(o);return {hide(){},destroy(){}}}};",
 '@renderer/components/ListenTogether/parts/shareTextHelper':"export const extractCodeFromShareText=x=>x;",
 '@renderer/api/listenTogether':"export const getRoomPreview=async code=>({code,name:'room'});export const resolveRoom=async({code})=>({code,name:'room',ownerId:'other',maxMembers:2});",
 '@renderer/store/Auth':"export const useAuthStore=()=>({isAuthenticated:state.loggedIn,user:{sub:'me'},login:async()=>{}});",
 '@renderer/store/ListenTogether':"export const useListenTogetherStore=()=>({isInRoom:false,myUserId:'me',resolveAndJoin:async code=>{await new Promise(resolve=>{state.finishJoin=resolve});state.joined.push(code)},openOverlay(){}});"
})
let done=false
const invitation=invites.showListenTogetherInvite('deeplink','ABC123').then(()=>done=true)
await tick();assert.equal(done,false,'dialog opening is not completion')
state.dialogs.shift().onCancel();await invitation
done=false
const joining=invites.showListenTogetherInvite('deeplink','XYZ123').then(()=>done=true)
await tick();void state.dialogs.shift().onConfirm();await tick();assert.equal(done,false,'join must finish before queue advances')
state.finishJoin();await joining;assert.deepEqual(state.joined,['XYZ123'])
console.log('PASS: mixed cold-start FIFO, duplicate suppression, homepage gate, pause/resume, failure recovery, invite cancel/join completion')
