# Impasto — volumetric paint

`/works/laboratory/impasto` now uses a 3D particle solver. The old 2.5D heightfield
implementation has been removed. Start with the small extruded sample, or clear the
board and squeeze new paint. Only the tube creates particles. Brushes and knives
move the existing material; dragging across an empty area does not create paint.

## Source port and scope

The single-fluid PBF pressure iteration and cubic SPH kernel are TypeScript ports
of these MIT-licensed SPlisHSPlasH components:

- [TimeStepPBF.cpp](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/blob/master/SPlisHSPlasH/PBF/TimeStepPBF.cpp): normalized density, clamped density constraint,
  lambda denominator, pressure position corrections, first-order velocity update.
- [SPHKernels.h](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/blob/master/SPlisHSPlasH/SPHKernels.h): cubic kernel and gradient.
- Original copyright and license are preserved in `LICENSE-SPlisHSPlasH`.

This is a port of those numerical components, **not a WebAssembly build of the full
C++ engine**. Boundary maps, adaptive iteration count, multiphase density ratios and
native parallel search were replaced with an analytic board/bounds, four bounded
pressure iterations and a browser spatial hash.

Application extensions:

- Backward-Euler graph viscosity with three Jacobi sweeps (not the full Weiler
  implicit viscosity solver).
- Evolving plastic spring rest lengths, informed by
  [Clavet et al. 2005](https://doi.org/10.2312/SCA/SCA05/219-228). Rest lengths change
  under sufficiently large strain, faster in tool contact; bonds break when stretched.
- Contact footprints for flat, round and fan brushes, rectangular and pointed knives.
  Contact compresses the particles; pressure constraints redistribute them sideways.
  Individual bristle depths modulate the actual contact geometry.
- Adhesion captures a small subset of recently contacted particles. Raising the tool
  pulls these particles and stretches their bonds until detachment. It does not add
  a decorative peak or new paint. Tube emission is the sole mass source.

These are interactive, normalized artistic material controls, not calibrated oil-paint
measurements. Particle number/volume is conserved during spreading; reconstructed
mesh volume is approximate. Pigment colors follow particles and are interpolated at
the surface in linear RGB, not a spectral pigment chemistry model.

## Surface and interaction

A compact-support density field is reconstructed from all XYZ particle positions.
Marching cubes creates a closed 3D mesh, supporting undersides, raised bridges and
separated drops. It uses dynamic world bounds, 90³ desktop / 72³ mobile reconstruction
grids, shadow maps and a rough oil material. Mesh resolution limits the finest real
grooves. A separate, fixed-world bump map preserves sub-particle bristle marks; this
only supplements the physical mesh. It is not the deformation solver.

The bottom dock selects tube / flat brush / round brush / fan brush / broad knife /
pointed knife / orbit. Mouse and touch drag, pen pressure, pointer cancellation,
orbit/zoom, one-step undo/redo, clear, color and material controls are supported.

The solver runs in a dedicated Web Worker with one outstanding simulation step.
Snapshots use transferred buffers; rendering and menus stay on the main thread.
Limits are 3,000 particles desktop / 1,800 mobile and are shown in the menu. At the
limit, extrusion stops and the user can continue spreading or clear the board.
The solver has a bounded settling period and sleeps when at rest. Re-entering and
context-loss recovery dispose/terminate the previous worker and GPU resources.
Work is local and is lost when the page is reloaded.

## Verification

`node --test app/works/laboratory/impasto/core/PaintSolver.test.mjs`

Checks cover extrusion, mass preservation through spreading/lifting, changed height
and footprint, distinct tools, undo/pigment restoration, particle limits and finite
positions under repeated strong contact. Browser checks cover the worker bundle,
mouse/touch controls, rendering, orbit, clear/undo and context recovery.
