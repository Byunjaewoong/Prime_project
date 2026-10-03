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
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/works/laboratory`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /17\. Trace/ }).click();
    await page.getByRole('button', { name: /Trace\. Click or tap/ }).waitFor();
    assert.equal(await page.locator('canvas[data-print-count]').getAttribute('data-print-count'), '0');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-initial.png`) });
    const contactStart = Date.now();
    if (mobile) await page.touchscreen.tap(195, 350);
    else await page.mouse.click(640, 390);
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1', null, { timeout: 8000 });
    const contactMs = Date.now() - contactStart;
    const firstProduct = await page.locator('canvas[data-product]').getAttribute('data-product');
    assert(firstProduct);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-contact.png`) });
    await page.waitForTimeout(1900);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-print.png`) });
    const printPixels = await page.locator('canvas[data-print-count]').evaluate(canvas => {
      const context = canvas.getContext('webgl2');
      const data = new Uint8Array(canvas.width * canvas.height * 4);
      context.readPixels(0, 0, canvas.width, canvas.height, context.RGBA, context.UNSIGNED_BYTE, data);
      let count = 0, edge = 0, darkest = 255, lightest = 0;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];
        if (alpha > 0) count++;
        if (alpha > 15 && alpha < 245) edge++;
        if (alpha > 245) { darkest = Math.min(darkest, data[index]); lightest = Math.max(lightest, data[index]); }
      }
      return { count, edge, contrast: lightest - darkest };
    });
    assert(printPixels.count > 1000, `Expected a visible footprint; got ${printPixels.count} pixels`);
    assert(printPixels.edge > 100, 'The impression needs a softened boundary wall');
    assert(printPixels.contrast > 25, 'The two impression depths need visible contrast');
    if (mobile) await page.touchscreen.tap(250, 470);
    else await page.mouse.click(870, 470);
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '2', null, { timeout: 8000 });
    const secondProduct = await page.locator('canvas[data-product]').getAttribute('data-product');
    assert.notEqual(secondProduct, firstProduct, 'Consecutive steps should choose different sole patterns');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-two-prints.png`) });
    await page.getByRole('button', { name: 'Open menu' }).click();
    assert(await page.getByRole('slider', { name: /Layer 1 depth/ }).isVisible());
    assert(await page.getByRole('slider', { name: /Layer 2 depth/ }).isVisible());
    await page.getByRole('slider', { name: /Layer 2 depth/ }).fill('14');
    await page.getByRole('button', { name: 'Clear footprints' }).click();
    assert.equal(await page.locator('canvas[data-print-count]').getAttribute('data-print-count'), '0');
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    console.log(`${mobile ? 'mobile' : 'desktop'}: step, stamped sole, layers, clear, and layout OK (${contactMs} ms to contact)`);
    await page.close();
  }
} finally { await browser.close(); }
