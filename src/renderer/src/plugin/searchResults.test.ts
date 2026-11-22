import {rewriteSearchResults} from './searchResults'

test('result hooks see only display metadata while the host keeps private playback references',async()=>{
  const resource={providerId:'local',id:'private-path',kind:'track',connectionId:'private-owner',data:{token:'credential'}}
  const privateRow={source:'local',name:'First',singer:'Artist',pluginResource:resource,img:'file:///hidden'}
  const publicRow={source:'catalog',name:'Second',songmid:'public',singer:'Singer',pluginResource:{kind:'track',scope:'provider',providerId:'catalog',id:'public'}}
  const result=await rewriteSearchResults('test','catalog','track',[privateRow,publicRow],async input=>{
    expect(input.page.items[0].ref.providerId).toBe('private')
    expect(JSON.stringify(input)).not.toMatch(/private-path|private-owner|credential|file:/)
    return [input.page.items[1],input.page.items[0],{ref:{kind:'track',providerId:'other',id:'new'},title:'New',metadata:{artists:['Third']}}]
  })
  expect(result.slice(0,2)).toEqual([publicRow,privateRow])
  expect(result[2]).toMatchObject({name:'New',singer:'Third',source:'other',songmid:'new'})
  expect(result[2].pluginResource).toBeUndefined()
})
