import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {parse,compileScript,compileStyleAsync} from '@vue/compiler-sfc'
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const root=resolve('src/renderer/src/components/community')
const output=resolve('.workflow/community-continuous-navigation')
await mkdir(output,{recursive:true})
let styles=[]
const mock={
 '@renderer/api/community':'export const communityAPI={listPosts:args=>window.listPosts(args),getPost:async id=>window.fixturePosts.find(p=>p.id===id),listComments:async id=>({items:Array.from({length:25},(_,i)=>({id:id+String(i),postId:id,userId:2,username:"评论用户",content:"评论内容，不应触发笔记切换。",createdAt:new Date().toISOString(),likeCount:0}))}),toggleLike:async()=>({liked:true})}',
 '@renderer/api/cloudSongList':'export const cloudSongListAPI={getSongListDetail:()=>new Promise(r=>window.resolvePlaylist=r)}',
 '@renderer/api/songList':'export default {getAll:async()=>({success:true,data:[]}),search:async()=>({success:true,data:[]}),create:async()=>({success:false})}',
 '@renderer/store/LocalUserDetail':'export const LocalUserDetailStore=()=>({userInfo:{}})',
 '@renderer/utils/ossImage':'export const ossAvatar=x=>x,ossCard=x=>x,ossThumb=x=>x',
 'vue-router':'export const useRouter=()=>({push(){}})'
}
await build({stdin:{contents:`
import {createApp} from 'vue'; import TDesign from 'tdesign-vue-next';
import Community from '../../views/community/index.vue';
const img='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#abc"/></svg>');
window.fixturePosts=Array.from({length:25},(_,i)=>({id:'p'+(i+1),userId:1,username:'作者'+(i+1),userAvatar:'',content:'笔记 '+(i+1),images:[{url:img,w:900,h:600}],attachment:null,createdAt:new Date().toISOString(),likeCount:0,commentCount:25,liked:false}));
window.listCalls=[];window.listPosts=args=>{window.listCalls.push(args);if(args.page===1)return Promise.resolve({items:window.fixturePosts.slice(0,20),total:25});return new Promise((resolve,reject)=>{window.releasePage=()=>resolve({items:window.fixturePosts.slice(19),total:25});window.rejectPage=()=>reject(new Error('测试分页失败'))})};
createApp(Community).use(TDesign).mount('#app');
`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',outfile:join(output,'preview.js'),loader:{'.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},plugins:[{name:'sfc',setup(b){
b.onResolve({filter:/.*/},a=>Object.hasOwn(mock,a.path)?{path:a.path,namespace:'mock'}:a.path.startsWith('@renderer/')?{path:resolve('src/renderer/src',a.path.slice(10))}:undefined)
b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mock[a.path]}))
b.onLoad({filter:/\.vue$/},async a=>{const {descriptor,errors}=parse(await readFile(a.path,'utf8'),{filename:a.path});if(errors.length)throw errors[0];const id='data-v-'+Buffer.from(a.path).toString('hex').slice(-18);for(const s of descriptor.styles){const compiled=await compileStyleAsync({source:s.content,filename:a.path,id,scoped:s.scoped,preprocessLang:s.lang,preprocessCustomRequire:id=>require(id==='sass'?'sass-embedded':id)});if(compiled.errors.length)throw compiled.errors[0];styles.push(compiled.code)}const script=compileScript(descriptor,{id,inlineTemplate:true,genDefaultAs:'component'});return {contents:script.content+`\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,loader:'ts',resolveDir:dirname(a.path)}})
}}]})

const css=styles.join('\n').replace(/url\((['"]?)(\.\.\/\.\.\/assets\/[^)'" ]+)\1\)/g,(_,quote,p)=>`url("${pathToFileURL(resolve(root,p)).href}")`)
await writeFile(join(output,'preview.css'),await readFile('node_modules/tdesign-vue-next/dist/tdesign.css','utf8')+'\n'+css)
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4}html,body,#app{height:100%;overflow:hidden}body{margin:0;font-family:Arial,'Microsoft YaHei',sans-serif}</style><div id="app"></div><script src="preview.js"></script>`)


const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1100,height:826}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(pathToFileURL(join(output,'index.html')).href)
 await page.locator('.note-card').nth(19).waitFor({state:'attached'})
 const current=()=>page.locator('.post-modal-mask:not(.is-departing) .author .name').textContent()
 const wheel=(deltaY,target='.left')=>page.locator('.post-modal-mask:not(.is-departing) '+target).dispatchEvent('wheel',{deltaY,deltaX:0,bubbles:true,cancelable:true})
 const settled=()=>page.waitForTimeout(570)
 const open=async id=>{await page.locator(`[data-post-id="${id}"]`).dispatchEvent('click');await settled()}
 const close=async()=>{await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal').waitFor({state:'detached'})}
 await open('p1')
 await wheel(30);await wheel(30);assert.equal(await current(),'作者1')
 await wheel(25);await page.waitForTimeout(20);assert.equal(await current(),'作者2')
 for(let i=0;i<5;i++){await wheel(1000);await page.waitForTimeout(35)}
 await settled();assert.equal(await current(),'作者2')
 await wheel(40);assert.equal(await current(),'作者2');await wheel(40);await settled();assert.equal(await current(),'作者3')
 console.log('PASS: 80px threshold; large events do not queue extra pages; small input below threshold stays on current note')
 const sequence=[3]
 for(let i=0;i<55;i++){await wheel(30);await page.waitForTimeout(30);const n=Number((await current()).replace('作者',''));if(sequence.at(-1)!==n)sequence.push(n)}
 assert.ok(sequence.length>=4,JSON.stringify(sequence));assert.ok(sequence.every((n,i)=>i===0||n===sequence[i-1]+1),JSON.stringify(sequence))
 await settled();assert.equal(await current(),'作者'+sequence.at(-1))
 const reverse=[sequence.at(-1)]
 for(let i=0;i<40;i++){await wheel(-30);await page.waitForTimeout(30);const n=Number((await current()).replace('作者',''));if(reverse.at(-1)!==n)reverse.push(n)}
 assert.ok(reverse.length>=3,JSON.stringify(reverse));assert.ok(reverse.every((n,i)=>i===0||n===reverse[i-1]-1),JSON.stringify(reverse));await settled()
 const before=await current();for(let i=0;i<5;i++)await wheel(150,'.comments');assert.equal(await current(),before)
 console.log('PASS: uninterrupted forward/backward scrolling advances consecutive notes; stopping does not drain a queue; comments do not navigate')
 await close();await open('p1')
 await page.getByRole('button',{name:'跳到第 8 篇笔记',exact:true}).click();await settled();assert.equal(await current(),'作者8')
 await page.getByRole('button',{name:'跳到第 6 篇笔记',exact:true}).click();await settled();assert.equal(await current(),'作者6')
 await page.getByRole('button',{name:'跳到第 4 篇笔记',exact:true}).focus();await page.keyboard.press('Enter');await settled();assert.equal(await current(),'作者4')
 assert.equal(await page.getByRole('button',{name:'跳到第 4 篇笔记',exact:true}).isDisabled(),true)
 assert.equal(await page.locator('.position-dot').count(),10)
 console.log('PASS: dots click directly forward/backward; keyboard activation works; active dot is disabled; maximum 10 dots')
 await close();await open('p17');await page.getByRole('button',{name:'跳到第 22 篇笔记',exact:true}).click();await page.waitForTimeout(120)
 assert.equal(await current(),'作者17');assert.deepEqual(await page.evaluate(()=>window.listCalls.map(c=>c.page)),[1,2])
 await page.evaluate(()=>window.releasePage());await settled();assert.equal(await current(),'作者22');assert.equal(await page.locator('.note-card').count(),25)
 assert.deepEqual(await page.evaluate(()=>window.listCalls.map(c=>c.page)),[1,2])
 assert.deepEqual(errors,[]);console.log('PASS: clicking an unloaded dot shares in-flight pagination and appends to the outside list; no runtime errors')
} finally {await browser.close()}
