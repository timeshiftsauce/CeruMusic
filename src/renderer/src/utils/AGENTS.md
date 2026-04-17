# SRC/RENDERER/SRC/UTILS

## OVERVIEW

Utility modules supporting renderer features: audio playback helpers, playlist import/export, color extraction, authentication helpers, lyrics bridge, hotkey recording, HTTP + NSFW filtering.

## STRUCTURE

```
utils/
├── audio/        # Audio pipeline helpers (manager, download, SMTC, volume)
├── playlist/     # Playlist export/import/cloud sync/meta utils
├── color/        # Album art color extraction + contrast helpers
├── auth/         # Display name formatting
├── hotkeys/      # Recording helper
├── lyrics/       # Desktop lyric bridge
├── request.ts    # Axios wrapper injecting auth headers
├── search.ts     # Fuzzy search helper (+ search.test.ts)
├── file.ts, lrcParser.ts, nsfwCheck.ts | misc utilities
```

## HIGHLIGHTS

- `audio/audioManager.ts`: Singleton around `HTMLAudioElement`, handles event forwarding to ControlAudio store. Exposes `loadSource`, `play`, `pause`, `seek`, playback rate, etc.
- `audio/globalControls.ts`: Wires keyboard shortcuts + SMTC (media keys) via `window.navigator.mediaSession` (guarded) and IPC fallback.
- `audio/useSmtc.ts`: Hooks SMTC metadata + handlers to ControlAudio state; used by Play components.
- `playlist/playlistExportImport.ts`: Exports/imports `.cmpl` playlist (JSON). Includes MIME helpers + file dialog integration via preload API.
- `playlist/cloudSyncHelper.ts`: syncs playlists with cloud API via `api/songList.ts`.
- `color/colorExtractor.ts`: Uses `color-extraction` + canvas to derive palette/dominant colors; caching via Map to avoid reprocessing images.
- `nsfwCheck.ts`: Wraps `nsfwjs` + `@tensorflow/tfjs`; loads TF model lazily to filter album art.
- `request.ts`: Axios instance injecting Logto token from Auth store and hooking progress callbacks.
- `search.ts`: Fuzzy search with ordering constraints; only enable fuzzy when query length 2–4 to avoid noise.
- `RecognitionWorker` integration: Buffer handling (byteOffset) documented in `lyrics/desktopLyricBridge.ts` and `views/music/RecognitionWorker.vue`.

## CONVENTIONS

- Keep utilities pure and UI-agnostic; component-specific logic belongs in components/composables.
- Avoid direct DOM access; use Vue refs provided by components.
- When manipulating `HTMLAudioElement`, guard for element availability (ControlAudio ensures single instance).
- Cache remote requests where possible (color extraction, NSFW models) to save CPU/GPU cycles.

## ANTI-PATTERNS

- Don’t block on TensorFlow model loads during render: nsfwCheck exposes async `ensureModel()`.
- Avoid sequential playlist file writes; use async and await OS dialogs to resolve before continuing.
- Never mutate Axios global defaults; configure instance per module (request.ts) to avoid cross-contamination.

## TESTS

- `utils/search.test.ts` verifies fuzzy matching order—use as guidance when editing search heuristics.
