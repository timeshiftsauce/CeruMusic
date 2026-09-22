/** 自伤援助提示 —— 该弹的时候必须弹出来,静默吞掉就等于没做 */
jest.mock('tdesign-vue-next', () => ({
  DialogPlugin: { alert: jest.fn(() => ({ hide: jest.fn() })) }
}))

import { DialogPlugin } from 'tdesign-vue-next'
import { showSupportNotice } from './communitySupport'

const alertMock = DialogPlugin.alert as unknown as jest.Mock

describe('showSupportNotice', () => {
  beforeEach(() => alertMock.mockClear())

  it('有 support 时弹窗,并把援助热线写进正文', () => {
    showSupportNotice({
      title: '你并不孤单',
      text: '可以拨打心理援助热线,也可以告诉身边信任的人',
      hotline: '12356'
    })

    expect(alertMock).toHaveBeenCalledTimes(1)
    const arg = alertMock.mock.calls[0][0]
    expect(arg.header).toBe('你并不孤单')
    expect(arg.body).toContain('12356')
  })

  it('正常发布(support 缺省)不打扰用户', () => {
    showSupportNotice(undefined)
    showSupportNotice(null)

    expect(alertMock).not.toHaveBeenCalled()
  })
})
