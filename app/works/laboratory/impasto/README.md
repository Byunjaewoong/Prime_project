# Impasto ? layered paint and volumetric material

`/works/laboratory/impasto` starts with a prepared white palette-knife study, generated
from overlapping curved sweeps, flattened faces, asymmetric raised lips, scored grain
and tapered lifted ends. No reference photograph is used as a texture. This is a
**procedural prepared sample**, not a particle simulation at equilibrium. The menu
can regenerate it or clear the board.

## Material representations

The earlier all-particle surface rounded everything into blobs. A spherical density
kernel and a coarse 3D reconstruction cannot retain thin sharp edges economically.

- Thick/free paint uses 3D PBF particles with plastic bonds and viscosity. The tube
  emits particles, which collide with the existing painted substrate.
- Paint yielded onto the substrate uses a 385 �� 385 volume-per-area grid over a
  six-unit board. Pressed particles transfer their volume and pigment into this
  film. The film is meshed directly to preserve narrow knife lips.
- A blade plane flattens contacted film. Removed material moves to side/front banks,
  weighted by where material was actually displaced. There is no repeated trailing
  bank each step. Conservative local flux makes steep banks yield under contact.
  Pressure, viscosity and retention affect deformation rate and allowed bank slope.
- Adhesive pickup extracts quantized material from the film and converts it back
  into particles attached to the lifting tool. Volume and linear-RGB pigment are
  conserved through both transfers. Tools never create paint in empty space.

The film cannot represent an overhang itself; raised/free material uses particles.
This hybrid is an artistic approximation, not a fully resolved 3D non-Newtonian
continuum solver. Mesh volume is approximate. The conserved quantity is film volume
plus the nominal volume of each particle.

## Rendering

Direct relief geometry casts and receives shadows. Local concavity shading reveals
folded edges. Directional procedural micro-normal detail adds scores, dragged pits
and bristle grain below mesh resolution, following stored tool direction with fine
frequency filtering. The material has restrained oil sheen and neutral white color.
Shadow depth range/bias are fitted to the work area. The default camera looks almost
directly down; the study fills portrait and landscape views. Orbit allows inspection
from the side.

## Source port and scope

The particle pressure iteration and cubic kernel are TypeScript ports of these
MIT-licensed SPlisHSPlasH components:

- [TimeStepPBF.cpp](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/blob/master/SPlisHSPlasH/PBF/TimeStepPBF.cpp): density constraint, lambda denominator,
  pressure position corrections and first-order velocity update.
- [SPHKernels.h](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/blob/master/SPlisHSPlasH/SPHKernels.h): cubic kernel and gradient.
- Original copyright and license: `LICENSE-SPlisHSPlasH`.

This is not a WebAssembly build of the full C++ engine. Browser spatial search,
four pressure iterations, analytic substrate contact, backward-Euler graph viscosity
and plastic springs are application implementations. Evolving spring rest lengths
are informed by [Clavet et al. 2005](https://doi.org/10.2312/SCA/SCA05/219-228).
The deposited film and transfer rules are application extensions, not code claimed
to come from SPlisHSPlasH.

## Interaction and limits

The dock selects tube, flat/round/fan brushes, broad/pointed knives and orbit. Mouse,
touch, pen pressure, undo/redo, clear, prepared background, color, material controls
and camera reset are supported. The tube adds new material; prepared-background
intentionally replaces the material with a fresh sample. Colors mix in linear RGB,
not a spectral pigment chemistry model.

Both solvers run in one Web Worker with at most one outstanding step. Film snapshots
are transferred only when dirty. Empty particle reconstruction is skipped. Limits
are 3,000 free particles desktop / 1,800 mobile; deposition frees particle capacity.
The board is finite. Work is local and lost on reload. Context recovery starts a
fresh prepared sample.

## Verification

`node --test app/works/laboratory/impasto/core/PaintSolver.test.mjs app/works/laboratory/impasto/core/PaintFilm.test.mjs`

Tests cover tool deformation/release, volume and pigment conservation across the
representations, bank stability at board edges, empty strokes, deterministic sample,
undo, finite positions and particle capacity. Browser checks cover the reference
view, extrusion/spreading, mouse/touch, color, orbit, undo/clear, menu fit, worker
loading and context-loss recovery.
