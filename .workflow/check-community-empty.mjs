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
const output=resolve('.workflow/community-empty')
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
window.listCalls=[];window.listPosts=args=>{window.listCalls.push(args);if(args.page===1)return Promise.resolve({items:[],total:0});return new Promise((resolve,reject)=>{window.releasePage=()=>resolve({items:window.fixturePosts.slice(19),total:25});window.rejectPage=()=>reject(new Error('测试分页失败'))})};
createApp(Community).use(TDesign).mount('#app');
`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',outfile:join(output,'preview.js'),loader:{'.ttf':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},plugins:[{name:'sfc',setup(b){
b.onResolve({filter:/.*/},a=>Object.hasOwn(mock,a.path)?{path:a.path,namespace:'mock'}:a.path.startsWith('@renderer/')?{path:resolve('src/renderer/src',a.path.slice(10))}:undefined)
b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mock[a.path]}))
b.onLoad({filter:/\.vue$/},async a=>{const {descriptor,errors}=parse(await readFile(a.path,'utf8'),{filename:a.path});if(errors.length)throw errors[0];const id='data-v-'+Buffer.from(a.path).toString('hex').slice(-18);for(const s of descriptor.styles){const compiled=await compileStyleAsync({source:s.content,filename:a.path,id,scoped:s.scoped,preprocessLang:s.lang,preprocessCustomRequire:id=>require(id==='sass'?'sass-embedded':id)});if(compiled.errors.length)throw compiled.errors[0];styles.push(compiled.code)}const script=compileScript(descriptor,{id,inlineTemplate:true,genDefaultAs:'component'});return {contents:script.content+`\ncomponent.__scopeId=${JSON.stringify(id)}; export default component`,loader:'ts',resolveDir:dirname(a.path)}})
}}]})

const css=styles.join('\n').replace(/url\((['"]?)(\.\.\/\.\.\/assets\/[^)'" ]+)\1\)/g,(_,quote,p)=>`url("${pathToFileURL(resolve(root,p)).href}")`)
await writeFile(join(output,'preview.css'),await readFile('node_modules/tdesign-vue-next/dist/tdesign.css','utf8')+'\n'+css)
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="preview.css"><style>:root{--td-brand-color:#fa6487;--td-brand-color-light:#fff0f4}html,body,#app{height:100%;overflow:hidden}body{margin:0;background:var(--td-bg-color-container);font-family:Arial,'Microsoft YaHei',sans-serif}</style><div id="app"></div><script src="preview.js"></script>`)


const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage({viewport:{width:860,height:670}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(pathToFileURL(join(output,'index.html')).href)
 await page.getByRole('heading',{name:'让喜欢的音乐，有个回响'}).waitFor()
 await page.waitForTimeout(450)
 await page.screenshot({path:join(output,'empty-light.png')})
 await page.getByRole('button',{name:'写下第一篇笔记'}).click()
 await page.getByRole('textbox',{name:'笔记正文'}).waitFor()
 console.log('PASS: actual empty state renders; call to action opens existing note composer')
 await page.reload();await page.locator('.community-empty').waitFor()
 await page.evaluate(()=>document.documentElement.setAttribute('theme-mode','dark'))
 await page.waitForTimeout(450);await page.screenshot({path:join(output,'empty-dark.png')})
 await page.setViewportSize({width:520,height:670});await page.waitForTimeout(150)
 const sizes=await page.locator('.community-empty').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}))
 assert.ok(sizes.scroll<=sizes.width);assert.equal(await page.getByRole('button',{name:'写下第一篇笔记'}).isVisible(),true)
 assert.deepEqual(errors,[]);console.log('PASS: light/dark themes and narrow empty-state layout; no runtime errors')
} finally {await browser.close()}
