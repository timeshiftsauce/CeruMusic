# AMLL core snapshot

Ceru Music uses the upstream core snapshot at
[`e13c5e6746618f54114ac37418afb11bf895b173`](https://github.com/amll-dev/applemusic-like-lyrics/commit/e13c5e6746618f54114ac37418afb11bf895b173)
(2026-11-20), packaged as `0.6.0+git.e13c5e6`.

This includes the Titanium background renderer and the lyric brightness-layer / scrolling
optimization merged after npm's `0.6.0` release, together with the later background-line
resize, line-breaking and syllable-glow fixes and the `data-amll-role` styling hooks. The Vue binding, lyric parser and TTML parserremain at their latest published versions; the Vue binding's core dependency is resolved to
this same snapshot to avoid loading two incompatible copies of the renderer.

The archive contains upstream sources, generated ESM/CJS, matching types, CSS, source maps,
and the upstream AGPL-3.0-only license. No upstream implementation is patched.

To rebuild from the pinned, SHA-256-verified source archive:

```sh
node scripts/vendor-amll.mjs
```

Requires Node 22.18+ and `tar`. Build tools are installed under `.tmp/amll/<commit>/source`.Normal installs and CI use the committed tarball and do not download or build upstream.
Once these changes are published to npm, replace the local core dependency and its resolution
with that release, and remove this snapshot and its rebuild script.
