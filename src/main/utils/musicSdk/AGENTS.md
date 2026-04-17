# SRC/MAIN/UTILS/MUSICSDK

## OVERVIEW

Vendor-specific JS adapters for Chinese music providers (wy, tx, kg, kw, mg, bd, git). Each folder embeds web-scraped APIs, signature algorithms, cookie logic.

## STRUCTURE

```
musicSdk/
├── index.js / options.js / utils.js   # Shared helper entry
├── api-source-info.ts                 # Source metadata
├── service.ts                         # Orchestrator used by main services
├── wy/, tx/, kg/, kw/, mg/, bd/, git/ # Provider adapters (JS)
└── */utils/, */vendors/               # Extra signature helpers / WASM blobs
```

## WHERE TO LOOK

| Provider        | Folder | Callouts                                                                 |
| --------------- | ------ | ------------------------------------------------------------------------ |
| NetEase (wy)    | `wy/`  | Has `utils/` with AES/RSA helpers, comment APIs                          |
| QQ/Tencent (tx) | `tx/`  | Includes `__pycache__` residue, JS adapters call Node Buffer conversions |
| Kugou (kg)      | `kg/`  | Contains minified `vendors/infSign.min.js` for signature                 |
| Kuwo (kw)       | `kw/`  | `songList.js` heavy playlist parser                                      |
| Migu (mg)       | `mg/`  | `utils/` for token refresh                                               |
| Baidu (bd)      | `bd/`  | Minimal search APIs                                                      |

## CONVENTIONS

- All adapters export async functions returning plain objects (song/album/lyric). Keep payload serializable.
- HTTP calls use `needle` or `request.js` helpers; reuse shared agent to avoid connection leak.
- Signature helpers often mutate global cookies; ensure per-request cloning when modifying headers.
- Provider IDs follow `[source]_[numericId]`; keep consistent so renderer can map providers.

## ANTI-PATTERNS

- Do not mix ESM/TS syntax in provider folders—most files plain CommonJS; converting requires touching import graph.
- Never run provider code in renderer—sensitive tokens should stay in main process.
- Avoid storing credentials in repo; provider secrets go through env or plugin configuration.
- Minified vendor libs (`infSign.min.js`, `afp.js`) are heavy; do not prettify/alter or signature may break.

## GOTCHAS

- Some adapters expect `globalThis.window` shims; see `index.js` for polyfills.
- Tencent adapter handles both `songmid` and `songid`; ensure you pass correct key.
- Worker thread shares these functions via `service.ts`; keep functions pure to allow `worker_threads` serialization.
