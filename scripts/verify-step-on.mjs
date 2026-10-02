import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

// Use a temporary Playwright installation, like verify-browser.mjs.
const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('artifacts/to-step-on');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const reports = [];

async function pixels(page, name, viewport) {
  const png = await page.screenshot({ path: path.join(output, `${name}.png`) });
  // Exclude floating controls and the development badge from visual assertions.
  const { data, info } = await sharp(png).extract({ left: 8, top: 8, width: viewport.width - 16, height: viewport.height - 96 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let dark = 0, ink = 0;
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (value < 30) dark++;
    if (value < 245) {
      ink++;
      const pixel = i / info.channels, x = pixel % info.width, y = Math.floor(pixel / info.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { dark: dark / (info.width * info.height), ink: ink / (info.width * info.height), span: Math.max(0, maxX - minX + 1, maxY - minY + 1) };
}

try {
  for (const mobile of [false, true]) {
    const name = mobile ? 'mobile' : 'desktop';
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/works/laboratory/to-step-on`, { waitUntil: 'networkidle' });
    await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-02T12:00:01Z'));
    const menu = () => page.getByRole('button', { name: 'Open menu', exact: true }).click();
    const close = async () => {
      await page.getByRole('button', { name: 'Close menu', exact: true }).click();
      await page.clock.runFor(32);
    };
    const tap = (x, y) => mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
    const directions = ['Left → Right', 'Right → Left', 'Top → Bottom', 'Bottom → Top'];
    const closeups = [];
    for (const [index, direction] of directions.entries()) {
      await menu();
      await page.getByRole('button', { name: 'Clear footprints', exact: true }).click();
      await page.getByRole('button', { name: direction, exact: true }).click();
      await close();
      const clean = await pixels(page, `${name}-${index}-clean`, viewport);
      assert(clean.ink < 0.001, 'Changing controls must not trigger a step');
      await tap(viewport.width * 0.52, viewport.height * 0.54);
      await page.clock.runFor(1100);
      const planted = await pixels(page, `${name}-${index}-plant`, viewport);
      assert(planted.ink > 0.08 && planted.dark < 0.98, 'A close-cropped shoe must land');
      assert(planted.span > Math.min(viewport.width, viewport.height - 96) * 0.85, 'The shoe must extend beyond the close crop');
      await page.clock.runFor(750);
      const moving = await pixels(page, `${name}-${index}-moving`, viewport);
      assert(moving.dark < 0.98, `No foreground cloth may cover the view for ${direction}`);
      closeups.push(planted.ink);
      await page.clock.runFor(1250);
      const print = await pixels(page, `${name}-${index}-trace`, viewport);
      assert(print.ink > 0.005 && print.ink < 0.9 && print.dark < 0.001, 'Only the close-up footprint should remain');
      assert(print.span > Math.min(viewport.width, viewport.height) * 0.65, 'The close crop must leave a large footprint');
      await page.clock.runFor(2000);
      const retained = await pixels(page, `${name}-${index}-retained`, viewport);
      assert(Math.abs(retained.ink - print.ink) < 0.00001, 'Footprint must persist without an active animation');
    }
    // One pending click replaces earlier pending clicks; it must not interrupt a plant.
    await tap(viewport.width * 0.3, viewport.height * 0.6);
    await page.clock.runFor(600);
    await tap(viewport.width * 0.7, viewport.height * 0.4);
    await page.clock.runFor(300);
    await menu();
    await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
    await close();
    const paused = await pixels(page, `${name}-pause`, viewport);
    await page.clock.runFor(1500);
    const still = await pixels(page, `${name}-paused-later`, viewport);
    assert.equal(still.ink, paused.ink, 'Pause must retain the pose');
    await menu(); await page.getByRole('button', { name: 'Resume motion', exact: true }).click(); await close();
    await page.clock.runFor(6100);
    await pixels(page, `${name}-queued-complete`, viewport);
    await menu(); await page.getByRole('button', { name: 'Clear footprints', exact: true }).click(); await close();
    const cleared = await pixels(page, `${name}-cleared`, viewport);
    assert(cleared.ink < 0.001, 'Clear must remove all completed footprints');
    await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 980, height: 720 });
    await page.clock.runFor(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await menu(); await page.getByRole('link', { name: 'Laboratory', exact: true }).click();
    await page.getByRole('link', { name: /16\. To step on/ }).waitFor();
    assert.deepEqual(errors, []);
    reports.push({ viewport: name, closeups, errors, passed: true });
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
