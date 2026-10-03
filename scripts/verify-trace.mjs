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
    if (mobile) await page.touchscreen.tap(195, 350);
    else await page.mouse.click(640, 390);
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1', null, { timeout: 8000 });
    const firstProduct = await page.locator('canvas[data-product]').getAttribute('data-product');
    assert(firstProduct);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-contact.png`) });
    await page.waitForTimeout(1900);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-print.png`) });
    const printPixels = await page.locator('canvas[data-print-count]').evaluate(canvas => {
      const context = canvas.getContext('2d');
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 3; index < data.length; index += 4) if (data[index] > 0) count++;
      return count;
    });
    assert(printPixels > 1000, `Expected a visible footprint; got ${printPixels} pixels`);
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
    console.log(`${mobile ? 'mobile' : 'desktop'}: step, stamped sole, layers, clear, and layout OK`);
    await page.close();
  }
} finally { await browser.close(); }
