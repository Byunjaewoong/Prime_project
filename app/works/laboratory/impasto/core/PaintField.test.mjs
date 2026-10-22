// Run with Node 24: node --test app/works/laboratory/impasto/core/PaintField.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PaintField, DEFAULTS } from './PaintField.ts';

const a = { x: 300, y: 450, pressure: .65 }, b = { x: 680, y: 550, pressure: .65 };
const volume = field => field.data.reduce((sum, value, i) => sum + (i % 4 === 3 ? value : 0), 0);
function paint(settings = DEFAULTS) {
  const field = new PaintField(128);
  field.begin(a, .123); field.stroke(a, b, settings); field.end(); return field;
}

test('viscosity and yield resistance independently reduce displacement under the same brush force', () => {
  const soft = volume(paint({ ...DEFAULTS, viscosity: 0, yield: 0 }));
  const viscous = volume(paint({ ...DEFAULTS, viscosity: 100, yield: 0 }));
  const resistant = volume(paint({ ...DEFAULTS, viscosity: 0, yield: 100 }));
  assert.ok(soft > viscous); assert.ok(soft > resistant);
});

test('unforced high-yield paint retains its shape; yielded relaxation conserves volume', () => {
  const field = paint(); const initial = field.data.slice();
  field.relax({ ...DEFAULTS, yield: 100 }, 1 / 60);
  assert.deepEqual(field.data, initial);
  const before = volume(field);
  for (let i = 0; i < 50; i++) field.relax({ ...DEFAULTS, yield: 0, viscosity: 0 }, 1 / 60);
  assert.ok(Math.abs(volume(field) - before) / before < .000001);
  assert.notDeepEqual(field.data, initial);
  assert.ok(field.data.every(Number.isFinite));
});

test('adhesion leaves a peak, zero adhesion leaves no peak, undo restores the complete layer', () => {
  const field = new PaintField(128), original = field.data.slice();
  field.begin(a, .23); field.stroke(a, b, DEFAULTS);
  const beforeLift = field.data.slice();
  field.lift(b, { ...DEFAULTS, adhesion: 0 }, 1);
  assert.deepEqual(field.data, beforeLift);
  for (let i = 0; i < 12; i++) field.lift(b, DEFAULTS, i / 11);
  assert.ok(field.data.some((value, i) => i % 4 === 3 && value > beforeLift[i]));
  field.end(); field.undo(); assert.deepEqual(field.data, original);
});

test('random study is reproducible per seed and repeated painting remains finite and bounded', () => {
  const first = new PaintField(80), second = new PaintField(80);
  for (const progress of first.generate(42)) assert.ok(progress > 0 && progress <= 1);
  for (const _ of second.generate(42)) void _;
  assert.deepEqual(first.data, second.data);
  for (let i = 0; i < 35; i++) {
    first.begin(a, i / 35); first.stroke(a, b, { ...DEFAULTS, load: 100, viscosity: 0 });
    first.lift(b, { ...DEFAULTS, adhesion: 100 }, 1); first.end();
  }
  assert.ok(first.data.every((v, i) => Number.isFinite(v) && (i % 4 !== 3 || (v >= .2 && v <= 32))));
});
