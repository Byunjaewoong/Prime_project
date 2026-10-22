# Impasto

`/works/laboratory/impasto` is an interactive oil-paint relief study. The initial white
surface is made from 52 overlapping, curved palette-knife / bristle strokes. Drag with
a mouse, touch or pressure-sensitive pen. Release to pull a tapered paint ridge. The
menu controls tool, pigment, width, load, viscosity, yield resistance, adhesion,
texture, relief, light direction/elevation and oil gloss. It also provides a blank
canvas, random study, one-step undo/redo and a back link. Idle canvases do not redraw.

## Algorithm review and choice

- [SPlisHSPlasH](https://splishsplash.readthedocs.io/en/latest/about.html) provides SPH
  pressure solvers, explicit/implicit viscosity, surface tension and solid coupling.
  It is useful for free 3D fluid motion; viscosity alone does not provide a static
  plastic yield threshold. Our existing browser SPH study has far fewer particles
  than would be needed to resolve fine paint striations across a full-screen canvas.
- [Clavet, Beaudoin & Poulin, 2005](https://doi.org/10.2312/SCA/SCA05/219-228)
  combines particle density relaxation with springs and changing rest lengths for
  viscoelasticity/plasticity, including stretched filaments.
- [Goktekin, Bargteil & O'Brien, 2004](https://cal.cs.umbc.edu/Papers/Goktekin-2004-AMF/)
  describes a grid method with elastic stress and a yield condition.

This implementation is original application code inspired by the distinction between
viscosity, yield and adhesion. **It does not embed SPlisHSPlasH or reproduce either
paper's complete solver.** It chooses a 2.5D heightfield because the reference is a
flat substrate covered in detailed paint. There is one surface height per location,
not an SPH volume or a full constitutive material simulation.

## Paint layer

- Square 1,000-unit material coordinates; 1024² desktop / 640² mobile cells. The
  viewport crops this square with equal X/Y scale, so resize never stretches strokes.
- RGBA float buffer: linear RGB pigment and actual layer height. A swept brush
  footprint depresses/transports old paint and deposits new paint with directional
  bristle channels, irregular rims and pressure-dependent width. Mobility falls as
  viscosity increases. A normalized brush-force threshold gates plastic changes.
- Relaxation exchanges `sign(hi-hj) max(|hi-hj|-yieldThreshold,0) * rate` between
  adjacent cells, using a separate delta buffer. Pairwise flux conserves height sum
  and stops under the threshold. The explicit rate is capped at 0.12 for stability.
  Settling stops at a residual threshold or after a bounded relaxation period.
- Release makes a thinning, forward-moving ridge over twelve frames, suggesting
  brush adhesion, necking and detachment. The final raised tip remains in the height
  layer. This is an artistic adhesion model, not a free-standing liquid bridge.
- Brush deposition/pickup is artistic and not volume conserving; new pigment is
  blended in linear RGB, not spectrally. Relaxation alone conserves layer volume.
  No overhangs, fully detached blobs, material drying or true elastic stress tensor.

## Rendering and lifecycle

Normals come from adjacent stored heights, supplemented by band-limited microscopic
grain. Twenty-four height samples toward the light make self-shadows; multiscale
height comparisons provide cavity shading. Rough oil highlights complete the relief.
This is shaded heightfield rendering, not a flat painted shadow texture.

Generation yields once per stroke and reports progress. Input uses pointer capture,
handles cancellation and bounds its queue. One buffer snapshot supports undo without
an unbounded history. GPU uploads happen only on changes. All textures, geometry,
material, renderer, observers, listeners and animation frames are released on unmount.
A context-loss message offers an explicit canvas restart (unsaved strokes are lost).

## Checks

`node --test app/works/laboratory/impasto/core/PaintField.test.mjs`

Checks cover viscosity/yield response, static shape retention, conservative stable
relaxation, adhesion, undo, seeded generation and repeated-stroke numerical bounds.
