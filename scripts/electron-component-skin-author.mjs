import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addPreviewFile, startProjectWatch, useAuthorSdk } from './electron-dev-preview.mjs'

export async function verifyComponentSkinAuthor(application, page, directory, toolchain) {
  const bin = resolve(toolchain, 'packages/cli/dist/bin.js'), results = []
  await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
  await writeFile(join(directory, 'profile', 'transport.lrc'), '[00:00.00]第一行\n[00:10.00]第二行\n')
  await application.evaluate(({app, BrowserWindow}) => {
    const {MusicDatabase} = globalThis.runtimeTestRequire('./databases.cjs')
    new MusicDatabase().upsertTrack({songmid:'skin-author',path:globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'),url:null,singer:'QA',name:'皮肤作者验收',albumName:'QA',albumId:0,source:'local',interval:'00:30',hasCover:0,coverKey:null,year:2026,lrc:'[00:00.00]第一行\n[00:10.00]第二行',types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:30,size:2646044,mtime_ms:1,hash:null,updated_at:Date.now()})
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setAudioMuted(true)
  })
  try {
    for (const language of ['js', 'ts']) {
      const project = join(directory, 'skin-author-' + language)
      await promisify(execFile)(process.execPath, [bin, 'init', project, '--template', 'player-skin', '--lang', language], {windowsHide:true})
      await useAuthorSdk(project, toolchain)
      const config=JSON.parse(await readFile(join(project,'ceru.plugin.json'),'utf8'))
      const watcher = await startProjectWatch(bin, project)
      try {
        await addPreviewFile(application, page, watcher.file)
        await page.reload({waitUntil:'domcontentloaded'})
        await page.getByRole('button', {name:'播放全部'}).click()
        await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(a => a.currentSrc.includes('transport.wav') && !a.paused))
        await page.locator('.player-container').dispatchEvent('click')
        await page.getByRole('button', {name:'播放器个性化', exact:true}).press('Enter')
        await page.getByRole('button', {name:'留声', exact:true}).click()
        await page.getByRole('button', {name:'关闭个性化面板'}).press('Escape')
        const region = name => page.locator('.plugin-' + name + ' .component-root')
        await region('lyrics').getByRole('button', {name:'第一行',exact:true}).waitFor()
        assert.equal(await page.locator('.full-play.active iframe').count(), 0)
        const layout=await region('lyrics').evaluate(root=>({available:root.clientHeight,content:root.shadowRoot.querySelector('.lyrics-region').getBoundingClientRect().height}))
        assert.ok(layout.available>0 && layout.content<=layout.available+1,'Scaffold lyrics overflow their host region: '+JSON.stringify(layout))
        const media = await page.evaluateHandle(() => [...document.querySelectorAll('audio')].find(a => a.currentSrc.includes('transport.wav')))
        const read = () => media.evaluate(a => ({src:a.currentSrc,time:a.currentTime,paused:a.paused,at:performance.now()}))
        const ids = () => page.locator('.full-play.active .plugin-component-surface').evaluateAll(nodes => Object.fromEntries(nodes.map(n => [[...n.classList].find(c => ['plugin-lyrics','plugin-artwork','plugin-background'].includes(c)), n.dataset.componentInstance])))
        try {
          await media.evaluate(a => { a.currentTime = 1; a.pause() })
          const samples = []
          for (const name of ['lyrics','artwork','background']) {
            if (name !== 'lyrics') await media.evaluate(a => a.play())
            const file = join(project,config.entries['view.'+name]), original = await readFile(file,'utf8')
            const marker = language + '-' + name + '-updated'
            const replacement = original.replace('</template>', '<span style="position:absolute;left:8px;top:8px">' + marker + '</span></template>')
            assert.notEqual(replacement, original)
            const beforeIds = await ids(), before = await read(), start = performance.now()
            await writeFile(file,replacement)
            try { await region(name).getByText(marker, {exact:true}).waitFor({timeout:5000}) }
            catch(error) {
              console.error('Skin author reload:',{name,language,state:await page.evaluate(()=>window.ceruQa.plugins.devState()),roots:await page.locator('.component-root').evaluateAll(roots=>roots.map(root=>({text:root.shadowRoot?.textContent?.slice(-1500),html:root.outerHTML})))})
              throw error
            }
            const elapsed = Math.round(performance.now() - start), after = await read(), afterIds = await ids()
            assert.ok(elapsed <= 1000, `${language} ${name} reload took ${elapsed}ms`)
            for (const key of Object.keys(beforeIds)) {
              if (key === 'plugin-' + name) assert.notEqual(beforeIds[key],afterIds[key])
              else assert.equal(beforeIds[key],afterIds[key], 'Unedited region remounted: ' + key)
            }
            assert.equal(after.src,before.src); assert.equal(after.paused,before.paused)
            assert.ok(before.paused ? after.time === before.time : after.time > before.time && Math.abs(after.time-before.time-(after.at-before.at)/1000)<.25)
            samples.push({region:name,hotReloadMs:elapsed,playing:!after.paused})
          }
          results.push({language,samples})
        } finally { await media.dispose() }
      } finally { await page.evaluate(file => window.ceruQa.plugins.removeDevFile(file), watcher.file); await watcher.stop() }
      await page.waitForFunction(() => !document.querySelector('.full-play.active .plugin-component-surface'))
    }
    console.log(JSON.stringify({componentSkinAuthor:true,realCli:true,regionSizing:true,retainedSiblingRegions:true,uninterruptedAudio:true,removedPreviewCleanup:true,results}))
  } finally { await page.evaluate(() => window.ceruQa.plugins.setDevMode(false)) }
}
