# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev    # Start development server at localhost:3000
npm run build  # Build for production
npm run lint   # Run ESLint
npm start      # Start production server
```

There is no test suite in this project.

## Architecture

This is a Next.js creative coding portfolio called "Prime" — a collection of interactive 2D/3D visualizations accessible via the main "Work Archives" page.

### App Router Structure

The root page (`app/page.tsx`) lists all works as links. Each work lives under `app/works/[project-name]/` and follows a consistent three-layer pattern:

| File | Role |
|---|---|
| `page.tsx` | Next.js page — React UI (controls, panels, buttons) |
| `CanvasApp.tsx` | React component that mounts/unmounts the canvas and bridges React ↔ core |
| `core/App.ts` | Vanilla TypeScript class — all rendering logic lives here |

This separation keeps framework concerns (React state, lifecycle) out of the rendering code.

### Technology by Visualization Type

- **2D (Canvas API):** orbit, orbit2, donut, perlin_noise, snow_walk, Fluid
- **3D (Three.js):** weatherProject — uses GLTFLoader (`.glb`), FBXLoader (`.fbx`), AnimationMixer, EffectComposer for post-processing

### Shared UI Patterns (defined in `app/globals.css`)

- `.full-canvas-page` / `.orbit-canvas` — full-screen canvas layout
- `.orbit-side-panel` — left slide-out info panel (appears on hover near left edge)
- `.orbit-fab*` — Floating Action Button menu (bottom-right corner)
- Control panel styles for real-time parameter adjustment

### Public Assets

3D models and textures are served from `public/`:
- `.glb` files — island/environment models (loaded via GLTFLoader)
- `.fbx` files in `public/people/` — character animation models (loaded via FBXLoader)
- `.jpg` files — material textures
- `.svg` files — UI graphics

### Key Dependencies

- **Three.js 0.181** — 3D rendering
- **postprocessing 6.38** — Three.js post-processing effects (FilmPass, ShaderPass, EffectComposer)
- **simplex-noise 4** — procedural noise for 2D works
- **framer-motion 12** — UI animations
- **Tailwind CSS 4** — utility styling

### Path Alias

`@/*` resolves to the project root (configured in `tsconfig.json`).
