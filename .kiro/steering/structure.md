# Project Structure

## Root Level Organization
```
├── src/                    # Source code
├── resources/              # App resources (icons, etc.)
├── build/                  # Build artifacts
├── out/                    # Compiled output
└── node_modules/           # Dependencies
```

## Source Code Architecture (`src/`)

### Electron Multi-Process Structure
```
src/
├── main/                   # Main process (Node.js)
│   └── index.ts           # Entry point for main process
├── preload/               # Preload scripts (security bridge)
│   ├── index.ts          # Preload script implementation
│   └── index.d.ts        # Type definitions
└── renderer/              # Renderer process (Vue app)
    ├── src/              # Vue application source
    ├── index.html        # HTML entry point
    ├── auto-imports.d.ts # Auto-generated import types
    └── components.d.ts   # Auto-generated component types
```

## Configuration Files

### TypeScript Configuration
- `tsconfig.json`: Root config with project references
- `tsconfig.node.json`: Node.js/Electron main process config
- `tsconfig.web.json`: Web/renderer process config

### Build & Development
- `electron.vite.config.ts`: Vite configuration for Electron
- `electron-builder.yml`: App packaging configuration
- `package.json`: Dependencies and scripts

### Code Quality
- `eslint.config.mjs`: ESLint configuration (flat config)
- `.prettierrc.yaml`: Prettier formatting rules
- `.editorconfig`: Editor configuration

## Key Conventions
- **Renderer alias**: Use `@renderer/*` for renderer source imports
- **Auto-imports**: TDesign components and Vue composables are auto-imported
- **Process separation**: Maintain clear boundaries between main, preload, and renderer
- **TypeScript**: All source files should use TypeScript (.ts/.vue)

## File Naming
- Use kebab-case for component files
- Use camelCase for TypeScript files
- Vue components should be multi-word (ESLint enforced, but disabled)