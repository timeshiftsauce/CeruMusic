import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import QRCode from 'qrcode'

export async function verifyAccountQr(page) {
  let origin, serial=0, polls=0
  const states=new Map()
  const server=createServer(async (req,res)=>{
    const url=new URL(req.url,origin)
    if (url.pathname==='/new') {
      const id=String(++serial);states.set(id,'waiting')
      const image=await QRCode.toDataURL(origin+'/confirm/'+id)
      const presentation=id==='3' ? {url:'https://login.example.invalid/confirm/'+id} : {image}
      res.setHeader('content-type','application/json');res.end(JSON.stringify({id,...presentation}));return
    }
    if (url.pathname.startsWith('/poll/')) {
      polls++;const id=url.pathname.split('/').at(-1),status=states.get(id)
      res.end(JSON.stringify(status==='done'?{status,credential:'local-qr-'+id}:{status}));return
    }
    res.writeHead(404).end()
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); origin='http://127.0.0.1:'+server.address().port
  let pluginId
  try {
    const manifest={manifestVersion:3,id:'qa.account-qr',name:'QR 测试服务',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'music',title:'扫码账号验收',loginMethods:['form','qrcode']}]},uses:{permissions:[{key:'net',name:'network.request',reason:'访问临时扫码服务'},{key:'local',name:'network.private',reason:'访问回环测试服务'}]}}
    const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const read=async(path,operation)=>(await ctx.http.request({url:'+JSON.stringify(origin)+'+path,permissionKey:"net",operation})).body;ctx.accounts.register("music",{login:async({method,auth},operation)=>{if(method!=="qrcode")throw Error("wrong method");const code=await read("/new",operation);return auth.qrcode({image:code.image,url:code.url,expiresInMs:30000,poll:op=>read("/poll/"+code.id,op)})},profile:()=>({id:"local-profile",displayName:"扫码测试账号"})})}'
    const installed=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'qr.js'),code);pluginId=installed.pluginId;assert.ok(pluginId,installed.error)
    await page.evaluate(async id=>{await window.ceruQa.plugins.setEnabled(id,true);await window.ceruQa.plugins.savePermissions(id,['net','local'])},pluginId)
    const open=async()=>{await page.locator('.user-capsule').hover();await page.locator('[data-plugin-account="plugin-account:'+pluginId+':music"]').hover();await page.getByText('扫码登录',{exact:true}).click()}
    const dialog=page.locator('.t-dialog').filter({has:page.locator('.qr-login')})
    const state=()=>page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'music'),pluginId)
    const loginRequests=[]
    const observe=request=>{if(new URL(request.url()).hostname==='login.example.invalid')loginRequests.push(request.url())}
    page.on('request',observe)
    await open();await dialog.getByText('等待扫码').waitFor();await page.waitForFunction(()=>document.querySelector('img[alt="登录二维码"]')?.naturalWidth>0)
    assert.equal(await dialog.locator('.qr-logo').count(),0,'An unbranded account must not inherit another platform logo')
    await dialog.getByRole('button',{name:'取消'}).click();await dialog.waitFor({state:'hidden'})
    states.set('1','done');const previous=polls;await delay(1250);assert.equal(polls,previous);assert.equal((await state()).rows.length,0)
    await open();await dialog.getByAltText('登录二维码').waitFor();states.set('2','expired')
    await dialog.getByText('https://login.example.invalid',{exact:true}).waitFor()
    await page.waitForFunction(()=>{const canvas=document.querySelector('.qr-login canvas');if(!canvas)return false;const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let index=3;index<pixels.length;index+=4)if(pixels[index]>0 && pixels[index-3]<64)ink++;return ink>pixels.length/40 && ink<pixels.length/5})
    assert.equal(serial,3);states.set('3','scanned');await dialog.getByText('已扫码，请在手机上确认').waitFor();assert.equal((await state()).rows.length,0)
    states.set('3','done');await dialog.waitFor({state:'hidden'});for(let attempt=0;attempt<100 && !(await state()).active;attempt++)await delay(50)
    const final=await state();assert.equal(final.rows.length,1);assert.equal(final.rows[0].summary.displayName,'扫码测试账号')
    page.off('request',observe);assert.deepEqual(loginRequests,[])
    console.log('QR: inline PNG and host-drawn HTTPS QR rendered; no request to the QR origin, cancel stopped polling, expiry renewed, scanned waited, done saved one account')
  } finally {try{if(pluginId) await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),pluginId)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}}
}
