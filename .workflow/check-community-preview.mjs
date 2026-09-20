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
const output=resolve('.workflow/community-preview')
await mkdir(output,{recursive:true})
let styles=[]
const mock={
 '@renderer/api/community':'export const communityAPI={getPost:async()=>globalThis.fixturePost,listComments:async()=>({items:[]})}',
 '@renderer/api/cloudSongList':'export const cloudSongListAPI={getUserSongLists:async()=>[],getSongListDetail:async()=>({list:[]})}',
 '@renderer/api/songList':'export default {getAll:async()=>({success:true,data:[]}),search:async()=>({success:true,data:[]}),create:async()=>({success:false})}',
 '@renderer/store/LocalUserDetail':'export const LocalUserDetailStore=()=>({userInfo:{}})',
 '@renderer/utils/ossImage':'export const ossAvatar=x=>x,ossCard=x=>x,ossThumb=x=>x',
 'vue-router':'export const useRouter=()=>({push(){}})'
}
await build({stdin:{contents:`
import {createApp,ref,h} from 'vue'; import TDesign from 'tdesign-vue-next';
import Composer from './PostCreateDialog.vue'; import Note from './TextNoteCover.vue'; import Detail from './PostDetailModal.vue';
import {noteCoverLayout,noteCoverTheme} from './noteCoverTheme';
const sample='大家好呀，来试试我们的笔记功能吧。\\n把日子写成歌，把喜欢留在这里。';
const seeds=[];const types=new Set();for(let i=0;types.size<9;i++){const seed='note-'+i;const type=noteCoverTheme(seed)['--note-font'];if(!types.has(type)){types.add(type);seeds.push(seed)}}
window.fixturePost={id:'demo',username:'听歌的人',content:sample,images:[],attachment:null,createdAt:new Date().toISOString(),likeCount:0,commentCount:0};
createApp({setup(){const mode=ref('notes'),opened=ref(true);window.previewMode=m=>{mode.value=m;opened.value=true};return()=>h('main',{},[
mode.value==='notes'?h('div',{class:'gallery'},seeds.map(seed=>h('div',{},[h(Note,{seed,content:sample}),h('p',{class:'caption'},noteCoverTheme(seed)['--note-font'])]))):null,
mode.value==='composer'?h(Composer,{visible:opened.value,'onUpdate:visible':v=>opened.value=v}):null,
mode.value==='detail'&&opened.value?h(Detail,{postId:'demo',initialPost:window.fixturePost,onClose:()=>opened.value=false}):null
])}}).use(TDesign).mount('#app');`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',outfile:join(output,'preview.js'),loader:{'.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},plugins:[{name:'sfc',setup(b){
b.onResolve({filter:/.*/},a=>Object.hasOwn(mock,a.path)?{path:a.path,namespace:'mock'}:undefined)
b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mock[a.path]}))
b.onLoad({filter:/\.vue$/},async a=>{const {descriptor,errors}=parse(await readFile(a.path,'utf8'),{filename:a.path});if(errors.length)throw errors[0];const id='data-v-'+Buffer.from(a.path).toString('hex').slice(-18);for(const s of descriptor.styles){const compiled=await compileStyleAsync({source:s.content,filename:a.path,id,scoped:s.scoped,preprocessLang:s.lang,preprocessCustomRequire:id=>require(id==='sass'?'sass-embedded':id)});if(compiled.errors.length)throw compiled.errors[0];styles.push(compiled.code)}const script=compileScript(descriptor,{id,inlineTemplate:true,genDefaultAs:'component'});return {contents:script.content+`\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,loader:'ts',resolveDir:dirname(a.path)}})
}}]})
let css=styles.join('\n')
for (const match of [...css.matchAll(/url\(['"]?\.\.\/\.\.\/assets\/fonts\/([^'"\)]+)['"]?\)/g)]) {
 const data=await readFile('src/renderer/src/assets/fonts/'+match[1]);css=css.replace(match[0],`url(data:font/woff2;base64,${data.toString('base64')})`)
}
for (const [family,file,format] of [['lyricfont','lyricfont.ttf','truetype'],['PingFangSC-Semibold','PingFangSC-Semibold.woff2','woff2']]) {
 const data=await readFile('src/renderer/src/assets/'+file);css+=`@font-face{font-family:'${family}';src:url(data:font/${format};base64,${data.toString('base64')}) format('${format}');}`
}
await writeFile(join(output,'preview.css'),await readFile('node_modules/tdesign-vue-next/dist/tdesign.css','utf8')+'\n'+css)
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4;--td-brand-color-hover:#ee567c;--td-brand-color-active:#dd476d}body{margin:0;background:#f5f2ef;font-family:Arial,'Microsoft YaHei',sans-serif}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:50px 35px}.caption{color:#897e76;font-size:12px;text-align:center}</style><div id="app"></div><script src="preview.js"></script>`)
const browser=await chromium.launch({channel:'msedge',headless:true})
try{const page=await browser.newPage({viewport:{width:1286,height:807}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(join(output,'index.html')).href);await page.evaluate(()=>document.fonts.ready);
const loaded=await page.evaluate(()=>[...document.querySelectorAll('.note-writing p')].map(e=>{const family=getComputedStyle(e).fontFamily.split(',')[0];return {family,loaded:document.fonts.check('28px '+family,'音乐随记')}}));assert.equal(new Set(loaded.map(x=>x.family)).size,9);assert.ok(loaded.every(x=>x.loaded));console.log('PASS: all nine bundled fonts loaded in actual note components');await page.screenshot({path:join(output,'fonts.png'),fullPage:true});
await page.evaluate(()=>window.previewMode('composer'));await page.getByRole('textbox',{name:'笔记正文'}).waitFor();
const sizing=await page.evaluate(()=>{const box=document.querySelector('.heading-icon').getBoundingClientRect(),svg=document.querySelector('.heading-icon svg').getBoundingClientRect();return {dx:Math.abs(box.x+box.width/2-svg.x-svg.width/2),dy:Math.abs(box.y+box.height/2-svg.y-svg.height/2),resize:getComputedStyle(document.querySelector('textarea')).resize}});assert.ok(sizing.dx<1&&sizing.dy<1,JSON.stringify(sizing));assert.equal(sizing.resize,'none');await page.screenshot({path:join(output,'composer.png')});await page.getByRole('textbox',{name:'笔记正文'}).fill('今晚的晚风，刚好配这首歌。');assert.equal(await page.getByRole('button',{name:'发布笔记',exact:true}).isEnabled(),true);
await page.evaluate(()=>window.previewMode('detail'));await page.getByRole('button',{name:'关闭详情'}).waitFor();await page.waitForTimeout(600);assert.equal(await page.locator('.close-btn').evaluate(e=>getComputedStyle(e).getPropertyValue('-webkit-app-region')),'no-drag');await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal-mask').waitFor({state:'detached'});

await page.evaluate(()=>{window.fixturePost={...window.fixturePost,id:'long',content:'这是一篇很长的音乐随记。'.repeat(100)};window.previewMode('detail')});
await page.locator('.note-writing').waitFor();await page.waitForTimeout(550);
const long=await page.locator('.note-writing').evaluate(e=>({scroll:e.scrollHeight>e.clientHeight,overflow:getComputedStyle(e).overflowY}));assert.equal(long.overflow,'auto');assert.equal(long.scroll,true);await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal-mask').waitFor({state:'detached'});
await page.evaluate(()=>{const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><defs><linearGradient id="g"><stop stop-color="#81c6ac"/><stop offset="1" stop-color="#eeb9cc"/></linearGradient></defs><rect width="1000" height="500" fill="url(#g)"/><text x="180" y="270" font-size="90" fill="#24443f">Ceru Music</text></svg>');window.fixturePost={...window.fixturePost,id:'artwork',content:'分享一首好歌',images:[],attachment:{type:'song',song:{name:'晚风',singer:'测试歌手',img:image}}};window.previewMode('detail')});
await page.locator('.big-img').waitFor();await page.waitForTimeout(550);assert.equal(await page.locator('.image-backdrop').evaluate(e=>getComputedStyle(e).filter),'blur(64px) brightness(0.8)');await page.screenshot({path:join(output,'artwork-detail.png')});await page.getByRole('button',{name:'关闭详情'}).click();await page.locator('.post-modal-mask').waitFor({state:'detached'});
console.log('PASS: long handwritten note scrolls, attachment artwork fills detail with 64px blur');
assert.deepEqual(errors,[]);console.log('PASS: actual Vue components rendered; handwritten templates, centered icon, no native resize handle, composer input, detail close');console.log(output)
}finally{await browser.close()}
