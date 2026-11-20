import { MessagePlugin as native } from 'tdesign-vue-next'
import { MessagePlugin, interceptNativeMessages } from './notifications'
import { hasOperation } from './operations'
import { runSystemOperation } from './systemOperations'

jest.mock('tdesign-vue-next',()=>({MessagePlugin:{info:jest.fn(async()=>({close:jest.fn()})),success:jest.fn(async()=>({close:jest.fn()})),warning:jest.fn(),error:jest.fn()}}))
jest.mock('./operations',()=>({hasOperation:jest.fn()}))
jest.mock('./systemOperations',()=>({runSystemOperation:jest.fn()}))
const run=jest.mocked(runSystemOperation)
beforeEach(()=>{jest.clearAllMocks();jest.mocked(hasOperation).mockReturnValue(true)})

test('text notices are rewritten once, preserving options and the resulting handle',async()=>{
  run.mockImplementation(async(_name,input,execute)=>{await execute({...input,body:'Changed',level:'success'} as any)})
  const result=await MessagePlugin.info({content:'Original',duration:6000,closeBtn:true})
  expect(native.success).toHaveBeenCalledWith({content:'Changed',duration:6000,closeBtn:true})
  expect(result).toEqual(expect.objectContaining({close:expect.any(Function)}))
  expect(native.info).not.toHaveBeenCalled()
})

test('cancellation hides text while actionable messages and the fast path retain native behavior',async()=>{
  run.mockResolvedValue(undefined)
  await MessagePlugin.info('Original')
  expect(native.info).not.toHaveBeenCalled()
  const content=()=>null
  await MessagePlugin.info({content})
  expect(native.info).toHaveBeenCalledWith({content})
  jest.mocked(hasOperation).mockReturnValue(false)
  await MessagePlugin.info('Local')
  expect(native.info).toHaveBeenLastCalledWith('Local')
  expect(run).toHaveBeenCalledTimes(1)
})

test('destroying a pending Naive UI message prevents a late result from appearing',async()=>{
  let release!:()=>Promise<unknown>
  run.mockImplementation((_name,input,execute)=>new Promise(resolve=>{release=async()=>{await execute(input);resolve()}}))
  const original={info:jest.fn(()=>({destroy:jest.fn()}))}
  const proxy=interceptNativeMessages(original)
  const message=proxy.info()
  // A non-text call remains native.
  expect(original.info).toHaveBeenCalledTimes(1)
  original.info.mockClear()
  const pending=(proxy.info as any)('Text')
  pending.destroy()
  await release()
  expect(original.info).not.toHaveBeenCalled()
  message.destroy()
})
