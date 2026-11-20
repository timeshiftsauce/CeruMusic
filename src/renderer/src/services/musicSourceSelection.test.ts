import type { UserInfo } from '@renderer/types/userInfo'
import { reconcileSelectedSource, withSelectedMusicSource } from './musicSourceSelection'

const info: UserInfo = {
  selectSources: 'local', selectQuality: 'saved', sourcePluginMap: { catalog: 'first' },
  sourceQualityMap: { catalog: 'high', local: 'saved' },
  supportedSources: {
    catalog: { name: 'Catalog', type: 'music', qualitys: ['high','lossless'] },
    local: { name: 'Local', type: 'music', qualitys: [] },
    mix: { name: 'Mix', type: 'music', qualitys: ['lossless'] }
  }
}

test('a source switch commits its own quality without changing provider ownership', () => {
  const next = withSelectedMusicSource(info,'catalog')!
  expect(next.selectQuality).toBe('high')
  expect(next.sourcePluginMap).toBe(info.sourcePluginMap)
  expect(info.selectSources).toBe('local')
  expect(withSelectedMusicSource(next,'catalog')).toBe(next)
  expect(withSelectedMusicSource({...info,sourceQualityMap:{catalog:'old'}},'catalog')?.selectQuality).toBe('lossless')
})

test('aggregate and qualityless sources preserve quality preferences; missing sources do not commit', () => {
  for (const source of ['mix','local']) {
    const next = withSelectedMusicSource(info,source)!
    expect(next.selectQuality).toBe('saved')
    expect(next.sourceQualityMap).toBe(info.sourceQualityMap)
  }
  for (const source of ['missing','constructor']) expect(withSelectedMusicSource(info,source)).toBeNull()
})

test('restoration retains intent; losing a selected provider falls back without selecting its sibling', () => {
  const sibling = { id: 'catalog', pluginId: 'second', runtime: 3 }
  const local = { id: 'local', pluginId: 'host', runtime: 'host' as const }
  expect(reconcileSelectedSource('catalog','first',[sibling,local],false)).toBe('catalog')
  expect(reconcileSelectedSource('catalog','first',[sibling,local],true)).toBe('local')
  expect(reconcileSelectedSource('catalog','first',[sibling],true)).toBe('')
  expect(reconcileSelectedSource('catalog','second',[sibling,local],true)).toBe('catalog')
  expect(reconcileSelectedSource('local',undefined,[sibling,local],true)).toBe('local')
})
