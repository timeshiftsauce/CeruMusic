import { desktopBridge } from '@renderer/services/desktopBridge'
import { bindPlaybackOperations, performOperationDefault, runWindowClose } from './operations'

jest.mock('@renderer/services/desktopBridge',()=>({desktopBridge:{api:{plugins:{onHookNames:jest.fn(()=>jest.fn()),hookSnapshot:jest.fn(),windowClose:jest.fn()}}}}))
const plugins=jest.mocked(desktopBridge.api.plugins)

test('window close remains local without hooks and coalesces concurrent requests while pending',async()=>{
  plugins.hookSnapshot.mockResolvedValue({revision:1,names:[],announce:false} as any)
  const unbind=bindPlaybackOperations(), close=jest.fn()
  try {
    await Promise.resolve()
    await runWindowClose(close,'titlebar')
    expect(close).toHaveBeenCalledTimes(1)
    expect(plugins.windowClose).not.toHaveBeenCalled()
    close.mockClear()
    plugins.onHookNames.mock.calls[0][0]({revision:2,names:['window.close'],announce:false} as any)
    let release!:()=>void
    plugins.windowClose.mockImplementationOnce(async(id,location)=>{
      expect(location).toBe('shortcut')
      await new Promise<void>(resolve=>{release=resolve})
      await performOperationDefault(id,'window.close',{})
      await expect(performOperationDefault(id,'window.close',{})).rejects.toThrow()
      return {prevented:false,handledBy:[]}
    })
    const first=runWindowClose(close,'shortcut')
    const duplicate=runWindowClose(close,'titlebar')
    await Promise.resolve()
    expect(plugins.windowClose).toHaveBeenCalledTimes(1)
    release();await Promise.all([first,duplicate])
    expect(close).toHaveBeenCalledTimes(1)
    close.mockClear()
    plugins.windowClose.mockResolvedValueOnce({prevented:true,handledBy:[]})
    await runWindowClose(close,'titlebar')
    expect(close).not.toHaveBeenCalled()
  } finally {unbind()}
})
