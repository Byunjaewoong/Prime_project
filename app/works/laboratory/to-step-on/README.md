# To step on

`/works/laboratory/to-step-on` is a single-foot, waist-height camera study.
Click/tap the floor (or press Enter with the canvas focused) to take a step.
The menu offers four fixed directions or non-repeating random directions,
0.5–1.5× speed, pause/resume, and clearing retained footprints.

## Motion and coordinates

- Three.js world units are metres, Y is up, and the shoe's local +Z is its toe.
- A ray/ground-plane intersection determines the sole's landing position.
- One 2.8-second cycle approaches, plants, transfers weight, and lifts away.
- The sole remains fixed during stance; the knee and hip continue moving.
- A curved, fabric-shaded foreground mesh crosses camera space in the same
  screen direction. Its portrait/landscape coverage is calculated from the
  camera frustum. It is staged close-up geometry, not a whole-body simulation.
- A busy cycle retains only the latest pending click, without interrupting the
  current pose. Resize and menu changes do not clear completed footprints.

## Models and future snow integration

`StepModel` generates the shoe upper, sole layers, panels, stitching, eyelets,
laces and deforming trouser leg. No external GLB or bitmap download is needed.
`StepPrints` reuses the existing SOLE outline and seeded tread generator.

`StepApp` emits one `StepContact` on full sole contact, before foreground
occlusion. The callback includes world position, heading, width, length and
pressure. A later snow-impression implementation can consume that event in
place of (or alongside) the current ground decal. FOOT PRINT's existing
screen-space impression shader has not been changed by this study.

## Verification

`node scripts/verify-step-on.mjs <temporary-playwright-package.json>` tests
desktop and touch-sized layouts, all four full occlusions, retained/cleared
prints, queued input, pause/resume, resize and route cleanup. Set
`VERIFY_BASE_URL` to use a server other than `http://localhost:3000`.
Screenshots and the verification report are written to ignored `artifacts/`.
