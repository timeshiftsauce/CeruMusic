# Technology Stack

## Core Technologies
- **Electron**: Desktop app framework (v37.2.3)
- **Vue 3**: Frontend framework with Composition API (v3.5.17)
- **TypeScript**: Primary language for type safety
- **Vite**: Build tool and dev server via electron-vite
- **PNPM**: Package manager (preferred over npm/yarn)

## UI Framework
- **TDesign Vue Next**: Primary UI component library (v1.15.2)
- **SCSS**: Styling preprocessor
- **Auto-import**: Automatic component and composable imports

## State Management & Routing
- **Pinia**: State management (v3.0.3)
- **Vue Router**: Client-side routing (v4.5.1)

## Development Tools
- **ESLint**: Code linting with Electron Toolkit configs
- **Prettier**: Code formatting
- **Vue TSC**: Vue TypeScript checking

## Common Commands

### Development
```bash
pnpm dev          # Start development server
pnpm start        # Preview built app
```

### Code Quality
```bash
pnpm lint         # Run ESLint
pnpm format       # Format code with Prettier
pnpm typecheck    # Run TypeScript checks
```

### Building
```bash
pnpm build        # Build for current platform
pnpm build:win    # Build for Windows
pnpm build:mac    # Build for macOS
pnpm build:linux  # Build for Linux
pnpm build:unpack # Build without packaging
```

## Build System
- **electron-vite**: Vite-based build system for Electron
- **electron-builder**: Application packaging and distribution
- Separate TypeScript configs for Node.js and web contexts
- Auto-updating via electron-updater