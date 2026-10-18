import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await fs.readFile('app/works/laboratory/tennis/tennisPhysics.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const physics = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const { newBall, launchShot, advanceBall, newScore, awardPoint, pointLabels } = physics;
function flight(top, side = 0, serve = false) {
  const ball = newBall(); ball.p = { x: serve ? 1.6 : 0, y: serve ? 2.45 : .9, z: serve ? 12.25 : 9 };
  launchShot(ball, serve ? -2 : 2.4, serve ? -4.5 : -9, .7, top, side);
  let highest = ball.p.y;
  for (let i = 0; i < 1000; i++) {
    const event = advanceBall(ball, 1 / 120); highest = Math.max(highest, ball.p.y);
    assert.notEqual(event, 'net', 'An assisted, centered shot must clear the net');
    if (event === 'bounce') return { ball, highest };
  }
  assert.fail('Ball never landed');
}
for (const top of [-1, 0, 1]) for (const side of [-1, 0, 1]) {
  const { ball } = flight(top, side);
  assert(ball.p.z < -8 && ball.p.z > -10 && ball.p.x > 1.8 && ball.p.x < 3, 'Shot should reach its target');
}
const serve = flight(.4, 0, true).ball;
assert(serve.p.x < 0 && serve.p.z < 0 && serve.p.z > -6.4, 'Serve should land in diagonal service box');
assert(flight(1).ball.v.y > flight(-1).ball.v.y, 'Topspin should kick higher after bouncing');
const score = newScore();
for (let i = 0; i < 3; i++) { awardPoint(score, 0); awardPoint(score, 1); }
assert.deepEqual(pointLabels(score), ['40', '40']); awardPoint(score, 0);
assert.deepEqual(pointLabels(score), ['AD', '40']); awardPoint(score, 1);
assert.deepEqual(pointLabels(score), ['40', '40']); awardPoint(score, 0); awardPoint(score, 0);
assert.deepEqual(score.games, [1, 0]);
for (let i = 0; i < 8; i++) awardPoint(score, 0);
assert.equal(score.winner, 0);
console.log('Physics: target landing, net clearance, serve box, spin bounce, deuce and match scoring passed.');

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await fs.mkdir('artifacts/tennis', { recursive: true });
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error' && /THREE|WebGL|shader/i.test(msg.text())) errors.push(msg.text()); });
  await page.goto(`${base}/works/laboratory/tennis`);
  await page.getByRole('button', { name: 'Enter court' }).waitFor();
  await page.screenshot({ path: 'artifacts/tennis/intro.png' });
  await page.getByRole('button', { name: 'Enter court' }).click();
  const game = () => page.locator('canvas').evaluate(c => JSON.parse(c.dataset.game));
  assert.equal((await game()).phase, 'serve');
  await page.screenshot({ path: 'artifacts/tennis/desktop.png' });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.game).phase === 'rally');
  await page.keyboard.down('KeyA'); await page.waitForTimeout(650); await page.keyboard.up('KeyA');
  assert((await game()).player[0] < 1, 'WASD should move the lower player');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const paused = await game(); assert(paused.paused);
  await page.getByLabel('OPPONENT').selectOption('Easy');
  await page.waitForTimeout(300);
  assert.deepEqual((await game()).ball, paused.ball, 'Menu must pause the ball');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await page.keyboard.press('KeyP'); assert((await game()).paused);
  await page.getByRole('button', { name: 'Resume' }).click();
  // Follow incoming balls using real WASD input. Only swing when they arrive.
  let returns = 0, aiReturned = false, swingAt = 0, frame = 0;
  const held = new Set();
  const control = async keys => {
    for (const key of held) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
  };
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && returns < 2) {
    const g = await game();
    if (g.phase === 'serve') { await control([]); await page.keyboard.press('Space'); }
    if (g.phase === 'rally') {
      if (g.lastHitter === 1) aiReturned = true;
      if (g.lastHitter === 0 && g.rally >= 2) returns = Math.max(returns, Math.floor(g.rally / 2));
      let tx = 0, tz = 10;
      if (g.lastHitter === 1) {
        const b = { p: { ...g.ball }, v: { ...g.velocity }, top: g.top, side: g.side };
        for (let i = 0; i < 300; i++) {
          const event = advanceBall(b, 1 / 120);
          if (b.p.z > 1.5 && b.p.y < 1.2 && b.v.y < 0) break;
          if (event === 'net') break;
        }
        tx = b.p.x; tz = b.p.z;
      }
      const keys = [];
      if (tx - g.player[0] > .35) keys.push('KeyD'); if (tx - g.player[0] < -.35) keys.push('KeyA');
      if (tz - g.player[2] > .35) keys.push('KeyS'); if (tz - g.player[2] < -.35) keys.push('KeyW');
      await control(keys);
      if (g.lastHitter === 1 && g.ball.y < 2.1 && Math.hypot(g.ball.x - g.player[0], g.ball.z - g.player[2]) < 1.8 && Date.now() - swingAt > 280) {
        swingAt = Date.now();
        const down = frame++ % 2 === 0;
        await page.mouse.move(1000, down ? 300 : 450); await page.waitForTimeout(20);
        await page.mouse.move(1000, down ? 450 : 300, { steps: 5 });
      }
    } else await control([]);
    await page.waitForTimeout(35);
  }
  await control([]);
  assert(aiReturned, 'Computer should return the serve');
  assert(returns >= 1, 'Timed mouse motion should return a ball and sustain a rally');
  await page.screenshot({ path: 'artifacts/tennis/rally.png' });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'New match' }).click();
  assert.equal((await game()).phase, 'serve');
  await page.keyboard.press('Escape'); await page.getByRole('link', { name: 'Laboratory' }).click();
  await page.getByRole('link', { name: /17. Tennis/ }).click();
  await page.getByRole('button', { name: 'Enter court' }).click();
  assert.equal(await page.locator('canvas').count(), 1, 'Remount should retain a single renderer');
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  mobile.on('pageerror', e => errors.push(e.message));
  await mobile.goto(`${base}/works/laboratory/tennis`);
  await mobile.getByRole('button', { name: 'Enter court' }).click();
  await mobile.screenshot({ path: 'artifacts/tennis/mobile.png' });
  await mobile.getByRole('button', { name: /YOUR SERVE/ }).click();
  await mobile.getByRole('group', { name: 'Movement pad' }).waitFor();
  const pad = mobile.getByRole('group', { name: 'Movement pad' });
  const rect = await pad.boundingBox();
  const beforeMove = JSON.parse(await mobile.locator('canvas').getAttribute('data-game')).player[0];
  const touch = await mobile.context().newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width - 4, y: rect.y + rect.height / 2, id: 4 }] });
  await mobile.waitForTimeout(450);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(JSON.parse(await mobile.locator('canvas').getAttribute('data-game')).player[0] > beforeMove, 'Mobile pad should move player');
  await mobile.getByRole('button', { name: 'Open menu' }).click();
  await mobile.screenshot({ path: 'artifacts/tennis/mobile-menu.png' });
  await mobile.getByRole('button', { name: 'New match' }).click();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 580, id: 5 }] });
  for (let y = 560; y >= 480; y -= 20) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300, y, id: 5 }] });
    await mobile.waitForTimeout(16);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(JSON.parse(await mobile.locator('canvas').getAttribute('data-game')).phase, 'rally', 'A real mobile swipe should serve');
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.waitForTimeout(200);
  await mobile.screenshot({ path: 'artifacts/tennis/mobile-landscape.png' });
  assert.deepEqual(errors, []);
  console.log(`Browser: desktop court, keyboard, pause, AI return, ${returns} human returns, menu, restart, remount, mobile pad passed.`);
} finally { await browser.close(); }
