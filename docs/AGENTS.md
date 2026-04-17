# DOCS KNOWLEDGE BASE

## OVERVIEW

`docs/` hosts the VitePress documentation site: product guides, plugin development docs, release notes.

## STRUCTURE

```
├── .vitepress/
│   ├── config.mts      # Site metadata, sidebar/nav, theme import
│   └── theme/          # Custom theme assets (Phycat fonts/css)
├── guide/              # User + plugin dev guides
│   ├── CeruMusicPluginDev.md
│   ├── ...
│   └── used/assets/    # Embedded images
├── public/             # Static assets (if added)
└── index.md            # Landing page
```

## BUILD

```bash
yarn docs:preview # preview built output
```

## CONVENTIONS

- Written in Chinese (Simplified) Markdown; follow existing tone.
- Sidebar controlled via `.vitepress/config.mts` -> `sidebar` array. Add new docs to sidebars to keep nav consistent.
- Theme overrides live under `.vitepress/theme/phycat` (fonts, CSS). Reuse `phycat` assets for consistent typography.
- Document plugin APIs but never include actual music source credentials—remind developers about legality.

## GOTCHAS

- `guide/used/assets` referenced via relative paths; keep filenames stable to avoid broken docs images.
- Docs share `tsconfig`? (no). Explains to keep doc-specific dependencies under docs.
- When referencing code, prefer fenced blocks with shell highlighter.
