import { describe, expect, test } from '@jest/globals'
import { isMediaKeyAccelerator, resolveMediaKeyFromEventKey } from './hotkeyAccelerators'

describe('hotkey media key guard', () => {
  test('recognises media key accelerators regardless of casing or modifiers', () => {
    expect(isMediaKeyAccelerator('MediaPlayPause')).toBe(true)
    expect(isMediaKeyAccelerator('mediaplaypause')).toBe(true)
    expect(isMediaKeyAccelerator('MediaNextTrack')).toBe(true)
    expect(isMediaKeyAccelerator('MediaPreviousTrack')).toBe(true)
    expect(isMediaKeyAccelerator('MediaStop')).toBe(true)
    expect(isMediaKeyAccelerator('CommandOrControl+MediaPlayPause')).toBe(true)
    expect(isMediaKeyAccelerator(' MediaStop ')).toBe(true)
  })

  test('leaves ordinary accelerators alone', () => {
    expect(isMediaKeyAccelerator('CommandOrControl+Alt+P')).toBe(false)
    expect(isMediaKeyAccelerator('Alt+O')).toBe(false)
    expect(isMediaKeyAccelerator('CommandOrControl+Alt+4')).toBe(false)
    expect(isMediaKeyAccelerator('')).toBe(false)
  })

  test('maps browser media key event names to electron accelerators', () => {
    expect(resolveMediaKeyFromEventKey('MediaPlayPause')).toBe('MediaPlayPause')
    expect(resolveMediaKeyFromEventKey('MediaPlay')).toBe('MediaPlay')
    expect(resolveMediaKeyFromEventKey('MediaPause')).toBe('MediaPause')
    expect(resolveMediaKeyFromEventKey('MediaStop')).toBe('MediaStop')
    expect(resolveMediaKeyFromEventKey('MediaTrackNext')).toBe('MediaNextTrack')
    expect(resolveMediaKeyFromEventKey('MediaTrackPrevious')).toBe('MediaPreviousTrack')
    expect(resolveMediaKeyFromEventKey('P')).toBeNull()
    expect(resolveMediaKeyFromEventKey('ArrowUp')).toBeNull()
  })
})
