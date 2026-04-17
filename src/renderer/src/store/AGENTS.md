# SRC/RENDERER/SRC/STORE

## OVERVIEW

Pinia stores orchestrating player state, settings, auth, downloads, DLNA, EQ/effects, search. Persisted via `pinia-plugin-persistedstate` with selective slices.

## STRUCTURE

```
store/
├── index.ts             # Exports use*Store helpers
├── Settings.ts         # Global settings (theme, directories, audio)
├── ControlAudio.ts     # Audio element controller + pub/sub bus
├── GlobalPlayStatus.ts # Playback metadata (lyrics, comments, queue)
├── download.ts         # Download queue state mirroring main process
├── playSetting.ts      # Playback preferences (loop, cross fade)
├── Equalizer.ts        # EQ bands + presets
├── AudioEffects.ts     # Surround/bass toggles
├── audioOutput.ts      # Device selection
├── Auth.ts             # Logto authentication tokens/profile
├── LocalUserDetail.ts  # Local favorites/playlists
├── dlna.ts             # DLNA session state
├── search.ts           # Search history + filters
└── Settings.test.ts    # Jest test covering Settings store
```

## CONVENTIONS

- Each store uses `defineStore('name', () => { ... })` functional syntax; import as `const store = useXxxStore()`.
- Persistence uses `persist: { key, paths }`; update when adding new state fields needing storage.
- Avoid direct mutation of array elements in downloads when reactivity matters; reassign with `splice` or `map`.
- ControlAudio implements its own pub/sub map; always unsubscribe on component unmount via returned disposer.
- GlobalPlayStatus comment pagination uses requested page index (some APIs 0-based).

## ANTI-PATTERNS

- Don’t persist volatile state (e.g., `GlobalPlayStatus.currentLyric`)—only user settings.
- Avoid synchronous IPC from stores; wrap `window.ceru.invoke` in services/composables.
- Never store Electron native objects (BrowserWindow) inside Pinia; keep plain JSON.

## NOTES

- `Settings.test.ts` demonstrates mocking `localStorage` + verifying persist plugin integration.
- `Auth.ts` wraps Logto SDK; ensure refresh token flows happen via provided composables, not direct fetch.
- `dlna.ts` depends on `upnp-mediarenderer-client`; run in renderer only when connection active.
