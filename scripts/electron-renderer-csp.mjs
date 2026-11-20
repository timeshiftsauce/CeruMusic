import assert from 'node:assert/strict'

export async function verifyRendererCsp(page, probeUrl) {
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  const scripts = policy.split(';').map(part => part.trim()).find(part => part.startsWith('script-src ')).split(/\s+/)
  assert.ok(scripts.includes('blob:'))
  assert.ok(scripts.includes('data:'), 'Frozen plugin iframe scripts must remain allowed')
  assert.ok(!scripts.includes("'unsafe-inline'"))
  const result = await page.evaluate(async probeUrl => {
    const violations = [], nodes = []
    const record = event => violations.push({ directive:event.effectiveDirective, blocked:event.blockedURI })
    document.addEventListener('securitypolicyviolation', record)
    const append = element => { nodes.push(element); document.head.append(element); return element }
    const load = (src, type) => new Promise((resolve, reject) => {
      const script = document.createElement('script')
      if (type) script.type = type
      script.onload = resolve
      script.onerror = () => reject(Error('Allowed script was blocked: ' + src.slice(0, 60)))
      script.src = src
      append(script)
    })
    const blob = URL.createObjectURL(new Blob(['globalThis.ceruCspBlob = true; export {}'], {type:'text/javascript'}))
    const originalBase = document.baseURI
    try {
      await load('https://tdesign.gtimg.com/icon/0.3.2/fonts/index.js')
      await load(blob, 'module')
      await load('data:text/javascript,globalThis.ceruCspData%3Dtrue')
      const inline = document.createElement('script')
      inline.textContent = 'globalThis.ceruCspInline = true'
      append(inline)
      const remote = document.createElement('script')
      remote.src = probeUrl
      append(remote)
      const object = document.createElement('object')
      object.type = 'text/html'
      object.data = 'data:text/html,<p>Blocked object</p>'
      object.style.cssText = 'width:1px;height:1px;position:fixed;left:0;top:0'
      nodes.push(object)
      document.body.append(object)
      const base = document.createElement('base')
      base.href = probeUrl
      append(base)
      const deadline = performance.now() + 3000
      while (violations.length < 4 && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
      return {
        blob: globalThis.ceruCspBlob === true,
        officialIconSprite: !!document.querySelector('#t-icon-setting path'),
        data: globalThis.ceruCspData === true,
        inline: globalThis.ceruCspInline === true,
        remote: globalThis.ceruCspRemote === true,
        baseUnchanged: document.baseURI === originalBase,
        violations
      }
    } finally {
      document.removeEventListener('securitypolicyviolation', record)
      URL.revokeObjectURL(blob)
      nodes.forEach(node => node.remove())
      for (const key of ['ceruCspBlob','ceruCspData','ceruCspInline','ceruCspRemote']) delete globalThis[key]
    }
  }, probeUrl)
  assert.equal(result.blob, true)
  assert.equal(result.officialIconSprite, true, 'Approved TDesign icons must actually render')
  assert.equal(result.data, true)
  assert.equal(result.inline, false)
  assert.equal(result.remote, false)
  assert.equal(result.baseUnchanged, true)
  assert.ok(result.violations.some(item => item.directive === 'script-src-elem' && item.blocked === 'inline'))
  assert.ok(result.violations.some(item => item.directive === 'script-src-elem' && item.blocked === probeUrl))
  assert.ok(result.violations.some(item => item.directive === 'object-src'), JSON.stringify(result))
  assert.ok(result.violations.some(item => item.directive === 'base-uri'))
  console.log(JSON.stringify({ rendererCsp:true, officialIconSprite:true, blobModule:true, legacyDataScript:true, inlineBlocked:true, unapprovedExternalScriptBlocked:true, objectBlocked:true, baseUnchanged:true }))
}
