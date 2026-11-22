import axios from 'axios'
import { useAuthStore } from '@renderer/store/Auth'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { Request } from '@renderer/utils/request'
import { isInvalidLogtoSession } from './sessionError'

jest.mock('axios', () => ({ __esModule: true, default: { create: jest.fn() } }))
jest.mock('@renderer/store/Auth', () => ({ useAuthStore: jest.fn() }))
jest.mock('@renderer/plugin/notifications', () => ({ MessagePlugin: { warning: jest.fn() } }))

const create = axios.create as jest.Mock
const authStore = { isAuthenticated: true, outlogin: jest.fn() }
const client = {
  getAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  clearAllTokens: jest.fn()
}
let send: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  send = jest.fn()
  create.mockReturnValue(send)
  authStore.isAuthenticated = true
  authStore.outlogin.mockImplementation(async () => {
    authStore.isAuthenticated = false
  })
  ;(useAuthStore as unknown as jest.Mock).mockReturnValue(authStore)
  client.getAccessToken.mockResolvedValue('old-token')
  client.clearAccessToken.mockResolvedValue(undefined)
  Request.setLogtoClient(client as any)
})

test('a feature permission error mentioning login does not erase the session', async () => {
  send.mockRejectedValue({ response: { status: 403, data: { message: '该功能需要登录' } } })
  const request = new Request('https://permission-test.invalid')

  await expect(request.get('/feature')).rejects.toThrow('该功能需要登录')
  expect(authStore.outlogin).not.toHaveBeenCalled()
  expect(client.clearAccessToken).not.toHaveBeenCalled()
})

test('a rejected access token is refreshed and the original request is retried once', async () => {
  send
    .mockRejectedValueOnce({ response: { status: 401, data: { message: 'Unauthorized' } } })
    .mockResolvedValueOnce({ data: { ok: true } })
  client.getAccessToken.mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token')
  const request = new Request('https://refresh-test.invalid')

  await expect(request.get('/profile')).resolves.toEqual({ ok: true })
  expect(client.clearAccessToken).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[1][0].headers.Authorization).toBe('Bearer new-token')
  expect(authStore.outlogin).not.toHaveBeenCalled()
})

test('only a rejected refresh credential signs out the current account', async () => {
  const rejected = Object.assign(new Error('Refresh token rejected'), {
    name: 'LogtoRequestError',
    code: 'invalid_grant'
  })
  expect(isInvalidLogtoSession(rejected)).toBe(true)
  expect(isInvalidLogtoSession({ name: 'LogtoRequestError', code: 'server_error' })).toBe(false)
  client.getAccessToken.mockRejectedValue(rejected)
  const request = new Request('https://expired-test.invalid')

  await expect(request.get('/profile')).rejects.toThrow('登录已过期')
  expect(authStore.outlogin).toHaveBeenCalledTimes(1)
  expect(MessagePlugin.warning).toHaveBeenCalledTimes(1)
})
