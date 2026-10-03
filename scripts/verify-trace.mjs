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
    await page.waitForFunction(() => document.querySelector('canvas[data-sole-outline]')?.getAttribute('data-sole-outline') === 'model', null, { timeout: 8000 });
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
    assert(await page.getByRole('slider', { name: /Layer 3 depth/ }).isVisible());
    assert.equal(await page.getByRole('button', { name: 'Shoe', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByRole('slider', { name: 'Impression size' }).inputValue(), '36');
    assert(await page.getByRole('slider', { name: 'Impression size' }).isDisabled(),
      'The real shoe impression must retain the model sole size');
    await page.getByRole('slider', { name: /Layer 2 depth/ }).fill('14');
    for (const tab of ['Outside', 'Layer 1', 'Layer 2', 'Layer 3']) {
      await page.getByRole('tab', { name: tab }).click();
      assert(await page.getByRole('slider', { name: /Noise scale/ }).isVisible());
      assert(await page.getByRole('slider', { name: /Detail layers/ }).isVisible());
      assert(await page.getByRole('slider', { name: /Detail strength/ }).isVisible());
      assert(await page.getByRole('slider', { name: /Height \/ relief/ }).isVisible());
      assert(await page.getByRole('slider', { name: /Pattern seed/ }).isVisible());
      assert(await page.getByLabel(/base color/).isVisible());
      assert(await page.getByRole('slider', { name: /shadow depth/ }).isVisible());
    }
    await page.getByRole('tab', { name: 'Layer 1' }).click();
    await page.getByRole('slider', { name: 'layer1 Noise scale' }).fill('12');
    await page.getByLabel('layer1 base color').fill('#d06050');
    await page.getByRole('tab', { name: 'Outside' }).click();
    await page.getByRole('slider', { name: 'outside Noise scale' }).fill('34');
    await page.getByRole('slider', { name: /Light direction sphere/ }).press('ArrowRight');
    assert.equal(await page.locator('canvas[data-print-count]').getAttribute('data-print-count'), '2',
      'Surface changes should retain both impressions');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-controls.png`) });
    await page.getByRole('button', { name: 'Clear footprints' }).click();
    assert.equal(await page.locator('canvas[data-print-count]').getAttribute('data-print-count'), '0');
    await page.getByRole('button', { name: 'Circle', exact: true }).click();
    assert(await page.getByRole('slider', { name: 'Impression size' }).isEnabled());
    await page.getByRole('slider', { name: 'Impression size' }).fill('60');
    await page.getByRole('button', { name: /Layer 3 on outer edge/ }).click();
    await page.getByRole('button', { name: 'Close menu' }).click();
    if (mobile) await page.touchscreen.tap(195, 350);
    else await page.mouse.click(640, 390);
    await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1', null, { timeout: 8000 });
    await page.waitForTimeout(1700);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-circle.png`) });
    assert.deepEqual(errors, []);
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
    console.log(`${mobile ? 'mobile' : 'desktop'}: step, three layers, surface tabs, light, shape, clear, and layout OK (${contactMs} ms to contact)`);
    await page.close();
  }
} finally { await browser.close(); }
