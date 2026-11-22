import { MessagePlugin as messages } from 'tdesign-vue-next'
import type { OperationInputs } from '@shiqianjiang/ceru-plugin-sdk'
import { hasOperation } from './operations'
import { runSystemOperation } from './systemOperations'

type Notice = OperationInputs['notification.show']
const levels = new Set(['info','success','warning','error'])

/** Keep the existing renderer and message handles; only plain text is exposed to hooks. */
export const MessagePlugin: typeof messages = new Proxy(messages, {
  get(target,key,receiver) {
    const original=Reflect.get(target,key,receiver)
    if(typeof key!=='string'||!levels.has(key))return original
    return (...args:any[])=>{
      const first=args[0],body=typeof first==='string'?first:first?.content
      // Function/VNode content includes action buttons and must keep its original lifecycle.
      if(typeof body!=='string'||body.length>8192||!hasOperation('notification.show'))return original(...args)
      return (async()=>{
        let result:any
        await runSystemOperation('notification.show',{title:'',body,level:key as Notice['level']},async input=>{
          const content=input.title?input.title+'：'+input.body:input.body
          const selected=typeof first==='string'?content:{...first,content}
          result=await messages[input.level](selected,...args.slice(1))
        })
        return result
      })()
    }
  }
})

export function interceptNativeMessages<T extends object>(messages:T):T {
  return new Proxy(messages,{
    get(target,key,receiver) {
      const original:any=Reflect.get(target,key,receiver)
      if(typeof key!=='string'||!levels.has(key))return typeof original==='function'?original.bind(target):original
      return (...args:any[])=>{
        if(typeof args[0]!=='string'||args[0].length>8192||!hasOperation('notification.show'))return original.apply(target,args)
        const originalArgs=[...args]
        let handle:any,closed=false
        void runSystemOperation('notification.show',{title:'',body:args[0],level:key as Notice['level']},async input=>{
          if(closed)return
          const render:any=Reflect.get(target,input.level)
          handle=render.call(target,input.title?input.title+'：'+input.body:input.body,...originalArgs.slice(1))
        }).catch(console.warn)
        return {destroy(){closed=true;handle?.destroy()}}
      }
    }
  })
}
