# To step on

`/works/laboratory/to-step-on` is a close-up shoe camera study.
Click/tap the floor (or press Enter with the canvas focused) to take a step.
The menu offers four fixed directions or a uniformly random 360-degree heading,
0.5–1.5× speed, pause/resume, and clearing retained footprints.

## Motion and coordinates

- Three.js world units are metres, Y is up, and the shoe's local +Z is its toe.
- The camera sits 0.5 m above the ground, about 7 degrees from a vertical
  downward view. A 16-degree field of view along the shorter viewport edge
  frames roughly 0.14 m of ground, so only part of the 0.32 m shoe fits in
  view even on a tall phone screen.
- A ray/ground-plane intersection determines the sole's landing position.
- One 1.55-second cycle approaches quickly, plants briefly, then accelerates away.
- A black camera-space trouser silhouette tracks the projected shoe collar as
  it enters. A narrow shoulder and shallow hem meet in a single corner near
  the ankle, with only slight folds along the edge. It then sweeps in the step
  direction, briefly covers the view, and reveals the footprint.
- The sole remains fixed during stance. The shoe enters and exits beyond the
  close crop, without a trouser leg or foreground-cloth occlusion.
- A busy cycle retains only the latest pending click, without interrupting the
  current pose. Resize and menu changes do not clear completed footprints.

## Models and future snow integration

The supplied `/shoes.obj` is normalized to a 0.32 m length. `StepModel` provides
a procedural fallback while the OBJ loads or if loading fails. The OBJ's outsole
is projected onto the ground to size and mask `StepPrints`; the existing seeded
SOLE tread is retained inside that measured outline. The source MTL references
no external bitmap, and the OBJ uses portable in-app material colours.

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
