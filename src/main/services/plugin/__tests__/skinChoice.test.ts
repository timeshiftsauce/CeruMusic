import { afterEach, beforeEach, describe, expect, it } from '@jest/globals'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSkinChoice, loadSkinPreferences, saveRegionChoice, saveSkinChoice, saveSkinSetting } from '../skinChoice'
import { effectiveSkinSettings, skinFields } from '@common/pluginSkin'

describe('播放器皮肤偏好', () => {
  let root: string, file: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ceru-skins-'))
    file = join(root, 'plugins', 'skins.json')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('restores only the selected identifiers and can return to default', () => {
    const choice = { pluginId: 'local.studio', skinId: 'studio' }
    expect(loadSkinChoice(file)).toBeNull()
    saveSkinChoice(file, Object.assign({ token: 'must-not-be-stored' }, choice))
    expect(loadSkinChoice(file)).toEqual(choice)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ version: 1, selected: choice })
    saveSkinChoice(file, null)
    expect(loadSkinChoice(file)).toBeNull()
  })
  it('reads existing whole-skin records, retains independent choices and resets overrides on selecting a whole skin', () => {
    const skin = { pluginId:'theme-one', skinId:'studio' }, other = { pluginId:'theme-two',view:'backdrop' }
    saveSkinChoice(file, skin)
    expect(loadSkinPreferences(file)).toEqual({selected:skin, overrides:{}})
    saveRegionChoice(file, {name:'player.lyrics', choice:null})
    saveRegionChoice(file, {name:'player.background', choice:Object.assign({privateValue:true},other)})
    expect(loadSkinPreferences(file)).toEqual({selected:skin, overrides:{'player.lyrics':null, 'player.background':other}})
    saveRegionChoice(file, {name:'player.lyrics',choice:'inherit'})
    expect(loadSkinPreferences(file).overrides).toEqual({'player.background':other})
    expect(() => saveRegionChoice(file, {name:'player.background',choice:{pluginId:'bad/name',view:'x'}})).toThrow()
    expect(loadSkinPreferences(file).overrides).toEqual({'player.background':other})
    saveSkinChoice(file,null)
    expect(loadSkinPreferences(file)).toEqual({selected:null,overrides:{}})
  })
  it('leaves the previous choice intact for invalid writes and reads damaged files as defaults', () => {
    const choice = { pluginId: 'local.studio', skinId: 'studio' }
    saveSkinChoice(file, choice)
    expect(() => saveSkinChoice(file, { pluginId: '../other', skinId: 'studio' })).toThrow()
    expect(loadSkinChoice(file)).toEqual(choice)
    writeFileSync(file, '{')
    expect(loadSkinChoice(file)).toBeNull()
  })
  it('validates settings against the owning schema and retains independent per-skin preferences', () => {
    const owner = {pluginId:'local.studio',skinId:'studio'}, other = {...owner,pluginId:'local.other'}
    const schema = {type:'object',properties:{accent:{type:'string',format:'color',default:'#47867a'},lines:{type:'boolean',default:true},count:{type:'integer',minimum:1,maximum:4},mode:{type:'string',enum:['compact','full']}}}
    const fields = skinFields(schema)
    expect(effectiveSkinSettings(fields)).toEqual({accent:'#47867a',lines:true})
    saveSkinSetting(file,{...owner,key:'accent',value:'#123456'},schema)
    saveSkinSetting(file,{...owner,key:'lines',value:false},schema)
    saveSkinSetting(file,{...other,key:'count',value:4},schema)
    saveSkinChoice(file,other)
    saveRegionChoice(file,{name:'player.artwork',choice:null})
    const saved = loadSkinPreferences(file)
    for (const [key,value] of [['accent','red'],['count',5],['count',1.5],['lines','true'],['mode','other'],['constructor',1]] as const)
      expect(() => saveSkinSetting(file,{...owner,key,value},schema)).toThrow()
    expect(loadSkinPreferences(file)).toEqual(saved)
    expect(effectiveSkinSettings(fields,saved.settings?.find(entry => entry.pluginId === owner.pluginId)?.values)).toEqual({accent:'#123456',lines:false})
    const reset = saveSkinSetting(file,{...owner,key:'accent',value:null},schema)
    expect(effectiveSkinSettings(fields,reset.settings?.find(entry => entry.pluginId === owner.pluginId)?.values)).toEqual({accent:'#47867a',lines:false})
    expect(reset.settings?.find(entry => entry.pluginId === other.pluginId)?.values).toEqual({count:4})
  })
})
