# AMLL core snapshot

Ceru Music uses the upstream core snapshot at
[`5fee356362353dbb24ce9bea3a62536478040de7`](https://github.com/amll-dev/applemusic-like-lyrics/commit/5fee356362353dbb24ce9bea3a62536478040de7)
(2026-10-21), packaged as `0.6.0+git.5fee356`.

This includes the Titanium background renderer and the lyric brightness-layer / scrolling
optimization merged after npm's `0.6.0` release. The Vue binding, lyric parser and TTML parser
remain at their latest published versions; the Vue binding's core dependency is resolved to
this same snapshot to avoid loading two incompatible copies of the renderer.

The archive contains upstream sources, generated ESM/CJS, matching types, CSS, source maps,
and the upstream AGPL-3.0-only license. No upstream implementation is patched.

To rebuild from the pinned, SHA-256-verified source archive:

```sh
node scripts/vendor-amll.mjs
```

Requires Node 22.18+ and `tar`. Build tools are installed under `.tmp/amll/source`.
Normal installs and CI use the committed tarball and do not download or build upstream.
Once these changes are published to npm, replace the local core dependency and its resolution
with that release, and remove this snapshot and its rebuild script.
