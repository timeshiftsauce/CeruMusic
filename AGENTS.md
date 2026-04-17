# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-11 01:00:58 (Asia/Shanghai)
**Commit:** 26da4c2
**Branch:** main

## OVERVIEW

Ceru Music (澜音) is an Electron + Vue 3 + TypeScript desktop music player that relies on user-supplied plugins for lawful music metadata. The repo mixes Node/Electron main process code, Vue renderer, and an external website/docs bundle.

## STRUCTURE

```
./
├── src/                # main Electron code + renderer + shared types
│   ├── main/           # Electron main process (IPC, services, plugin host)
│   ├── renderer/       # Vue 3 renderer (nested src/, assets, auto-import setup)
│   ├── preload/        # Context bridge exposing safe IPC APIs
│   ├── common/         # Shared TS types + lyric utilities
│   └── types/          # Extra shared declarations
├── docs/               # VitePress documentation site
├── website/            # Static marketing microsite
├── scripts/            # Helper Node scripts (auth test, AST dump)
├── resources/          # Build assets (icons, thumbar artwork)
├── assets/             # Screenshots + readme media
└── .github/workflows/  # CI pipelines (build + release sync)
```

## WHERE TO LOOK

| Task                                   | Location                    | Notes                                                                     |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------------- |
| Electron main IPC, services, windowing | `src/main/`                 | Home of download manager, plugin host, music SDK wrappers, IPC events     |
| Renderer UI + state                    | `src/renderer/src/`         | Vue 3 + Pinia. Components auto-imported via unplugin. Entry at `main.ts`  |
| Preload bridge APIs                    | `src/preload/index.ts`      | Defines channel surface exposed to renderer, keep in sync with IPC events |
| Shared types/utilities                 | `src/common/`, `src/types/` | Basic TS declarations reused by main + renderer                           |
| Docs site                              | `docs/`                     | VitePress (see `.vitepress` config), high-level guides                    |
| CI/CD + release sync                   | `.github/workflows/`        | Builds, release publishing, WebDAV/Alist sync                             |
| Desktop resources                      | `resources/`, `build/`      | Icons, NSIS scripts, thumbar images used by packaging                     |

## CODE MAP

| Symbol                 | Type        | Location                                                  | Refs           | Role                                                          |
| ---------------------- | ----------- | --------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| `createWindow`         | function    | `src/main/index.ts`                                       | electron entry | Creates main BrowserWindow, manages bounds + tray integration |
| `setupDownloadManager` | function    | `src/main/index.ts`                                       | ipc/events     | Configures download worker, lyrics/url fetchers, IPC handlers |
| `CeruMusicPluginHost`  | class       | `src/main/services/plugin/manager/CeruMusicPluginHost.ts` | plugins        | Runs Ceru plugins in sandbox, mediates host <-> plugin bridge |
| `useSettingsStore`     | Pinia store | `src/renderer/src/store/Settings.ts`                      | renderer       | Global settings state with persisted preferences              |
| `FullPlay.vue`         | component   | `src/renderer/src/components/Play/FullPlay.vue`           | player UI      | Main player UI w/ apple-music-like lyrics + comments overlay  |

## CONVENTIONS

- Formatting: Prettier (single quotes, no semicolons, 2-space indent, 100 char width). ESLint is extremely relaxed—runtime correctness over strict typing.
- Path aliases: `@common`, `@renderer`, `@types`, `@assets`, `@store`, `@services`. Match tsconfig + electron.vite aliases before moving files.
- Auto-imports: Vue composition APIs plus naive-ui/tdesign components, and most local components are globally available (see `src/renderer/auto-imports.d.ts` & `components.d.ts`). Pinia helpers still require explicit imports.
- Package manager: Yarn. Scripts assume yarn commands, CI locks to Node 22.
- IPC naming: `download:*`, `music:*`, `plugin:*` channels follow `domain:action` scheme. Keep renderer + preload definitions synchronized.

## ANTI-PATTERNS (THIS PROJECT)

- **Don’t fail downloads on lyric errors** (`DownloadManager.ts`): treat lyrics as optional to keep queue healthy.
- **Avoid per-task resume loops** (`DownloadManager.ts`): batch state changes so the queue isn’t double-processed.
- **Don’t re-register global event listeners in layouts** (`HomeLayout.vue`): centralize in `App.vue` to prevent conflicts.
- **Sync audio timers only when drift >2s** (`PlayMusic.vue`): prevents jitter in DLNA playback.
- **Use requested page index for comment paging** (`GlobalPlayStatus.ts`): some APIs are 0-based; using response page leads to infinite fetch loops.
- **Enable fuzzy search only for short queries** (`utils/search.ts`): long queries would match noise.
- **When converting buffers, handle byteOffset** (`RecognitionWorker.vue`): Node Buffer != ArrayBuffer.

## UNIQUE STYLES

- Triple asset pools (`assets/`, `resources/`, `src/renderer/src/assets/`)—know which pipeline consumes each before editing.
- Renderer state uses Pinia with persisted slices (see `pinia-plugin-persistedstate`), plus custom pub/sub in `ControlAudio`.
- Music SDK layer blends TS + legacy JS vendor blobs per platform—expect uneven style.
- Docs + marketing site both live in-repo (`docs/`, `website/`), but they are separate builds.

## COMMANDS

```bash
yarn dev                 # Electron dev with hot reload
yarn build               # Typecheck + electron-vite production build
yarn build:win|mac|linux # Platform-specific electron-builder targets
yarn test                # Jest (ts-jest) test suite
yarn docs:dev            # VitePress docs dev server
```

## NOTES

- CI release workflow (`.github/workflows/main.yml`) builds three platforms in parallel and pushes artifacts to GitHub Release + WebDAV mirrors. Keep file names stable.
- Electron mirrors configured via `.npmrc` (npmmirror) to speed Chinese network—retain when updating dependencies.
- Worker thread (`src/main/workers/downloadWorker.ts`) shares code with main through `@common`—changing interfaces requires dual updates.
