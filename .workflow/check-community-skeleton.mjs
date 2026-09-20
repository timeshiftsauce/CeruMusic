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
const output=resolve('.workflow/community-skeleton')
await mkdir(output,{recursive:true})
let styles=[]
const mock={
 '@renderer/api/community':'export const communityAPI={getPost:()=>new Promise(r=>window.resolvePost=r),listComments:()=>new Promise(r=>window.resolveComments=r)}',
 '@renderer/api/cloudSongList':'export const cloudSongListAPI={getSongListDetail:()=>new Promise(r=>window.resolvePlaylist=r)}',
 '@renderer/api/songList':'export default {getAll:async()=>({success:true,data:[]}),search:async()=>({success:true,data:[]}),create:async()=>({success:false})}',
 '@renderer/store/LocalUserDetail':'export const LocalUserDetailStore=()=>({userInfo:{}})',
 '@renderer/utils/ossImage':'export const ossAvatar=x=>x,ossCard=x=>x,ossThumb=x=>x',
 'vue-router':'export const useRouter=()=>({push(){}})'
}
await build({stdin:{contents:`
import {createApp,ref,h,nextTick} from 'vue'; import TDesign from 'tdesign-vue-next';
import Detail from './PostDetailModal.vue';
createApp({setup(){const opened=ref(false),initial=ref(null),key=ref(0); window.openFixture=async p=>{opened.value=false;await nextTick();initial.value=p;key.value++;opened.value=true;await nextTick()};return()=>opened.value?h(Detail,{key:key.value,postId:'demo',initialPost:initial.value,onClose:()=>opened.value=false}):null}}).use(TDesign).mount('#app');
`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',outfile:join(output,'preview.js'),loader:{'.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},plugins:[{name:'sfc',setup(b){
b.onResolve({filter:/.*/},a=>Object.hasOwn(mock,a.path)?{path:a.path,namespace:'mock'}:undefined)
b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mock[a.path]}))
b.onLoad({filter:/\.vue$/},async a=>{const {descriptor,errors}=parse(await readFile(a.path,'utf8'),{filename:a.path});if(errors.length)throw errors[0];const id='data-v-'+Buffer.from(a.path).toString('hex').slice(-18);for(const s of descriptor.styles){const compiled=await compileStyleAsync({source:s.content,filename:a.path,id,scoped:s.scoped,preprocessLang:s.lang,preprocessCustomRequire:id=>require(id==='sass'?'sass-embedded':id)});if(compiled.errors.length)throw compiled.errors[0];styles.push(compiled.code)}const script=compileScript(descriptor,{id,inlineTemplate:true,genDefaultAs:'component'});return {contents:script.content+`\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,loader:'ts',resolveDir:dirname(a.path)}})
}}]})

const css=styles.join('\n').replace(/url\((['"]?)(\.\.\/\.\.\/assets\/[^)'" ]+)\1\)/g,(_,quote,p)=>`url("${pathToFileURL(resolve(root,p)).href}")`)
await writeFile(join(output,'preview.css'),await readFile('node_modules/tdesign-vue-next/dist/tdesign.css','utf8')+'\n'+css)
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4}body{margin:0;font-family:Arial,'Microsoft YaHei',sans-serif}</style><div id="app"></div><script src="preview.js"></script>`)
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1286,height:807}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const imageRequests=[]
 await page.route('https://fixture.test/**',route=>new Promise(resolve=>imageRequests.push(async()=>{await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#a5b4c3"/><text x="280" y="320" font-size="60">Ceru Music</text></svg>'});resolve()})))
 await page.goto(pathToFileURL(join(output,'index.html')).href)
 const post={id:'demo',username:'听歌的人',userAvatar:'https://fixture.test/avatar.svg',content:'今天这首歌很好听，分享给大家。',images:['https://fixture.test/image.svg'],attachment:{type:'song',song:{name:'晚风',singer:'测试歌手',img:'https://fixture.test/cover.svg'}},createdAt:new Date().toISOString(),likeCount:0,commentCount:20}
 const boxes=()=>page.evaluate(()=>Object.fromEntries(['.post-modal','.left','.right','.author','.content-area','.action-bar'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,[r.x,r.y,r.width,r.height]]})))
 const same=(a,b,label)=>{for(const key of Object.keys(a))for(let i=0;i<4;i++)assert.ok(Math.abs(a[key][i]-b[key][i])<0.6,`${label}: ${key} ${JSON.stringify(a[key])} -> ${JSON.stringify(b[key])}`)}
 await page.evaluate(()=>window.openFixture(null));await page.waitForTimeout(550)
 assert.equal(await page.locator('.skeleton-footer').count(),1)
 assert.equal(await page.locator('.empty').count(),0)
 const cold=await boxes();await page.screenshot({path:join(output,'loading.png')})
 await page.evaluate(p=>window.resolvePost(p),post)
 await page.locator('.att-player').waitFor();same(cold,await boxes(),'post loaded')
 await page.waitForFunction(()=>{const el=document.querySelector('.post-skeleton.skeleton-fade-leave-active');return el && Number(getComputedStyle(el).opacity)>0 && Number(getComputedStyle(el).opacity)<1})
 const duringFade=await boxes();same(cold,duringFade,'during fade')
 await page.locator('.post-skeleton').waitFor({state:'detached'})
 console.log('PASS: skeleton opacity transitions through intermediate values without moving layout')
 assert.equal(await page.locator('.comments-skeleton').count(),1)
 assert.equal(await page.locator('.author-avatar .skeleton').count(),1)
 assert.equal(await page.locator('.att-cover .skeleton').count(),1)
 const attachmentBefore=await page.locator('.att-player').boundingBox()
 await page.evaluate(()=>window.resolveComments({items:Array.from({length:20},(_,i)=>({id:String(i),username:'评论用户',content:'测试评论内容，用于检查滚动区域布局。',createdAt:new Date().toISOString(),likeCount:0}))}))
 await page.locator('.comment').first().waitFor();same(cold,await boxes(),'comments loaded')
 await page.waitForTimeout(100)
 await Promise.all(imageRequests.splice(0).map(release=>release()))
 await page.locator('.author-avatar .skeleton').waitFor({state:'detached'})
 await page.locator('.att-cover .skeleton').waitFor({state:'detached'})
 await page.locator('.left .image-skeleton').waitFor({state:'detached'})
 same(cold,await boxes(),'images loaded')
 assert.deepEqual(attachmentBefore,await page.locator('.att-player').boundingBox())
 await page.screenshot({path:join(output,'loaded.png')})
 console.log('PASS: cold load, independent image/comment skeletons; modal/columns/header/footer/content bounds stable')
 await page.evaluate(p=>window.openFixture(p),{...post,images:[],userAvatar:'',attachment:{type:'playlist',name:'我的歌单',listId:'test',songCount:3}})
 await page.waitForTimeout(550)
 assert.equal(await page.locator('.skeleton-footer').count(),0)
 assert.equal(await page.locator('.att-playlist').count(),1)
 const warm=await boxes(),textBefore=await page.locator('.content-text').boundingBox(),playlistBefore=await page.locator('.att-playlist').boundingBox()
 await page.evaluate(()=>window.resolvePlaylist({list:[{img:'https://fixture.test/playlist.svg'}]}))
 await page.locator('.big-img').waitFor()
 await page.waitForTimeout(100);await Promise.all(imageRequests.splice(0).map(release=>release()))
 await page.locator('.left .image-skeleton').waitFor({state:'detached'})
 same(warm,await boxes(),'playlist fallback loaded')
 assert.deepEqual(textBefore,await page.locator('.content-text').boundingBox());assert.deepEqual(playlistBefore,await page.locator('.att-playlist').boundingBox())
 console.log('PASS: existing post retained during refresh; asynchronous playlist artwork does not insert/move post text or attachment')
 await page.setViewportSize({width:820,height:740})
 await page.evaluate(()=>window.openFixture(null));await page.waitForTimeout(550);const narrow=await boxes()
 await page.evaluate(p=>{window.resolvePost(p);window.resolveComments({items:[]})},post)
 await page.locator('.att-player').waitFor();same(narrow,await boxes(),'narrow layout')
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.evaluate(()=>window.openFixture(null));await page.waitForTimeout(550)
 assert.equal(await page.locator('.skeleton').first().evaluate(e=>getComputedStyle(e).animationName),'none')
 await page.evaluate(p=>window.resolvePost(p),post);await page.locator('.att-player').waitFor()
 assert.equal(await page.locator('.detail-pane').first().evaluate(e=>getComputedStyle(e).animationName),'none')
 assert.deepEqual(errors,[]);console.log('PASS: narrow viewport stable; reduced motion respected; no browser runtime errors')
} finally {await browser.close()}
