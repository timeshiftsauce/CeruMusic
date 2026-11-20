import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import QRCode from 'qrcode'

export async function verifyCustomAccountQr(page,directory) {
  const manifest={manifestVersion:3,id:'qa.custom-qr',name:'自定义扫码验收',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'},views:[{id:'login',kind:'component',module:'view.login',presentation:{kind:'drawer',size:420}},{id:'html',kind:'web',module:'view.html',presentation:{kind:'drawer',size:420}},{id:'probe',kind:'native',module:'probe'}]},provides:{accounts:[{id:'demo',title:'自定义扫码验收',loginMethods:['qrcode']}],actions:['probe'].map(id=>({id,title:id}))}}
  const image=await QRCode.toDataURL('https://login.example.invalid/demo')
  const factory=`function(deps){return bridge=>{
    const {vue,sdk,tdesign}=deps;
    const injected=document.createElement('style');injected.textContent='#ceru-css-isolation-probe{font-size:87px!important}.t-dialog{padding:83px!important}';document.head.append(injected);bridge.onDispose(()=>injected.remove());
    const Component=vue.defineComponent({setup(){const view=sdk.useView();
      vue.watchEffect(()=>{bridge.root.host.dataset.login=JSON.stringify(view.state.value.login||null)});
      bridge.root.host.dataset.initial=JSON.stringify(bridge.props);
      return ()=>vue.h('section',{class:'custom-login',style:'display:grid;justify-items:center;gap:16px;padding:8px;color:var(--td-text-color-primary)'},[
        vue.h('strong',{style:'font-size:20px;color:var(--td-brand-color)'},'插件自定义内容'),
        vue.h('p','使用平台手机客户端扫码'),
        vue.h('img',{src:view.state.value.login?.image,width:208,height:208,alt:'自定义二维码',style:'display:block;padding:16px;background:white;border-radius:16px'}),
        vue.h('p',{role:'status'},view.state.value.login?.status==='scanned'?'已扫码':'等待扫码'),
        vue.h(tdesign.Button,{onClick:()=>view.close(),block:true,variant:'outline'},()=> '取消登录')
      ])
    }});return sdk.mountComponent(Component,bridge)
  }}`
  const html=`function(ctx){
    ctx.root.innerHTML='<style>.custom-login{font:14px/1.6 system-ui;display:grid;justify-items:center;gap:16px;padding:8px;color:var(--td-text-color-primary)}strong{font-size:20px;color:var(--td-brand-color)}p{margin:0}img{width:208px;height:208px;padding:16px;background:white;border-radius:16px}button{width:100%;padding:10px;border:1px solid var(--td-component-border);border-radius:6px;color:inherit;background:var(--td-bg-color-container)}</style><section class="custom-login"><strong>插件自定义 HTML</strong><p>使用平台手机客户端扫码</p><img alt="自定义二维码"><p role="status"></p><button>取消登录</button></section>';
    ctx.root.querySelector('button').onclick=()=>ctx.close();
    return ctx.subscribe(state=>{const login=state.login||{};ctx.root.dataset.login=JSON.stringify(login);if(login.image)ctx.root.querySelector('img').src=login.image;ctx.root.querySelector('[role=status]').textContent=login.status==='scanned'?'已扫码':'等待扫码'})
  }`
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.modules={"view.login":'+factory+',"view.html":'+html+'};exports.activate=ctx=>{let view="login",status="waiting",polls=0,generation=0,renew=false;ctx.actions.register("probe",input=>{if(input.view!==undefined)view=input.view;if(input.status)status=input.status;if(input.renew!==undefined)renew=input.renew;return {type:"page",sections:[],description:JSON.stringify({polls,generation})}});ctx.accounts.register("demo",{login:({auth})=>{generation++;return auth.qrcode({image:'+JSON.stringify(image)+',...(view?{view}:{}),expiresInMs:60000,poll:async()=>{polls++;if(renew){renew=false;return {status:"expired"}}return status==="done"?{status,credential:"synthetic-secret"}:{status}}})},profile:()=>({id:"demo",displayName:"自定义扫码演示账号"})})}'
  const added=await page.evaluate(code=>window.ceruQa.plugins.addPlugin(code,'custom-qr.js'),code)
  assert.ok(added.pluginId,added.error)
  const owner=added.pluginId
  let probe,protocol
  const dialog=page.locator('.t-dialog:visible').filter({has:page.locator('.qr-custom-content')})
  const state=()=>page.evaluate(id=>window.ceruQa.plugins.accountConnections(id,'demo'),owner)
  const inspect=async input=>JSON.parse((await page.evaluate(({owner,session,input})=>window.ceruQa.plugins.surfaceAction(owner,'probe',session,'probe',input),{owner,session:probe.sessionId,input})).description)
  const open=async()=>{await page.mouse.move(0,0);await page.locator('.user-capsule').hover();await page.locator('[data-plugin-account="plugin-account:'+owner+':demo"]').click();await dialog.waitFor()}
  const wait=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await delay(60)}throw Error('Custom login condition timed out')}
  const stopped=async()=>{await dialog.waitFor({state:'hidden'});await delay(150);const before=await inspect({});await delay(1150);assert.equal((await inspect({})).polls,before.polls);assert.equal((await state()).rows.length,0)}
  const output=join(import.meta.dirname,'../dist/plugin-upgrade-local-2.5.0/qa');await mkdir(output,{recursive:true})
  const previousTheme=await page.evaluate(()=>document.documentElement.dataset.theme)
  try {
    await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),owner)
    probe=await page.evaluate(id=>window.ceruQa.plugins.mountSurface(id,'probe'),owner)
    await page.evaluate(()=>{const probe=document.createElement('button');probe.id='ceru-css-isolation-probe';probe.textContent='CSS probe';probe.style.position='fixed';probe.style.left='-1000px';document.body.append(probe)})
    const outerCss=()=>page.evaluate(()=>{const css=getComputedStyle(document.querySelector('#ceru-css-isolation-probe'));return {fontSize:css.fontSize,letterSpacing:css.letterSpacing}})
    const beforeCss=await outerCss()
    protocol=await page.context().newCDPSession(page);await protocol.send('DOM.enable')
    for(const mode of ['component','html','strict']){
      await page.evaluate(value=>window.ceruQa.plugins.strictMode(value),mode==='strict')
      await inspect({view:mode==='html'?'html':'login',status:'waiting'})
      await open()
      assert.equal(await dialog.locator('.qr-login').count(),0,'Custom content must replace the default template')
      assert.deepEqual(await outerCss(),beforeCss,'Plugin CSS escaped into the host document')
      const iframe=dialog.locator('iframe');await iframe.waitFor();assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts')
      const guest=await (await iframe.elementHandle()).contentFrame()
      const root=guest.locator('#plugin-root[data-login]');await root.waitFor()
      const login=JSON.parse(await root.getAttribute('data-login'));assert.equal(login.status,'waiting');assert.equal(login.accountId,'demo');assert.ok(login.expiresAt>Date.now())
      assert.equal(JSON.stringify(login).includes('credential'),false)
      if(mode!=='html')assert.equal((await root.getAttribute('data-initial')).includes('ticket'),false)
      assert.deepEqual(await outerCss(),beforeCss,'Plugin dependency CSS escaped after mounting')
      for(const theme of ['dark','light']){
        await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme)
        if(guest)await guest.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme)
        else await wait(async()=>await root.getAttribute('theme-mode')===theme)
        const expected=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--td-text-color-primary').trim())
        if(guest)await guest.waitForFunction(expected=>getComputedStyle(document.documentElement).getPropertyValue('--td-text-color-primary').trim()===expected,expected)
        await page.evaluate(()=>document.documentElement.style.setProperty('--td-brand-color','rgb(123, 45, 67)'))
        if(guest)await guest.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--td-brand-color').trim()==='rgb(123, 45, 67)')
      }
      await inspect({status:'scanned'})
      await wait(async()=>JSON.parse(await root.getAttribute('data-login')).status==='scanned')
      await guest.waitForFunction(()=>document.documentElement.scrollHeight<=innerHeight+2)
      const geometry=await dialog.evaluate(node=>{const box=node.getBoundingClientRect(),content=node.querySelector('.qr-custom-content');return {height:box.height,viewport:innerHeight,scroll:content.scrollHeight,content:content.clientHeight}})
      assert.ok(geometry.height<=geometry.viewport-30,JSON.stringify(geometry))
      assert.ok(geometry.scroll<=geometry.content+2,JSON.stringify(geometry))
      await dialog.screenshot({path:join(output,'custom-qr-'+mode+'.png')})
      if(mode==='html')await guest.getByRole('button',{name:'取消登录',exact:true}).click()
      else if(mode==='component'){
        const guestProtocol=await page.context().newCDPSession(guest)
        try{
          const tree=(await guestProtocol.send('DOM.getDocument',{depth:-1,pierce:true})).root
          const text=node=>(node.nodeValue||'')+(node.children||[]).map(text).join('')
          const find=node=>{if(node.nodeName==='BUTTON' && text(node).trim()==='取消登录')return node.backendNodeId;for(const child of [...node.children||[],...node.shadowRoots||[]]){const id=find(child);if(id)return id}}
          const id=find(tree);assert.ok(id,'Shared cancel button missing');await guestProtocol.send('DOM.focus',{backendNodeId:id});await page.keyboard.press('Enter')
        }finally{await guestProtocol.detach().catch(()=>{})}
      }
      else await dialog.locator('.t-dialog__close').click()
      await stopped()
      await page.evaluate(()=>document.documentElement.style.removeProperty('--td-brand-color'))
    }
    await page.evaluate(()=>window.ceruQa.plugins.strictMode(false))
    await inspect({view:'html',status:'waiting'})
    await open()
    const escapeIframe = dialog.locator('iframe')
    await escapeIframe.waitFor()
    const escapeGuest = await (await escapeIframe.elementHandle()).contentFrame()
    await escapeGuest.locator('#plugin-root[data-login]').waitFor()
    await escapeGuest.getByText('插件自定义 HTML', {exact:true}).click()
    assert.equal(await escapeGuest.evaluate(() => document.hasFocus()), true, 'Escape must originate inside the initialized iframe')
    await page.keyboard.press('Escape')
    await stopped()
    await open();const first=(await inspect({})).generation;await inspect({renew:true})
    await wait(async()=>(await inspect({})).generation===first+1)
    await dialog.locator('iframe').waitFor()
    await inspect({status:'scanned'});await delay(1100)
    await inspect({status:'done'})
    await dialog.waitFor({state:'hidden'});await wait(async()=>(await state()).rows.length===1)
    const final=await state();assert.equal(final.rows[0].summary.displayName,'自定义扫码演示账号')
    const result={hostDialog:true,defaultContentReplaced:true,hostSharedComponentsInIframe:true,cssIsolation:true,isolatedHtml:true,strictComponent:true,themeModes:true,accentSync:true,publicStateOnly:true,pluginCancelStopsPolls:true,hostCloseStopsPolls:true,escapeStopsPolls:true,expiryRenews:true,successSavedOnce:true}
    await writeFile(join(output,'custom-qr-results.json'),JSON.stringify(result,null,2)+'\n')
    console.log('Custom QR: '+JSON.stringify(result))
  }finally{
    await protocol?.detach().catch(()=>{})
    if(!page.isClosed()){
      await page.evaluate(theme=>{document.querySelector('#ceru-css-isolation-probe')?.remove();document.documentElement.dataset.theme=theme;document.documentElement.style.removeProperty('--td-brand-color')},previousTheme).catch(()=>{})
      await page.evaluate(()=>window.ceruQa.plugins.strictMode(false)).catch(error=>console.warn('Cleanup policy:',error.message))
      if(probe)await page.evaluate(({owner,session})=>window.ceruQa.plugins.closeDrawer(owner,'probe',session),{owner,session:probe.sessionId}).catch(()=>{})
      await page.evaluate(id=>window.ceruQa.plugins.uninstallPlugin(id),owner).catch(error=>console.warn('Cleanup plugin:',error.message))
    }
  }
}
