# SRC/MAIN/SERVICES/PLUGIN

## OVERVIEW

Plugin hub orchestrating Ceru/LuoXue plugins: lifecycle control, IPC bridge, metadata fetch delegation, sandboxing via VM context.

## STRUCTURE

```
plugin/
├── index.ts                 # Facade invoked from main/index
├── CeruPluginService.ts     # Registry + lifecycle controls (if present upstream)
├── manager/
│   ├── CeruMusicPluginHost.ts      # Core sandbox manager
│   └── converter-event-driven.ts   # LuoXue → Ceru adapter
├── logger.ts                # Plugin scoped logger wrapping electron-log
└── utils/* (if added)       # Transport helpers
```

## WHERE TO LOOK

| Area            | File                                | Notes                                                                |
| --------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Service entry   | `plugin/index.ts`                   | Exports `initPlugins`, registers IPC handlers for install/list/exec  |
| Sandbox host    | `manager/CeruMusicPluginHost.ts`    | Spawns VM, injects limited globals, enforces timeout + memory guards |
| Format bridging | `manager/converter-event-driven.ts` | Converts LuoXue event-driven API into Ceru promises                  |
| Plugin notices  | `../events/pluginNotice.ts`         | Renderer notifications when plugins emit UI events                   |

## CONVENTIONS

- Plugin files live under `%appData%/CeruMusic/plugins`. Host only exposes whitelisted FS + network APIs.
- LuoXue plugins emit events; convert them via `converter-event-driven` before exposing to renderer.
- Host methods return plain JSON serializable payloads; avoid passing Buffers/functions.
- Always log plugin errors through `plugin/logger` to tag plugin name + version.

## ANTI-PATTERNS

- Do **not** eval plugin code in main scope—always instantiate through `CeruMusicPluginHost` VM with sandbox options.
- Never allow plugin to call Electron APIs directly; expose bridge methods explicitly.
- Avoid synchronous FS/network inside plugin dispatch loop; use async + timeouts to prevent blocking main thread.
- Reject plugin commands lacking manifest or checksum; guard against tampering.

## TIPS

- When adding new host capabilities, extend both `CeruMusicPluginHost` (exposed API map) and renderer-side typings.
- Keep backwards compatibility by version-gating optional plugin APIs; host stores plugin metadata on load.
- For plugin UI messages, reuse existing `plugin:*` IPC channels so renderer auto-imported handlers keep working.
