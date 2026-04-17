# WEBSITE KNOWLEDGE BASE

## OVERVIEW

`website/` holds the static marketing microsite (pure HTML/CSS/JS) used for downloads/docs promo separate from VitePress docs.

## STRUCTURE

```
website/
├── index.html       # Landing page
├── design.html      # Design showcase
├── pluginDev.html   # Plugin developer CTA
├── CeruUse.html     # Usage instructions
├── script.js        # Shared behavior (fetch releases, DOM interactions)
└── styles.css       # Shared styling (responsive layout)
```

## CONVENTIONS

- Uses vanilla JS + fetch to query GitHub releases; ensure CORS-friendly endpoints.
- Styles rely on CSS variables defined in `styles.css`; keep palette consistent with app brand.
- `script.js` caches API responses; avoid bundling heavy libs (no build step).

## GOTCHAS

- Paths assume site hosted under root; adjust if deploying under subpath by editing asset links.
- Release download buttons call GitHub API—update tokenless rate limit messaging when needed.
- Keep HTML bilingual? Currently Chinese-first; maintain translation consistency.
