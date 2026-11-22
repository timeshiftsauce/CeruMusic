import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addPreviewFile, startProjectWatch, useAuthorSdk } from './electron-dev-preview.mjs'

export async function verifyComponentAuthor(application, page, directory, toolchain) {
  const bin = resolve(toolchain, 'packages/cli/dist/bin.js')
  await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
  const results = []
  try {
    for (const language of ['js','ts']) {
      const project = join(directory, 'author-' + language)
      await promisify(execFile)(process.execPath,[bin,'init',project,'--template','page-extension','--lang',language],{windowsHide:true})
      await useAuthorSdk(project,toolchain)
      const watcher = await startProjectWatch(bin,project)
      let entry
      try {
        entry = await addPreviewFile(application,page,watcher.file)
        await page.evaluate(id=>window.ceruQa.plugins.savePermissions(id,['catalog','listen']),entry.id)
        await page.evaluate(id=>{location.hash='/plugin/'+id+'/search'},entry.id)
        const host = page.locator('.plugin-page .component-root')
        await host.getByRole('heading',{name:'音源搜索',exact:true}).waitFor()
        assert.equal(await page.locator('.plugin-page iframe').count(),0)
        assert.equal(await host.evaluate(element=>element.shadowRoot?.mode),'open')
        await host.getByRole('textbox',{name:'歌曲名称'}).fill('没有匹配的验收曲名')
        await host.getByRole('button',{name:'搜索',exact:true}).press('Enter')
        await host.getByText('没有找到歌曲',{exact:true}).waitFor()
        const file=join(project,'src/Search.vue'),before=await readFile(file,'utf8')
        const marker='重新搜索-'+language
        const started=performance.now()
        await writeFile(file,before.replace(/搜索(?=<\/Button\b)/,marker))
        await host.getByRole('button',{name:marker,exact:true}).waitFor({timeout:10000})
        const elapsed=Math.round(performance.now()-started)
        assert.ok(elapsed<=1000,language+' author hot reload took '+elapsed+'ms')
        results.push({language,hotReloadMs:elapsed})
      } finally {
        if(entry)await page.evaluate(file=>window.ceruQa.plugins.removeDevFile(file),watcher.file)
        await watcher.stop()
      }
    }
    console.log(JSON.stringify({componentAuthor:true,realCli:true,hostComponents:true,searchAction:true,results}))
  } finally { await page.evaluate(()=>window.ceruQa.plugins.setDevMode(false)) }
}
