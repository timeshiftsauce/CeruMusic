import {test,expect} from '@jest/globals'
import {browserLoginSite,browserLoginCredential} from './browserPolicy'

const origin='https://music.example.org',domains=['music.example.org'],options={url:origin+'/login',until:{cookie:'session_id'}}
test('isolated sign-in requires matching capture hostname and exact credential origin',()=>{
  expect(browserLoginSite(options,domains,[origin]).url.origin).toBe(origin)
  for (const url of ['http://music.example.org/login','https://cdn.music.example.org/login',origin+':444/login','https://user@music.example.org/login']) expect(()=>browserLoginSite({...options,url},domains,[origin])).toThrow()
  expect(()=>browserLoginSite(options,['*.example.org'],[origin])).toThrow()
  expect(()=>browserLoginSite(options,domains,[])).toThrow()
})
test('only the explicitly named, live, secure host cookie is eligible for origin-wide use',()=>{
  const site=browserLoginSite(options,domains,[origin])
  const cookie:Electron.Cookie={name:'session_id',value:'example-only',path:'/',domain:site.url.hostname,hostOnly:true,httpOnly:true,secure:true,session:true,sameSite:'lax'}
  expect(browserLoginCredential(site,cookie)).toEqual({credential:'session_id=example-only',binding:{origin,sendAs:'cookie'}})
  for (const change of [{name:'tracking'},{domain:'.example.org'},{domain:'other.example.org'},{hostOnly:false},{path:'/login'},{secure:false},{expirationDate:1},{value:''},{value:'one;other=two'},{value:'line\r\nbreak'}]) expect(browserLoginCredential(site,{...cookie,...change})).toBeNull()
})
