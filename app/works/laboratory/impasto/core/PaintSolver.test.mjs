// Node 24: node --test app/works/laboratory/impasto/core/PaintSolver.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintSolver, RADIUS, BOUND } from './PaintSolver.ts';

function sample(capacity = 800) {
  const s = new PaintSolver(capacity);
  for (let i = 0; i < 5; i++) s.emit(-.18 + i * .09, 0, 80);
  for (let i = 0; i < 15; i++) s.step();
  return s;
}
const contact = { x: 0, z: 0, dx: .012, dz: 0, angle: Math.PI / 2, pressure: 1, lifting: 0 };
function bounds(s) {
  let height = 0, x0 = Infinity, x1 = -Infinity;
  for (let i = 0; i < s.count; i++) {
    height = Math.max(height, s.positions[i * 3 + 1]);
    x0 = Math.min(x0, s.positions[i * 3]); x1 = Math.max(x1, s.positions[i * 3]);
  }
  return { height, width: x1 - x0 };
}

test('extrusion creates a volume; spreading lowers and widens it without creating paint', () => {
  const s = sample(), count = s.count, before = bounds(s), colors = s.colors.slice();
  assert.ok(before.height > RADIUS * 4);
  s.settings.tool = 'knife'; s.settings.pressure = 95; s.settings.adhesion = 0;
  for (let i = 0; i < 45; i++) s.step(1 / 60, { ...contact, x: i * .012 });
  const after = bounds(s);
  assert.equal(s.count, count); assert.deepEqual(s.colors, colors);
  assert.ok(after.height < before.height * .8, `${after.height} vs ${before.height}`);
  assert.ok(after.width > before.width * 1.2);
  const empty = new PaintSolver(); empty.settings.tool = 'flat'; empty.step(1 / 60, contact); assert.equal(empty.count, 0);
});

test('brush and knife contact shapes produce distinct 3D deformations', () => {
  const shapes = ['flat', 'round', 'fan', 'knife', 'pointed'].map(tool => {
    const s = sample(); s.settings.tool = tool; s.settings.pressure = 85;
    for (let i = 0; i < 22; i++) s.step(1 / 60, { ...contact, x: i * .01 });
    return s.positions;
  });
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) assert.notDeepEqual(shapes[i], shapes[j]);
});

test('a released knife smear retains its flattened body instead of springing back', () => {
  const s = sample();
  const averageHeight = () => s.positions.slice(0, s.count * 3).filter((_, i) => i % 3 === 1).reduce((a, b) => a + b, 0) / s.count;
  const before = averageHeight(), count = s.count;
  s.settings.tool = 'knife';
  for (let i = 0; i < 45; i++) s.step(1 / 60, { ...contact, x: i * .012 });
  for (let i = 1; i <= 15; i++) s.step(1 / 60, { ...contact, x: .54, dx: 0, lifting: i / 15 });
  s.endContact();
  for (let i = 0; i < 60; i++) s.step();
  assert.equal(s.count, count);
  assert.ok(averageHeight() < before * .85, `${averageHeight()} vs ${before}`);
});

test('adhesion lifts existing particles and release does not change mass', () => {
  const heights = [0, 100].map(adhesion => {
    const s = sample(); s.settings.tool = 'flat'; s.settings.pressure = 80; s.settings.adhesion = adhesion;
    for (let i = 0; i < 12; i++) s.step(1 / 60, { ...contact, dx: 0 });
    const count = s.count;
    for (let i = 1; i <= 11; i++) s.step(1 / 60, { ...contact, dx: 0, lifting: i / 15 });
    assert.equal(s.count, count); s.endContact(); return bounds(s).height;
  });
  assert.ok(heights[1] > heights[0] + .02, JSON.stringify(heights));
});

test('undo restores geometry and pigment; emission stops cleanly at capacity', () => {
  const s = sample(450), positions = s.positions.slice(0, s.count * 3), colors = s.colors.slice(0, s.count * 3), count = s.count;
  s.remember(); s.settings.color = '#ff0000'; s.emit(1, 1, 200);
  assert.equal(s.count, 450); s.undo();
  assert.equal(s.count, count); assert.deepEqual(s.positions.slice(0, count * 3), positions); assert.deepEqual(s.colors.slice(0, count * 3), colors);
  s.clear(); assert.equal(s.count, 0); s.undo(); assert.equal(s.count, count);
});

test('repeated force, extreme viscosity and boundary contact stay finite', () => {
  const s = sample(); s.settings.tool = 'pointed'; s.settings.pressure = 100; s.settings.viscosity = 100; s.settings.adhesion = 100;
  for (let i = 0; i < 100; i++) s.step(1 / 60, { ...contact, x: Math.sin(i * .1) * .4, dx: Math.cos(i * .1) * .035, lifting: i > 80 ? (i - 80) / 20 : 0 });
  for (let i = 0; i < s.count; i++) {
    const k = i * 3;
    assert.ok(Number.isFinite(s.positions[k]) && Number.isFinite(s.positions[k + 1]) && Number.isFinite(s.positions[k + 2]));
    assert.ok(s.positions[k + 1] >= RADIUS - 1e-6 && s.positions[k + 1] <= 1.8);
    assert.ok(Math.abs(s.positions[k]) <= BOUND && Math.abs(s.positions[k + 2]) <= BOUND);
  }
});
