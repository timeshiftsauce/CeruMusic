import { expect, test } from '@jest/globals'
import type { Artifact } from '@shiqianjiang/ceru-plugin-issuer'
import { changedRegionViews } from './regionPreview'

function fixture(): Artifact {
  return {
    header: {formatVersion:2, syntax:'js', signature:null, manifest: {
      manifestVersion:3, id:'local.preview-test', name:'Preview', version:'1.0.0',
      engines:{hostApi:'^3.0.0', logicRuntime:'ceru-js@1'},
      entry:{logic:{module:'logic'}, views:[{id:'lines',kind:'component',module:'view.lines'},
        {id:'stage',kind:'component',module:'view.lines'}, {id:'page',kind:'component',module:'view.page'}]},
      ui:{regions:[{region:'player.lyrics',view:'lines'}, {region:'player.stage',view:'stage'}]}
    }},
    modules:{'view.lines':'lines', 'view.page':'page', logic:'logic'}, resources:{}, body:'',
    codeDigest:'', sourceFormat:'exports-v2', signatureStatus:'unsigned', migrationWarnings:[]
  }
}

test('a changed module refreshes every region that renders it, and nothing else', () => {
  const previous = fixture(), next = fixture()
  expect(changedRegionViews(previous,next)).toEqual([])
  next.modules['view.lines'] = 'new lines'
  expect(changedRegionViews(previous,next)).toEqual(['lines','stage'])
  expect(previous.modules['view.lines']).toBe('lines')
})

test.each<[string, (next:Artifact) => void]>([
  ['manifest', next => {next.header.manifest.name = 'Renamed'}],
  ['shared resource', next => {next.resources.cover = {type:'text',mime:'text/plain',value:'new'}}],
  ['logic', next => {next.modules.logic = 'new logic'}],
  ['unrelated page', next => {next.modules['view.page'] = 'new page'}],
  ['additional module', next => {next.modules.other = 'other'}],
  ['removed module', next => {delete next.modules['view.lines']}],
  ['signature', next => {next.signatureStatus = 'verified-trusted'}]
])('%s changes require a full reload', (_label, modify) => {
  const previous = fixture(), next = fixture()
  modify(next)
  expect(changedRegionViews(previous,next)).toBeNull()
})

test('a region module also used by logic cannot be refreshed independently', () => {
  const previous = fixture()
  previous.header.manifest.entry.logic = {module:'view.lines'}
  const next = structuredClone(previous)
  next.modules['view.lines'] = 'changed'
  expect(changedRegionViews(previous,next)).toBeNull()
})
