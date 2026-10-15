import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve(process.argv[2]));
const { chromium } = require('playwright');
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
await fs.mkdir('artifacts/nonflowers-butterfly', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Capture the real instance without adding a production debug global.
  await page.addInitScript(() => {
    let factory;
    Object.defineProperty(window, 'createButterflyGarden', {
      get: () => factory,
      set: value => { factory = canvas => (window.testGarden = value(canvas)); },
    });
  });
  const ready = () => page.waitForFunction(() => document.querySelector('#meadow').getAttribute('aria-busy') === 'false' && document.querySelector('#status').hidden);
  await page.goto(`${base}/nonflowers/index.html?mode=mixed&seed=12345`);
  await ready();
  assert(Number(await page.locator('#butterflies').getAttribute('data-targets')) > 0, 'Original flowers must expose painted petal targets');
  const prng = await page.evaluate(() => Prng.s);
  await page.mouse.click(75, 110);
  await page.waitForFunction(() => window.testGarden.snapshot().length === 1);
  await page.evaluate(() => {
    window.flightSamples = [];
    const sample = () => {
      const [b] = window.testGarden.snapshot();
      if (!b || b.state !== 'flying') return;
      window.flightSamples.push({ ...b, now: performance.now() });
      requestAnimationFrame(sample);
    };
    sample();
  });
  const route = [];
  for (let i = 0; i < 60; i++) {
    const [b] = await page.evaluate(() => window.testGarden.snapshot());
    route.push(b);
    if (i === 5) await page.screenshot({ path: 'artifacts/nonflowers-butterfly/flight.png' });
    if (b.state === 'perched') break;
    await page.waitForTimeout(200);
  }
  const start = route[0], end = route.at(-1), dx = end.target.x - start.x, dy = end.target.y - start.y;
  assert.equal(end.state, 'perched');
  assert(Math.hypot(end.x - end.target.x, end.y - end.target.y) < .1, 'Feet must reach the selected petal');
  const deviation = Math.max(...route.map(b => Math.abs(dy * (b.x - start.x) - dx * (b.y - start.y)) / Math.max(1, Math.hypot(dx, dy))));
  assert(deviation > 10, `Flight path was too straight: ${deviation}`);
  const samples = await page.evaluate(() => window.flightSamples);
  let turning = 0, foldedTurning = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const yaw = Math.abs(Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle)));
    turning += yaw;
    if (Math.min(a.wing, b.wing) < .5) foldedTurning += yaw;
  }
  assert(turning > .2 && foldedTurning / turning > .95, 'Direction changes must coincide with folded wings');
  const early = samples.find(b => b.now - samples[0].now >= 800);
  const wingbeatsPerSecond = (early.phase - samples[0].phase) / (Math.PI * 2) / ((early.now - samples[0].now) / 1000);
  assert(wingbeatsPerSecond > 1.5 && wingbeatsPerSecond < 4.3, `Unexpected wingbeat speed: ${wingbeatsPerSecond}`);
  const wings = [];
  let rest;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(200);
    [rest] = await page.evaluate(() => window.testGarden.snapshot());
    wings.push(rest.wing);
  }
  assert(Math.max(...wings) - Math.min(...wings) > .05, 'Perched wings must keep moving');
  assert.equal(rest.x, end.x); assert.equal(rest.y, end.y);
  assert.equal(await page.evaluate(() => Prng.s), prng, 'Animation must not consume flower randomness');
  await page.waitForFunction(() => window.testGarden.snapshot()[0].wing > .6);
  await page.screenshot({ path: 'artifacts/nonflowers-butterfly/perched.png' });
  await page.screenshot({ path: 'artifacts/nonflowers-butterfly/wing-detail.png', clip: {
    x: Math.max(0, Math.min(780, end.x - 60)), y: Math.max(0, Math.min(680, end.y - 60)), width: 120, height: 120 } });
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  assert.equal(await page.locator('#butterflies').getAttribute('data-count'), '1');
  await page.locator('#mixed-regenerate').click();
  await ready();
  assert.equal(await page.locator('#butterflies').getAttribute('data-count'), '0', 'New scene must clear old landing locations');
  await page.goto(`${base}/nonflowers/index.html?mode=pattern&seed=12345`);
  await ready();
  const patternTargets = Number(await page.locator('#butterflies').getAttribute('data-targets'));
  assert(patternTargets > 100, 'Rotated pattern flowers must expose visible landing sites');
  await page.mouse.click(150, 180);
  await page.waitForFunction(() => document.querySelector('#butterflies').dataset.perched === '1', null, { timeout: 16000 });
  await page.screenshot({ path: 'artifacts/nonflowers-butterfly/pattern-perched.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#meadow');
    return canvas.getAttribute('aria-busy') === 'false' &&
      Math.abs(canvas.width / canvas.height - 390 / 844) < .001;
  });
  assert.equal(await page.locator('#butterflies').getAttribute('data-count'), '0');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ deviation, wingbeatsPerSecond, foldedTurnRatio: foldedTurning / turning, patternTargets, originalLanding: end.target, errors }));
} finally { await browser.close(); }
