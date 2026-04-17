# SRC/MAIN KNOWLEDGE BASE

## OVERVIEW

Electron main process: bootstraps BrowserWindow, orchestrates IPC, download/playlist services, plugin sandbox, music SDK adapters, tray/windows.

## STRUCTURE

```
src/main/
├── index.ts          # app entry, window/tray/lifecycle wiring
├── autoUpdate.ts     # updater helpers (legacy)
├── events/           # IPC handlers grouped by domain
├── services/         # Download manager, plugins, music cache, song list, AI
├── utils/            # Cross-provider music SDK utilities (JS + TS mix)
├── router/           # cerumusic:// deep-link handlers
├── windows/          # extra BrowserWindows (lyrics)
├── workers/          # downloadWorker thread entry
└── logger/, types/   # logging + shared types
```

## WHERE TO LOOK

| Task                          | Location                      | Notes                                                                                  |
| ----------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| App entry + window management | `index.ts`                    | Single-instance guard, tray, preload preload path setup                                |
| IPC definitions               | `events/*.ts`                 | Each file registers its own `ipcMain.handle/on` handlers; import via `events/index.ts` |
| Download queue                | `services/DownloadManager.ts` | Emits task events to renderer, wires lyrics/url fetchers                               |
| Plugin runtime                | `services/plugin/`            | Manages user plugins (LuoXue + Ceru) inside VM host                                    |
| Music SDK bridge              | `utils/musicSdk/`             | Vendor JS adapters, signature hacks, API clients per platform                          |
| Worker thread                 | `workers/downloadWorker.ts`   | Node worker sharing `@common` types                                                    |

## CONVENTIONS

- Keep renderer ↔ main IPC channel names in `domain:action` format; update preload bridge simultaneously.
- Batch download state changes (`DownloadManager`) instead of per-task resume to avoid queue churn.
- Lyrics + metadata fetchers must fail soft: never reject the whole download if extras missing.
- Persist window bounds via `savedBounds`; call `updateWindowMaxLimits` on resize to respect screen constraints.
- Router: register new `cerumusic://` paths in `router/routes.ts`, ensure handler idempotency.

## ANTI-PATTERNS

- Avoid performing long network work on main thread—push heavy work into `workers/` or async services.
- Don’t re-register event modules twice; `events/index.ts` should be single source.
- Never allow untrusted plugin code to escape the sandbox: interactions go through `CeruMusicPluginHost` message API only.
- Don’t mutate `mainWindow` references across modules; export helper functions instead of reassigning globals.

## GOTCHAS

- `utils/musicSdk` mixes plain JS + vendor minified blobs; run through Node (CommonJS) expectations.
- `request.js` builds custom headers per provider; share agent pools to avoid socket exhaustion.
- Worker + main share types from `@common`; keep message payloads serializable.
- System-tray toggles (lyrics lock/show) rely on renderer IPC events—update both sides when renaming channels.
