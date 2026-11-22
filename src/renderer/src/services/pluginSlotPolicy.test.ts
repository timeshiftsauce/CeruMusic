import { expect, jest, test } from '@jest/globals'
import {
  acquireSlot,
  pausedSlotPlugins,
  recordSlotMount,
  strictPluginViews
} from './pluginSlotPolicy'

test('only five consecutive slow component mounts pause that plugin’s slots', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const plugin = 'test.slow',
    slot = 'playlist.header.actions'
  const strictBefore = strictPluginViews.value
  try {
    strictPluginViews.value = false
    for (let count = 0; count < 4; count++) recordSlotMount(plugin, 51)
    recordSlotMount(plugin, 50)
    for (let count = 0; count < 4; count++) recordSlotMount(plugin, 51)
    expect(pausedSlotPlugins.value.has(plugin)).toBe(false)
    recordSlotMount(plugin, 51)
    expect(warn).toHaveBeenCalledTimes(9)
    expect(acquireSlot(plugin, slot)).toBeUndefined()
    const release = acquireSlot('test.fast', slot)
    expect(release).toBeDefined()
    release?.()
  } finally {
    warn.mockRestore()
    pausedSlotPlugins.value.delete(plugin)
    strictPluginViews.value = strictBefore
  }
})
