# SRC/RENDERER KNOWLEDGE BASE

## OVERVIEW

Vue 3 + Vite renderer powering the Ceru Music UI: Pinia stores, naive-ui/tdesign dual UI kits, auto-imported components, routes for home/music/settings/download/user/welcome.

## STRUCTURE

```
src/renderer/
├── src/
│   ├── api/           # REST wrappers (song lists, cloud sync)
│   ├── components/    # Feature components (Play, Settings, Music, ContextMenu, etc.)
│   ├── composables/   # Vue composables (auto-update)
│   ├── config/        # Logto + endpoint config
│   ├── router/        # vue-router config + route preload logic
│   ├── services/      # renderer-side services (music, auto-update, settings sync)
│   ├── store/         # Pinia stores (audio, auth, settings, download, etc.)
│   ├── utils/         # Audio/color/playlist helpers, NSFW checks
│   ├── views/         # Page-level components (home, music*, settings*, etc.)
│   ├── assets/        # Bundled static assets (icons/themes)
│   ├── main.ts        # Bootstraps app w/ Pinia + Logto + router
│   └── App.vue        # Root shell
├── public/            # Static assets shipped verbatim (afp.js, default covers)
├── auto-imports.d.ts  # Vue/Pinia/naive-ui helper auto-imports
└── components.d.ts    # Component auto-registration declarations
```

## WHERE TO LOOK

| Task             | Location                               | Notes                                                                                       |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| UI components    | `components/`                          | Feature folders: Play (player), Settings (14 panels), ContextMenu (global menus), etc.      |
| State management | `store/`                               | Pinia stores (`useSettingsStore`, `useControlAudioStore`, `useGlobalPlayStatusStore`, etc.) |
| Audio logic      | `utils/audio/`                         | Playback orchestration, SMTC integration, playlist management                               |
| Routing          | `router/index.ts`                      | Hash router, route preloading via `requestIdleCallback`                                     |
| Auto imports     | `auto-imports.d.ts`, `components.d.ts` | naive-ui + tdesign + local components globally registered                                   |

## CONVENTIONS

- Composition API everywhere; thanks to auto-imports, no explicit `import { ref } from 'vue'` needed.
- Dual UI kit: `N*` components from naive-ui, `T*` from tdesign-vue-next. Avoid mixing styles within one view where possible.
- Pinia stores persisted via `pinia-plugin-persistedstate`; update `persist` config when adding new fields.
- Fuzzy search limited to short queries (see `utils/search.ts`).
- DLNA sync threshold 2s to avoid jitter (`components/Play/PlayMusic.vue`).

## ANTI-PATTERNS

- Don’t register global event listeners in layout components (moved to `App.vue`).
- Avoid infinite fetch loops by relying on requested page index (`store/GlobalPlayStatus.ts`).
- Do not convert Node Buffers without respecting byteOffset (RecognitionWorker audio pipeline).
- Keep download store mutations reactive—replace objects instead of deep mutation where needed.

## UNIQUE STYLES

- `components/Play` heavily integrates `@applemusic-like-lyrics/vue` for visual lyrics + comment overlays.
- `ContextMenu` folder ships its own composables + README for usage.
- `assets/` includes custom fonts (lyric font), animated themes, and icon_font packages.
- Settings view uses `views/settings/sections` to lazy-load panels and `SettingsSearch` to deep-link into sections.

## COMMANDS (FRONTEND)

```bash
yarn dev        # launches electron-vite dev (renderer + main)

## NOTES
- `auto-imports.d.ts` exposes Vue APIs + naive-ui helpers (`useDialog`, `useMessage`, etc.) and tdesign `DialogPlugin`.
- `components.d.ts` registers >40 project components (Play*, Settings*, ContextMenu, etc.) plus naive-ui/tdesign components and router components; no manual import needed inside SFCs.
- Router uses hash mode to coexist with Electron file protocol; preloading relies on `requestIdleCallback` (polyfill for Windows 7).
```
