import { createHash } from 'node:crypto'
import { jest, test, expect } from '@jest/globals'
import { oauthOptions, OAuthCallbacks } from './oauth'

function attempt(callbacks:OAuthCallbacks, origin='https://login.example.org') {
  const controller=new AbortController()
  const options=oauthOptions({authorizationUrl:origin+'/authorize',tokenUrl:origin+'/token',clientId:'ceru-test',scopes:['profile']})
  let request!:URL
  const exchange=jest.fn(async (url:string,body:string)=>{
    const packet=new URLSearchParams(body)
    expect(url).toBe(origin+'/token')
    expect(packet.get('redirect_uri')).toBe(request.searchParams.get('redirect_uri'))
    expect(createHash('sha256').update(packet.get('code_verifier')!).digest('base64url')).toBe(request.searchParams.get('code_challenge'))
    expect(request.searchParams.get('code_challenge_method')).toBe('S256')
    return {status:200,body:{token_type:'Bearer',access_token:'synthetic-test-token'}}
  })
  const done=callbacks.authorize(options,controller.signal,async url=>{request=new URL(url)},exchange)
  return {done,exchange,controller,state:request.searchParams.get('state')!,redirect:request.searchParams.get('redirect_uri')!}
}

test('parallel callbacks are bound to the state and issuer-specific redirect, PKCE exchange runs once',async()=>{
  const callbacks=new OAuthCallbacks(),first=attempt(callbacks),second=attempt(callbacks,'https://other.example.org')
  expect(first.state).not.toBe(second.state)
  expect(first.redirect).not.toBe(second.redirect)
  expect(callbacks.accept('ceru://playlist/42')).toBe(false)
  for (const url of [second.redirect+'?state='+first.state+'&code=bad',first.redirect+'?state=no&code=bad',first.redirect+'?state='+first.state+'&state='+first.state+'&code=bad',first.redirect+'?state='+first.state+'&code=a&code=b']) callbacks.accept(url)
  const callback=first.redirect+'?state='+first.state+'&code=one'
  callbacks.accept(callback); callbacks.accept(callback)
  callbacks.accept(second.redirect+'?state='+second.state+'&error=access_denied')
  expect(await first.done).toEqual({credential:'synthetic-test-token',binding:{origin:'https://login.example.org',sendAs:'bearer'}})
  expect(await second.done).toBeNull()
  expect(first.exchange).toHaveBeenCalledTimes(1)
  expect(second.exchange).not.toHaveBeenCalled()
})

test('cancellation invalidates the callback before any token exchange',async()=>{
  const callbacks=new OAuthCallbacks(),login=attempt(callbacks)
  login.controller.abort()
  callbacks.accept(login.redirect+'?state='+login.state+'&code=late')
  await expect(login.done).rejects.toThrow()
  expect(login.exchange).not.toHaveBeenCalled()
})

test('untrusted resource origins and non-HTTPS token exchanges are rejected',()=>{
  const base={authorizationUrl:'https://one.example/authorize',tokenUrl:'https://one.example/token',clientId:'public'}
  for (const overrides of [{resourceOrigin:'https://other.example'},{tokenUrl:'http://one.example/token'},{tokenUrl:'https://other.example/token'},{authorizationUrl:'https://user@one.example/authorize'}]) expect(()=>oauthOptions({...base,...overrides})).toThrow()
})
