import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomBytes,X509Certificate} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {createServer} from 'node:https'
import {join,resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'

export async function verifyBrowserLogin(application,page,directory) {
  const openssl=process.platform==='win32'?resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/openssl.exe'):'openssl'
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout','browser-key.pem','-out','browser-ca.pem'],{cwd:directory,stdio:'ignore',windowsHide:true})
  const cert=await readFile(join(directory,'browser-ca.pem'),'utf8'),key=await readFile(join(directory,'browser-key.pem')),secret=randomBytes(32).toString('hex')
  const incoming=[];let profiles=0,pluginId
  const server=createServer({cert,key},(req,res)=>{
    if(req.url==='/login'){
      incoming.push(!!req.headers.cookie);res.writeHead(200,{'content-type':'text/html; charset=utf-8','set-cookie':'unrelated=fixture; Path=/; Secure; HttpOnly'}).end('<form action="/accept" method="post"><button>确认本地登录</button></form>');return
    }
    if(req.url==='/accept' && req.method==='POST'){res.writeHead(200,{'content-type':'text/html','set-cookie':'session_id='+secret+'; Secure; HttpOnly; Path=/; SameSite=Lax'}).end('OK');return}
    if(req.url==='/profile' && req.headers.cookie==='session_id='+secret){profiles++;res.end(JSON.stringify({name:'网页登录测试账号'}));return}
    res.writeHead(404).end()
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+server.address().port
  try {
    await application.evaluate(({app},{origin,cert,fingerprint})=>{
      const tls=globalThis.runtimeTestRequire('node:tls'),previous=tls.getCACertificates('default'),{X509Certificate}=globalThis.runtimeTestRequire('node:crypto')
      tls.setDefaultCACertificates([...previous,cert])
      const accept=(event,_contents,url,_error,certificate,reply)=>{if(new URL(url).origin===origin && new X509Certificate(certificate.data).fingerprint256===fingerprint){event.preventDefault();reply(true)}else reply(false)}
      app.on('certificate-error',accept);globalThis.restoreBrowserTest=()=>{app.off('certificate-error',accept);tls.setDefaultCACertificates(previous)}
    },{origin,cert,fingerprint:new X509Certificate(cert).fingerprint256})
    const manifest={manifestVersion:3,id:'qa.browser',name:'网页登录验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'music',title:'网页登录验收',loginMethods:['browser']}]},uses:{permissions:[{key:'net',name:'network.request',reason:'读取账号资料'},{key:'local',name:'network.private',reason:'仅访问临时测试服务'},{key:'capture',name:'credentials.capture',reason:'保存登录 Cookie',scope:{domains:['127.0.0.1']}},{key:'cred',name:'credentials.use',reason:'查询账号资料',scope:{origins:[origin]}}]}}
    const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const origin='+JSON.stringify(origin)+';ctx.accounts.register("music",{login:async({auth})=>{const result=await auth.browser({url:origin+"/login",until:{cookie:"session_id"}});if(result && Object.keys(result).join()!=="completionId")throw Error("unexpected credential");return result},profile:async(account,operation)=>{const reply=await ctx.http.request({url:origin+"/profile",permissionKey:"net",credential:account.credential,operation});return {id:"web",displayName:reply.body.name}}})}'
    const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'browser-test.js'),code);pluginId=added.pluginId;assert.ok(pluginId,added.error)
    await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['net','local','capture','cred'])},pluginId)
    const open=async()=>{
      await page.locator('.user-capsule').hover();await page.locator('[data-plugin-account="plugin-account:'+pluginId+':music"]').click()
      const pending=application.waitForEvent('window')
      await page.locator('.t-dialog').filter({hasText:'的独立登录窗口'}).getByRole('button',{name:'确定'}).click()
      const login=await pending;await login.getByRole('button',{name:'确认本地登录'}).waitFor()
      assert.ok(await login.evaluate(()=>typeof window.ceruQa==='undefined' && typeof window.require==='undefined' && typeof window.process==='undefined'))
      return login
    }
    const rows=async()=>(await page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'music'),pluginId)).rows
    const first=await open();await first.close();assert.equal((await rows()).length,0)
    const second=await open();await second.getByRole('button',{name:'确认本地登录'}).click({noWaitAfter:true})
    for(let attempt=0;attempt<120 && !(await rows()).length;attempt++)await delay(50)
    assert.deepEqual(incoming,[false,false]);assert.equal(profiles,1);assert.equal((await rows())[0]?.summary.displayName,'网页登录测试账号')
    console.log('Browser login: separate clean sessions, cancel without save, no preload, isolated secure cookie and host profile verified')
  } finally {
    try{if(pluginId)await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),pluginId)}finally{await application.evaluate(()=>globalThis.restoreBrowserTest?.());server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
  }
}
