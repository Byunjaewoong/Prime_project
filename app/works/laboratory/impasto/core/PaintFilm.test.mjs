import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintFilm } from './PaintFilm.ts';
import { PaintSolver, DEFAULTS, PARTICLE_VOLUME } from './PaintSolver.ts';
const contact = { x: 0, z: 0, dx: .02, dz: 0, angle: Math.PI / 2, pressure: 1, lifting: 0 };

test('knife displaces existing film into banks and conserves volume, including board edges', () => {
  const film = new PaintFilm(); film.prepare(); const volume = film.volume();
  const center = film.sample(0, 0);
  for (let i = 0; i < 50; i++) film.contact({ ...contact, x: i * .035 }, DEFAULTS);
  assert.ok(film.sample(0, 0) < center);
  for (let i = 0; i < 30; i++) film.contact({ ...contact, x: 2.8, z: 2.5 + i * .015 }, DEFAULTS);
  assert.ok(Math.abs(film.volume() - volume) < 1e-6, `${film.volume()} vs ${volume}`);
  assert.ok(film.height.every(h => Number.isFinite(h) && h >= 0));
  assert.ok(film.height.reduce((a, b) => Math.max(a, b), 0) < 1, 'bank heights remain bounded');
});
test('empty film stays empty under all tools, even on release', () => {
  const film = new PaintFilm();
  for (const tool of ['flat', 'round', 'fan', 'knife', 'pointed']) film.contact(contact, { ...DEFAULTS, tool });
  assert.equal(film.volume(), 0); assert.equal(film.extract(0, 0, .001, PARTICLE_VOLUME).volume, 0);
});
test('particle deposition and adhesive pickup conserve combined material and pigment', () => {
  const film = new PaintFilm(), solver = new PaintSolver(400); solver.substrate = (x, z) => film.sample(x, z);
  solver.settings.color = '#ae533d'; solver.emit(0, 0, 150); const volume = solver.count * PARTICLE_VOLUME;
  for (let i = 0; i < 20; i++) {
    solver.step(1 / 60, contact);
    solver.depositContact((x, z, v, color) => film.deposit(x, z, v, color));
    film.contact(contact, DEFAULTS);
  }
  assert.ok(film.volume() > 0); assert.ok(solver.count < 150);
  assert.ok(Math.abs(film.volume() + solver.count * PARTICLE_VOLUME - volume) < 1e-7);
  const pickup = film.extract(0, 0, 3 * PARTICLE_VOLUME, PARTICLE_VOLUME);
  assert.ok(pickup.volume > 0); assert.ok(pickup.color[0] > pickup.color[1]);
  solver.pickUp(contact, pickup.color, Math.round(pickup.volume / PARTICLE_VOLUME));
  assert.ok(Math.abs(film.volume() + solver.count * PARTICLE_VOLUME - volume) < 1e-7);
});
test('prepared relief is deterministic; clear and undo restore height, pigment and grain', () => {
  const film = new PaintFilm(); film.prepare(17); const before = film.snapshot();
  film.prepare(17); assert.deepEqual(film.height, before.height);
  film.clear(); assert.equal(film.volume(), 0); film.undo();
  assert.deepEqual(film.height, before.height); assert.deepEqual(film.color, before.color); assert.deepEqual(film.grain, before.grain);
  film.prepare(94); assert.notDeepEqual(film.height, before.height);
});
