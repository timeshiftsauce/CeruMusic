import { beforeEach, expect, jest, test } from '@jest/globals'
import { closeConfiguredWindow } from './windowClose'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { useSettingsStore } from '@renderer/store/Settings'

jest.mock('@renderer/services/desktopBridge', () => ({desktopBridge:{api:{close:jest.fn(),setMiniMode:jest.fn()}}}))
jest.mock('@renderer/store/Settings', () => ({useSettingsStore:jest.fn()}))

beforeEach(() => {jest.clearAllMocks()})
test('all close entry points respect unconfigured, tray and close preferences', () => {
  const prompt = jest.fn()
  const state = {settings:{hasConfiguredCloseBehavior:false,closeToTray:false}}
  jest.mocked(useSettingsStore).mockReturnValue(state as any)
  closeConfiguredWindow(prompt)
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(desktopBridge.api.close).not.toHaveBeenCalled()
  expect(desktopBridge.api.setMiniMode).not.toHaveBeenCalled()
  state.settings.hasConfiguredCloseBehavior = true
  state.settings.closeToTray = true
  closeConfiguredWindow(prompt)
  expect(desktopBridge.api.setMiniMode).toHaveBeenCalledWith(true)
  expect(desktopBridge.api.close).not.toHaveBeenCalled()
  state.settings.closeToTray = false
  closeConfiguredWindow(prompt)
  expect(desktopBridge.api.close).toHaveBeenCalledTimes(1)
  expect(prompt).toHaveBeenCalledTimes(1)
})
