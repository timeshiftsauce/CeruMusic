import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyRouter(page, profile) {
  const manifest={manifestVersion:3,id:'qa.router',name:'Router QA',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'},views:[{id:'panel',kind:'native',module:'render'}]},provides:{actions:[{id:'render',title:'展示'}]},ui:{pages:[{id:'login',title:'登录入口',view:'panel',mount:'sidebar',when:{loggedIn:false}},{id:'member',title:'会员入口',view:'panel',mount:'sidebar',when:{loggedIn:true}}]},uses:{permissions:[{key:'guard',name:'navigation.intercept',reason:'路由验收'}]}}
  const source='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{let serial=0;ctx.actions.register("render",()=>({type:"page",title:"登录验收",sections:[]}));ctx.router.beforeEach(to=>{if(to.name==="plugin-page" && to.params.pageId==="member") return {name:"plugin-page",params:{pluginId:"qa.router",pageId:"login"}};if(to.name==="recognize")return {name:"search",query:{keyword:"路由测试"}};if(to.name==="local")return false;if(to.name==="recent")return {name:"download"}});ctx.router.afterEach((to,from)=>ctx.storage.set("last",[to.name,from?.name]));ctx.lifecycle.onConfigChange(async()=>{const seq=++serial;try{await ctx.router.push({name:"songlist"});const route=await ctx.router.current();await ctx.storage.set("result",{seq,name:route.name})}catch(error){await ctx.storage.set("result",{seq,error:String(error)})}})}'
  const installed=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'router.js'),source)
  const id=installed.pluginId
  assert.ok(id,installed.error)
  const file=join(profile,'plugins','storage',id+'.json')
  const values=()=>readFile(file,'utf8').then(JSON.parse).then(data=>data.values).catch(()=>({}))
  try {
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),id)).error,undefined)
    await page.evaluate(id=>window.ceruQa.plugins.saveConfig(id,{step:1}),id)
    for (let attempt=0;attempt<100 && !(await values()).result;attempt++) await delay(50)
    assert.deepEqual((await values()).result,{seq:1,name:'songlist'})
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['guard']),id)).error,undefined)
    await page.waitForFunction(async()=> (await window.ceruQa.plugins.hookSnapshot()).names.includes('router.navigate'))
    await page.locator('.sidebar button.nav-button').filter({hasText:'本地'}).click()
    await page.waitForFunction(async()=> (await window.ceruQa.plugins.hookControls()).activity.some(row=>row.pluginId==='qa.router' && row.name==='router.navigate' && row.action==='cancel'))
    assert.ok(page.url().endsWith("#/home/songlist"))
    const undo = () => page.locator('.t-message').filter({hasText:'已由 Router QA 处理'}).locator('button:enabled').last().click()
    await undo()
    await page.waitForFunction(()=>location.hash === '#/home/local')
    await page.evaluate(()=>{location.hash='/home/recent?hostOnly=original#anchor'})
    await page.waitForFunction(()=>location.hash === '#/home/download')
    for (let attempt=0;attempt<60 && (await values()).last?.[0]!=='download';attempt++) await delay(50)
    assert.deepEqual((await values()).last,['download','local'])
    await undo()
    await page.waitForFunction(()=>location.hash === '#/home/recent?hostOnly=original#anchor')
    await page.evaluate(id=>{location.hash='/plugin/'+id+'/member?context=full'},id)
    await page.getByRole('heading',{name:'登录验收',exact:true}).waitFor()
    assert.equal(new URL(page.url()).hash,'#/plugin/'+id+'/login')
    await undo()
    await page.locator('.plugin-page [role=status]').filter({hasText:'页面不可用'}).waitFor()
    assert.equal(new URL(page.url()).hash,'#/plugin/'+id+'/member?context=full')
    await page.evaluate(()=>{location.hash='/home/recognize'})
    await page.locator('.keyword').filter({hasText:'路由测试'}).waitFor()
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,[]),id)).error,undefined)
    await page.locator('.sidebar button.nav-button').filter({hasText:'本地'}).click()
    await page.waitForFunction(()=>location.hash === '#/home/local')
    console.log('Router: plugin navigation, cancellation and redirect undo, original query/hash, own-page visibility, search keyword and revocation passed')
  } finally { await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),id) }
}
