# CLAUDE.md

## Commands

- npm ci: install locked dependencies (Node.js 24)
- npm run dev: development server, localhost:3000
- npm run lint -- --max-warnings=0: lint
- npm run build: production build (downloads Courier Prime from Google Fonts)
- npm run typecheck: TypeScript validation
- npm start: production server
- npm audit: dependency security check with network access

## Architecture

Prime is an interactive creative coding portfolio. app/page.tsx is Work Archives; app/works/laboratory/page.tsx links experimental works.

Each work follows page.tsx (UI), CanvasApp.tsx (React mount/cleanup), core/App.ts (rendering). Keep renderer instances in refs when controls mutate them. Register and remove the same event handler reference. Cancel animation frames and timers on unmount; dispose graphics resources and guard asynchronous model callbacks after destruction.

Canvas 2D: Geo-centr, Helio-centr, ASCII-Donut, Perlin-noise, Fluid.
Three.js: Snow-walker (GLTFLoader, SVGLoader, footprints), weatherProject (FBXLoader, mixers, EffectComposer, ShaderPass).
Snow-walker: core/FieldStyles.ts defines snow/green/gold presets, separate seeded seamless green/dry-grass textures and VEGETATION_SHADER. Smooth domain warping and overlapping rotated/scaled samples reduce repetition; broad color patches live outside the texture tiles. Keep color and bump sampling aligned. Left click/tap cycles fields; canvas contextmenu plants a tree. Blend the cached ground material, texture samples, lighting, fog and footprint colors without resetting the player, mixer, path, footprints or existing trees. Keep the camera fixed. Dispose skeletons, both grass shader textures and renderer resources on unmount. Do not force context loss during effect cleanup: React Strict Mode reuses the same canvas for setup/cleanup/setup.
Emergence: Lenia, Boids, GrayScott, Physarum implementations in core/.
Vortex: original CPU solver with reference swaps, a CPU reference dye field, and GPU high-resolution dye presentation in core/DyeRenderer.ts. core/resolution.ts caps the physics domain to a 1920px reference long edge, scales pointer displacement, and budgets output to 4K pixels. Canvas 2D handles input/vector overlay and is also the fallback when GPU dye is unavailable. Keep the original tone curve and the reference-field correction when changing the presentation layer. Vortex_GPU: independent WebGL2 shader solver in core/FluidGL.ts; explicitly release FBOs on resize and destruction.

app/lib/disposeObject.ts releases Three.js scene geometry, materials, textures and shadow resources.
Shared layout, slide panels and FAB controls are in app/globals.css. Preserve case-sensitive route names for Linux deployment.
public/ holds GLB/FBX models, textures, SVGs and audio. Some tree models are approximately 20 MB; consider loading cost when changing 3D works.

## Tooling and validation

Next.js 16, React 19, Three.js 0.181, Tailwind CSS 4, TypeScript 5, ESLint 9. Inspect package-lock.json for exact installed versions. @/* maps to the project root.
The app uses Courier Prime through next/font/google. Google Fonts access is required for a fresh build.
There is no unit test suite. GitHub Actions runs lint, build and typecheck. scripts/verify-browser.mjs exercises the ten works in desktop/mobile Chrome; screenshot artifacts are ignored by Git.

## Repository

origin: https://github.com/Byunjaewoong/Prime_project.git
backup-260914 preserves the pre-maintenance commit 405495f. It includes tracked files only.
backup-260914-before-vortex-4k preserves 58afedf before the Vortex display changes; vortex-4k-260914 is the implementation branch integrated into main. Vortex defaults to Vorticity 6.0 in both the solver and UI. Verification scripts compare the solver exactly and run deterministic 1080p/4K/mobile screenshots against this backup using matching Vorticity settings.
Avoid committing .env, dependency folders, generated build output or browser screenshots.
backup-260914-before-snow-fields preserves f19b283; snow-fields-260914 is integrated into main, and backup-260914-snow-fields-complete preserves the completed version. scripts/verify-snow-fields.mjs runs state-identity, repeated-switching, tree, cleanup and desktop/mobile React-page checks with a temporary Playwright installation and VERIFY_BASE_URL (default localhost:3000).
Snow-walker uses FogExp2 with density 0.035 for snow and 0.0175 for green/gold grass. Green/gold fog matches a pale field-colored background. Ground smog and its checkbox were removed.
Snow-walker core/CameraFilter.ts applies Vortex_GPU's display treatment to a captured camera image. Haze, film grain, vignette and tone curve/lifted blacks have independent uniforms and M-menu checkboxes; only tone is enabled by default. Only green/gold fields use them; if all four are off, skip the capture/filter pass. Toggling must not recreate App or affect walking state. Preallocate the drawing-buffer-sized render target and compile the display shader during idle time in the initial Snow view so the first Green transition does not pay that cost. Resize the prepared target with the renderer, and cancel pending warmup work on cleanup. Convert the linear image to display color before applying enabled effects, and dispose both the separate filter scene and render target on cleanup.
