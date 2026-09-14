import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const baseline = process.argv[2] ?? '58afedfe1080d53b964bc6cacbb6ffc5fc89c27b';
const require = createRequire(import.meta.url);
function load(source) {
  const exports = {};
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', compiled)(exports, require);
  return exports;
}
const original = load(execFileSync('git', ['show', `${baseline}:app/works/Vortex/core/FluidSolver.ts`], { encoding: 'utf8' })).FluidSolver;
const updated = load(fs.readFileSync('app/works/Vortex/core/FluidSolver.ts', 'utf8')).FluidSolver;
const { vortexResolution } = load(fs.readFileSync('app/works/Vortex/core/resolution.ts', 'utf8'));
const fields = ['u', 'v', 'u0', 'v0', 'dR', 'dG', 'dB', 'dR0', 'dG0', 'dB0'];
for (const [w, h] of [[31, 23], [64, 113], [255, 144]]) {
  const a = new original(w, h), b = new updated(w, h);
  // Compare algorithms with the same setting, even when defaults change.
  a.vorticityEps = b.vorticityEps;
  for (let frame = 0; frame < 120; frame++) {
    if (frame < 70) {
      const x = 1 + Math.floor((w - 2) * (0.5 + Math.sin(frame * 0.13) * 0.35));
      const y = 1 + Math.floor((h - 2) * (0.5 + Math.cos(frame * 0.19) * 0.35));
      for (const solver of [a, b]) {
        solver.addVelocity(x, y, Math.sin(frame) * 0.15, Math.cos(frame) * 0.15, 4);
        solver.addDye(x, y, 4, 2, 1, 3);
      }
    }
    if (frame === 80) { a.reset(); b.reset(); }
    if (frame === 90) {
      for (const solver of [a, b]) { solver.diffusion = 0; solver.velocityDecay = 1; solver.vorticityEps = 0; solver.dyeDecay = 0.99; }
    }
    a.step(); b.step();
    for (const field of fields) assert.deepEqual(b[field], a[field], `${w}x${h} frame ${frame} ${field}`);
  }
  console.log(`${w}x${h}: all fields match the original exactly for 120 steps`);
}
const hd = vortexResolution(1920, 1080, 1), uhd = vortexResolution(3840, 2160, 1);
assert.equal(uhd.gridW, hd.gridW);
assert.equal(uhd.gridH, hd.gridH);
assert.equal(uhd.inputScale, hd.inputScale / 2);
assert.equal(uhd.outputW, 3840);
assert.equal(uhd.outputH, 2160);
const retina = vortexResolution(1920, 1080, 2);
assert.equal(retina.gridW, hd.gridW);
assert.equal(retina.outputW, 3840);
console.log('1080p, 4K and Retina: simulation size remains stable; output reaches 4K');
