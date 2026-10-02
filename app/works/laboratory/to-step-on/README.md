# To step on

`/works/laboratory/to-step-on` is a close-up shoe camera study.
Click/tap the floor (or press Enter with the canvas focused) to take a step.
The menu offers four fixed directions or non-repeating random directions,
0.5–1.5× speed, pause/resume, and clearing retained footprints.

## Motion and coordinates

- Three.js world units are metres, Y is up, and the shoe's local +Z is its toe.
- The camera sits 0.5 m above the ground, about 7 degrees from a vertical
  downward view. A 16-degree field of view along the shorter viewport edge
  frames roughly 0.14 m of ground, so only part of the 0.32 m shoe fits in
  view even on a tall phone screen.
- A ray/ground-plane intersection determines the sole's landing position.
- One 2.8-second cycle approaches, plants, transfers weight, and lifts away.
- The sole remains fixed during stance. The shoe enters and exits beyond the
  close crop, without a trouser leg or foreground-cloth occlusion.
- A busy cycle retains only the latest pending click, without interrupting the
  current pose. Resize and menu changes do not clear completed footprints.

## Models and future snow integration

`StepModel` generates the shoe upper, sole layers, panels, stitching, eyelets,
and laces. No external GLB or bitmap download is needed.
`StepPrints` reuses the existing SOLE outline and seeded tread generator.

`StepApp` emits one `StepContact` on full sole contact. The callback includes
world position, heading, width, length and pressure. A later snow-impression
implementation can consume that event in place of (or alongside) the current
ground decal. This study does not change FOOT PRINT's screen-space impression
shader.

## Verification

`node scripts/verify-step-on.mjs <temporary-playwright-package.json>` tests
desktop and touch-sized layouts, all four close-cropped directions, retained/cleared
prints, queued input, pause/resume, resize and route cleanup. Set
`VERIFY_BASE_URL` to use a server other than `http://localhost:3000`.
Screenshots and the verification report are written to ignored `artifacts/`.
