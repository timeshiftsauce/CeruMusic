export type HotkeyAction =
  | 'toggle'
  | 'playNext'
  | 'playPrev'
  | 'seekForward'
  | 'seekBackward'
  | 'volumeUp'
  | 'volumeDown'
  | 'toggleDesktopLyric'
  | 'setPlayModeSequence'
  | 'setPlayModeRandom'
  | 'togglePlayModeSingle'
  | 'toggleAudioOutputSelector'

export type HotkeyConfig = {
  enabled: boolean
  bindings: Partial<Record<HotkeyAction, string>>
}

export type HotkeyConfigPayload = Partial<HotkeyConfig>

export type HotkeyStatus = {
  failedActions: HotkeyAction[]
  actionErrors: Partial<Record<HotkeyAction, string[]>>
}

export const defaultHotkeyConfig: HotkeyConfig = {
  enabled: true,
  bindings: {
    toggle: 'CommandOrControl+Alt+P',
    playPrev: 'CommandOrControl+Alt+Left',
    playNext: 'CommandOrControl+Alt+Right',
    seekBackward: 'CommandOrControl+Alt+J',
    seekForward: 'CommandOrControl+Alt+L',
    volumeDown: 'CommandOrControl+Alt+Down',
    volumeUp: 'CommandOrControl+Alt+Up',
    toggleDesktopLyric: 'CommandOrControl+Alt+D',
    setPlayModeSequence: 'CommandOrControl+Alt+4',
    setPlayModeRandom: 'CommandOrControl+Alt+5',
    togglePlayModeSingle: 'CommandOrControl+Alt+6',
    toggleAudioOutputSelector: 'Alt+O'
  }
}
