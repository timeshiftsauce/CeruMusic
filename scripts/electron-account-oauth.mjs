import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export async function verifyAccountOAuth(application,page,directory) {
  const openssl=process.platform==='win32' ? resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/openssl.exe') : 'openssl'
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout','oauth-key.pem','-out','oauth-ca.pem'],{cwd:directory,stdio:'ignore',windowsHide:true})
  const cert=await readFile(join(directory,'oauth-ca.pem'),'utf8'),key=await readFile(join(directory,'oauth-key.pem'))
  const secret=randomBytes(32).toString('hex')
  let exchanges=0,profiles=0,auth,pluginId
  const server=createServer({cert,key},async(req,res)=>{
    if (req.url==='/token' && req.method==='POST') {
      exchanges++
      let body=''; for await(const chunk of req) body+=chunk
      const packet=new URLSearchParams(body)
      const valid=packet.get('code')==='accepted' && packet.get('redirect_uri')===auth.searchParams.get('redirect_uri') && createHash('sha256').update(packet.get('code_verifier') || '').digest('base64url')===auth.searchParams.get('code_challenge')
      res.writeHead(valid?200:401).end(JSON.stringify(valid?{token_type:'Bearer',access_token:secret}:{}));return
    }
    if (req.url==='/profile' && req.headers.authorization==='Bearer '+secret) {profiles++;res.end(JSON.stringify({displayName:'OAuth 测试账号'}));return}
    res.writeHead(404).end()
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const origin='https://127.0.0.1:'+server.address().port
  try {
    await application.evaluate(({shell},{origin,cert})=>{
      const tls=globalThis.runtimeTestRequire('node:tls'),original=tls.getCACertificates('default'),open=shell.openExternal
      tls.setDefaultCACertificates([...original,cert]);globalThis.qaLoginUrl=null
      shell.openExternal=async url=>{if(new URL(url).origin!==origin)throw Error('unexpected URL');globalThis.qaLoginUrl=url}
      globalThis.restoreOAuthTest=()=>{shell.openExternal=open;tls.setDefaultCACertificates(original);delete globalThis.qaLoginUrl}
    },{origin,cert})
    const manifest={manifestVersion:3,id:'qa.oauth',name:'OAuth 验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'music',title:'OAuth 测试',loginMethods:['oauth']}]},uses:{permissions:[{key:'net',name:'network.request',reason:'获取账号资料'},{key:'local',name:'network.private',reason:'临时 TLS 服务'},{key:'cred',name:'credentials.use',reason:'读取账号资料',scope:{origins:[origin]}}]}}
    const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const origin='+JSON.stringify(origin)+';ctx.accounts.register("music",{login:async({auth})=>{const result=await auth.oauth({authorizationUrl:origin+"/authorize",tokenUrl:origin+"/token",clientId:"qa"});if(result && (Object.keys(result).join()!=="completionId" || !result.completionId))throw Error("unexpected worker result");return result},profile:async(account,operation)=>{if(account.credential.kind!=="credential")throw Error("missing reference");const result=await ctx.http.request({url:origin+"/profile",permissionKey:"net",credential:account.credential,operation});return {id:"demo",displayName:result.body.displayName}}})}'
    const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'oauth-test.js'),code);pluginId=added.pluginId;assert.ok(pluginId,added.error)
    await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['net','local','cred'])},pluginId)
    const show=async()=>{
      await page.locator('.user-capsule').hover(); await page.locator('[data-plugin-account="plugin-account:'+pluginId+':music"]').click()
      await page.locator('.t-dialog').filter({hasText:'在系统浏览器中授权此平台：'+origin}).getByRole('button',{name:'确定'}).click()
      await page.getByText('等待浏览器完成授权',{exact:true}).waitFor()
      for(let attempt=0;attempt<100;attempt++){
        const url=await application.evaluate(()=>globalThis.qaLoginUrl);if(url){auth=new URL(url);return}await delay(50)
      }
      throw Error('authorization page was not opened')
    }
    const deliver=async code=>application.evaluate(({app},url)=>{app.emit('second-instance',{},[...process.argv.slice(0,process.defaultApp?2:1),url])},auth.searchParams.get('redirect_uri')+'?'+new URLSearchParams({state:auth.searchParams.get('state'),code}))
    const rows=async()=>(await page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'music'),pluginId)).rows
    await show();await page.getByRole('button',{name:'取消登录'}).click();await page.getByText('等待浏览器完成授权',{exact:true}).waitFor({state:'hidden'})
    await deliver('late');assert.equal(exchanges,0);assert.equal((await rows()).length,0)
    await application.evaluate(()=>{globalThis.qaLoginUrl=null});await show();await deliver('accepted');await deliver('accepted')
    for(let attempt=0;attempt<100 && !(await rows()).length;attempt++)await delay(50)
    if (!(await rows()).length) throw Error('OAuth did not save account: '+JSON.stringify({exchanges,profiles,waiting:await page.getByText('等待浏览器完成授权',{exact:true}).isVisible(),alerts:await page.locator('.t-message__content').allTextContents()}))
    assert.equal((await rows())[0]?.summary.displayName,'OAuth 测试账号');assert.equal(exchanges,1);assert.equal(profiles,1)
    assert.ok(!JSON.stringify(await rows()).includes(secret));console.log('OAuth: cancel and replay handled; PKCE exchanged once; worker saw only a receipt; profile received the host-attached bearer')
  } finally {
    try {if(pluginId)await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),pluginId)} finally {
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await application.evaluate(()=>globalThis.restoreOAuthTest?.())
    }
  }
}
