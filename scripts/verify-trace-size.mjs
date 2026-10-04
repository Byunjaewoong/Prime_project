import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('artifacts/trace');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/works/laboratory/trace`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('canvas[data-sole-outline]')?.getAttribute('data-sole-outline') === 'model');

    const canvas = page.locator('canvas[data-print-count]');
    const scale = page.getByRole('slider', { name: 'Shoe and footprint size' });
    const menu = () => page.getByRole('button', { name: 'Open menu' }).click();
    const close = () => page.getByRole('button', { name: 'Close menu' }).click();
    const tap = () => mobile ? page.touchscreen.tap(viewport.width / 2, viewport.height / 2)
      : page.mouse.click(viewport.width / 2, viewport.height / 2);
    const printWidth = () => canvas.evaluate(element => {
      const gl = element.getContext('webgl2');
      const pixels = new Uint8Array(element.width * element.height * 4);
      gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let left = element.width, right = -1;
      for (let y = 0; y < element.height; y++) for (let x = 0; x < element.width; x++) {
        if (pixels[(y * element.width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x); right = Math.max(right, x);
      }
      return right - left + 1;
    });

    await menu();
    await page.getByRole('button', { name: /Top.*Bottom/ }).click();
    await scale.fill('0.4');
    await close();
    await tap();
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-size-040-contact.png`) });
    await page.waitForTimeout(1600);
    const small = await printWidth();
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-size-040.png`) });

    await menu();
    await scale.fill('0.6');
    assert.equal(await canvas.getAttribute('data-print-count'), '1', 'Changing size must retain existing impressions');
    await page.getByRole('button', { name: 'Clear footprints' }).click();
    await close();
    await tap();
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-size-060-contact.png`) });
    await page.waitForTimeout(1600);
    const large = await printWidth();
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-size-060.png`) });

    assert(small > 30 && large > small, 'The larger shoe must leave a larger impression');
    const ratio = large / small;
    assert(Math.abs(ratio - 1.5) < 0.12, `Projected sole width should scale 1.5x, got ${ratio.toFixed(3)}x`);
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'mobile' : 'desktop'}: imprint width ${small} → ${large} px (${ratio.toFixed(3)}x), model scale 0.4 → 0.6`);
    await page.close();
  }
} finally {
  await browser.close();
}
