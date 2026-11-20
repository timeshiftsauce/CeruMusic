import {test,expect} from '@jest/globals'
import {accountCollectionPage} from './collections'

const ref={kind:'track',pluginId:'demo',providerId:'catalog',id:'1'}
const item={ref,title:'歌曲',metadata:{artists:['歌手']},capabilities:['play']}
const page=(raw:unknown)=>accountCollectionPage(raw,'likes','demo',['catalog'],'first',1,'prior')
test('account collections bind unscoped private results to their active connection',()=>{
  expect(page({items:[item],nextCursor:'next',unknown:'ignored'})).toEqual({items:[{...item,ref:{...ref,connectionId:'first'}}],nextCursor:'next'})
})
test('account collections reject foreign or incorrectly typed results and non-progressing pages',()=>{
  for(const change of [{pluginId:'other'},{providerId:'other'},{connectionId:'second'},{kind:'playlist'},{scope:'provider'}])expect(()=>page({items:[{...item,ref:{...ref,...change}}]})).toThrow()
  for(const raw of [{items:[item,item]},{items:[],nextCursor:'next'},{items:[item],nextCursor:'prior'}])expect(()=>page(raw)).toThrow()
})
