import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
const built = await build({entryPoints:['src/renderer/src/utils/pluginCapabilityLabels.ts'],bundle:true,write:false,platform:'node',format:'esm'})
const {describePluginCapability} = await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
for (const name of ['聆澜音源','洛雪兼容环境']) {
  const {manifest} = JSON.parse(await readFile(`G:/code/pluginclitest/${name}/ceru.plugin.json`,'utf8'))
  for (const command of manifest.contributes.commands) {
    const result=describePluginCapability('action:'+command.action,manifest)
    assert.equal(result.label,command.title)
    assert.equal(result.description,command.description)
    assert.ok(result.description)
    assert.ok(!result.label.startsWith('action:'))
  }
}
const custom={name:'示例插件',contributes:{commands:[{id:'custom-button',action:'external.search',title:'搜索收藏夹',description:'查找收藏夹中的音乐'}]}}
assert.deepEqual(describePluginCapability('action:external.search',custom),{label:'搜索收藏夹',description:'查找收藏夹中的音乐'})
assert.equal(describePluginCapability('tracks.lyrics',custom).label,'歌词')
assert.equal(describePluginCapability('action:unknown.internal',custom).label,'自定义功能')
console.log('PASS: both plugin command catalogs, custom action metadata, standard labels and missing-label fallback')
