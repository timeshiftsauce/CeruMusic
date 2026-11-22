import { pluginInstallErrorMessage } from './pluginInstallError'

test('explains an unrecognized signing key in Chinese and preserves diagnostic details', () => {
  const message = pluginInstallErrorMessage(new Error('Incorrect keyId'))

  expect(message).toContain('插件签名校验失败')
  expect(message).toContain('安装已被阻止')
  expect(message).toContain('可信渠道重新下载')
  expect(message).toContain('校验详情：Incorrect keyId')
})

test('explains other signature verification failures', () => {
  expect(pluginInstallErrorMessage('Signature verification failed')).toContain(
    '插件签名校验失败'
  )
})

test('preserves unrelated errors and handles empty errors', () => {
  expect(pluginInstallErrorMessage(new Error('网络连接失败'))).toBe('网络连接失败')
  expect(pluginInstallErrorMessage(null)).toBe('未知错误，请稍后重试')
})
