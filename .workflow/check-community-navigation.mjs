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
const output=resolve('.workflow/community-navigation')
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
 const name=()=>page.locator('.post-modal-mask:not(.is-departing) .post-modal .author .name').textContent()
 const wheel=async(selector,deltaY=120)=>{await page.locator('.post-modal-mask:not(.is-departing) '+selector).dispatchEvent('wheel',{deltaY,deltaX:0,deltaMode:0,bubbles:true,cancelable:true})}
 const settled=()=>page.waitForTimeout(580)
 const open=async id=>{await page.locator(`[data-post-id="${id}"]`).dispatchEvent('click');await settled()}
 await open('p15');assert.equal(await name(),'作者15');await page.evaluate(()=>window.savedIndicator=document.querySelector('.position-current'))
 assert.equal((await page.evaluate(()=>window.listCalls)).length,1)
 const regions=await page.evaluate(()=>{const drag=document.querySelector('.modal-titlebar-drag'),close=document.querySelector('.close-btn'),d=drag.getBoundingClientRect(),c=close.getBoundingClientRect();return {drag:getComputedStyle(drag).getPropertyValue('-webkit-app-region'),close:getComputedStyle(close).getPropertyValue('-webkit-app-region'),overlap:d.bottom>c.top,hit:document.elementFromPoint(c.x+c.width/2,c.y+c.height/2).closest('.close-btn')!==null}})
 assert.deepEqual(regions,{drag:'drag',close:'no-drag',overlap:false,hit:true})
 await page.evaluate(()=>{window.trace=[];window.traceActive=true;function sample(){if(!window.traceActive)return;const m=document.querySelector('.post-modal-mask:not(.is-departing) .post-modal');if(m){const s=getComputedStyle(m);const pill=document.querySelector('.position-pill');const pillMatrix=pill?new DOMMatrix(getComputedStyle(pill).transform):null;window.trace.push({pillX:pillMatrix?.a,pillY:pillMatrix?.d,name:m.querySelector('.author .name')?.textContent,y:new DOMMatrix(s.transform).m42,opacity:Number(s.opacity),outY:document.querySelector('.is-departing .post-modal')?new DOMMatrix(getComputedStyle(document.querySelector('.is-departing .post-modal')).transform).m42:null})}requestAnimationFrame(sample)}sample()})
 for(let i=0;i<5;i++){await wheel('.post-modal .left',40);await page.waitForTimeout(50)}
 await settled();assert.equal(await name(),'作者16')
 assert.ok(await page.evaluate(()=>window.trace.some(s=>s.name==='作者16'&&s.y>1&&s.opacity>0&&s.opacity<1)))
 assert.ok(await page.evaluate(()=>window.trace.some(s=>s.name==='作者16'&&s.y>20&&s.outY< -20)));
 assert.equal(await page.locator('.position-dot').count(),10);assert.equal(await page.locator('.position-dot.active').count(),1);assert.equal(await page.locator('.note-position').getAttribute('aria-label'),'第 16 篇，共 25 篇笔记');
 const dots=await page.locator('.note-position').boundingBox(),modal=await page.locator('.post-modal').boundingBox();assert.ok(dots.x>modal.x+modal.width);
 assert.equal(await page.evaluate(()=>window.savedIndicator===document.querySelector('.position-current')),true);assert.ok(await page.evaluate(()=>window.trace.some(s=>s.pillY>1.15&&s.pillX<0.95)));assert.ok(await page.evaluate(()=>window.trace.some(s=>s.pillY<0.98&&s.pillX>1.02)));
 console.log('PASS: indicator DOM persists across notes; capsule stretches then squashes and springs back');
 console.log('PASS: outgoing and incoming pages move simultaneously, 10 dots with one active pill stay outside modal');
 console.log('PASS: title drag region excludes clickable close button; a short wheel burst advances once with upward exit/downward entry')
 const beforeScroll=await page.locator('.content-area').evaluate(e=>e.scrollTop)
 await page.locator('.comments h4').hover();await page.mouse.wheel(0,200);await page.waitForTimeout(250)
 assert.equal(await name(),'作者16');assert.ok(await page.locator('.content-area').evaluate(e=>e.scrollTop)>beforeScroll)
 await wheel('.post-modal .author');await settled();assert.equal(await name(),'作者17')
 assert.deepEqual(await page.evaluate(()=>window.listCalls.map(c=>c.page)),[1,2])
 for (let i=18;i<=20;i++){await wheel('.action-bar');await settled();assert.equal(await name(),'作者'+i)}
 await wheel('.post-modal .left');await page.waitForTimeout(230)
 assert.equal(await name(),'作者20');assert.equal(await page.locator('.post-modal').getAttribute('aria-busy'),'true')
 assert.deepEqual(await page.evaluate(()=>window.listCalls.map(c=>c.page)),[1,2])
 await page.evaluate(()=>window.releasePage());await settled();assert.equal(await name(),'作者21')
 assert.equal(await page.locator('.note-card').count(),25)
 assert.equal(await page.locator('[data-post-id="p21"]').count(),1)
 console.log('PASS: comments scroll independently; prefetch starts with exactly 3 remaining; boundary waits for shared request; deduplicated new page appears in outside list')
 await page.locator('.post-modal .actions-left .action').first().click();await page.waitForTimeout(80)
 assert.equal(await page.locator('[data-post-id="p21"] .like').textContent(),'1')
 await page.evaluate(()=>window.trace=[])
 await wheel('.post-modal .author',-120);await settled();assert.equal(await name(),'作者20')
 assert.ok(await page.evaluate(()=>window.trace.some(s=>s.name==='作者20'&&s.y< -1&&s.opacity>0&&s.opacity<1)))
 await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal').waitFor({state:'detached'})
 assert.equal(await page.locator('.note-card').count(),25)
 await open('p25');await wheel('.post-modal .left');await settled();assert.equal(await name(),'作者25');assert.equal(await page.locator('.position-dot').count(),10);assert.equal(await page.locator('.note-position').getAttribute('aria-label'),'第 25 篇，共 25 篇笔记');assert.equal(await page.locator('.navigation-hint').textContent(),'暂时没有更多笔记了')
 assert.deepEqual(await page.evaluate(()=>window.listCalls.map(c=>c.page)),[1,2])
 await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal').waitFor({state:'detached'})
 await open('p1');await wheel('.post-modal .author',-120);await settled();assert.equal(await name(),'作者1')
 await page.screenshot({path:join(output,'navigation.png')});assert.equal(await page.locator('.position-dot').count(),10);assert.equal(await page.locator('.position-dot').first().getAttribute('class'),'position-dot active')
 await page.evaluate(()=>{window.pillSamples=[];window.samplePill=true;function tick(){if(!window.samplePill)return;const el=document.querySelector('.position-current');if(el)window.pillSamples.push(new DOMMatrix(getComputedStyle(el).transform).m42);requestAnimationFrame(tick)}tick()})
 await wheel('.post-modal .left');await page.waitForTimeout(800);assert.equal(await name(),'作者2')
 assert.ok(await page.evaluate(()=>window.pillSamples.some(y=>y>0&&y<22)))
 assert.ok(await page.evaluate(()=>window.pillSamples.some(y=>y>22.05)))
 assert.ok(await page.locator('.position-current').evaluate(e=>Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42-22)<0.05))
 await page.evaluate(()=>window.samplePill=false)
 console.log('PASS: capsule moves through intermediate positions, overshoots gently, and settles on the next dot')
 console.log('PASS: reverse transition direction; likes share outside state; close works; first/last boundary does not wrap or repeat pagination')
 await page.reload();await page.locator('.note-card').nth(19).waitFor({state:'attached'});await open('p20');await wheel('.post-modal .left');await page.waitForTimeout(100)
 await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal').waitFor({state:'detached'})
 await page.evaluate(()=>window.releasePage());await settled();assert.equal(await page.locator('.post-modal').count(),0);assert.equal(await page.locator('.note-card').count(),25)
 await page.emulateMedia({reducedMotion:'reduce'});await open('p20');await wheel('.post-modal .left');await page.waitForTimeout(80);assert.equal(await name(),'作者21')
 assert.equal(await page.locator('.post-modal').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).m42),0);assert.equal(await page.locator('.position-pill').evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).d),1)
 assert.deepEqual(errors,[])
 console.log('PASS: closing during pending pagination never reopens detail; page still syncs outside; reduced-motion navigation; no runtime errors')
} finally {await browser.close()}
