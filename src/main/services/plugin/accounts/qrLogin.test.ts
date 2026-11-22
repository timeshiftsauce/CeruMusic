import { expect, test } from '@jest/globals'
import { setTimeout as delay } from 'node:timers/promises'
import { checkQrImage, pollQrLogin, qrPresentation } from './qrLogin'

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X+UAAAAASUVORK5CYII='
test('QR descriptor only accepts bounded inline PNG images',()=>{
  expect(checkQrImage(image)).toBe(image)
  for(const invalid of ['https://service.example/code.png','data:image/svg+xml;base64,AA==','data:image/png;base64,eA==',image+'!']) expect(()=>checkQrImage(invalid)).toThrow()
  const bytes=Buffer.from(image.split(',')[1],'base64');bytes.writeUInt32BE(1025,16)
  expect(()=>checkQrImage('data:image/png;base64,'+bytes.toString('base64'))).toThrow()
})
test('locally drawn codes take one bounded HTTPS address and expose its normalized origin',()=>{
  expect(qrPresentation(image,undefined)).toEqual({image})
  expect(qrPresentation(undefined,'https://Music.Example:443/login?key=abc')).toEqual({url:'https://music.example/login?key=abc',origin:'https://music.example'})
  expect(()=>qrPresentation(image,'https://music.example/')).toThrow()
  for(const url of [null,'','http://music.example/','javascript:alert(1)','https://id:pass@music.example/','https://music.example/\n','https://music.example/'+'测'.repeat(180)]) expect(()=>qrPresentation(undefined,url)).toThrow()
})
test('elapsed lifetime discards a late success even when the polling callback ignores abort',async()=>{
  const result=await pollQrLogin(1000,new AbortController().signal,async()=>{await delay(1050);return {status:'done',credential:'late'}},async()=>true)
  expect(result).toEqual({expired:true})
})
test('dismissed view cannot accept a confirmed result; invalid results fail closed',async()=>{
  const live=new AbortController().signal
  expect(await pollQrLogin(1000,live,async()=>({status:'done',credential:'late'}),async()=>false)).toBeNull()
  await expect(pollQrLogin(1000,live,async()=>({status:'done'}),async()=>true)).rejects.toThrow()
  await expect(pollQrLogin(0,live,async()=>({status:'done',credential:'x'}),async()=>true)).rejects.toThrow()
})
