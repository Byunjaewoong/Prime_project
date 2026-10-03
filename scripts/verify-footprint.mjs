import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('artifacts/footprint');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });

try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/works/laboratory/Foot-print`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Open menu' }).click();

    for (const [index, depth, shadow, scale] of [[1, 4, 0.25, 28], [2, 10, 0.5, 20], [3, 20, 0.8, 40]]) {
      const layer = `layer${index}`;
      const slider = page.getByRole('slider', { name: `Layer ${index} impression depth` });
      assert.equal(await slider.getAttribute('aria-valuenow'), String(depth));
      await page.getByRole('button', { name: `Layer ${index}`, exact: true }).click();
      await page.getByRole('tab', { name: `Layer ${index}` }).click();
      const panel = page.getByRole('tabpanel', { name: `Layer ${index} texture controls` });
      assert.equal(Number(await panel.getByRole('slider', { name: `${layer} shadow depth` }).getAttribute('aria-valuenow')), shadow);
      assert.equal(Number(await panel.getByRole('slider', { name: `${layer} Noise scale` }).getAttribute('aria-valuenow')), scale);
    }

    const depth1 = page.getByRole('slider', { name: 'Layer 1 impression depth' });
    await depth1.focus(); await page.keyboard.press('ArrowUp');
    assert.equal(await depth1.getAttribute('aria-valuenow'), '5');
    assert.equal(await page.getByRole('slider', { name: 'Layer 2 impression depth' }).getAttribute('aria-valuenow'), '10');
    assert.equal(await page.getByRole('slider', { name: 'Layer 3 impression depth' }).getAttribute('aria-valuenow'), '20');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-menu.png`) });

    await page.getByRole('button', { name: 'Close menu' }).click();
    await (mobile ? page.touchscreen.tap(viewport.width * 0.5, viewport.height * 0.5)
      : page.mouse.click(viewport.width * 0.5, viewport.height * 0.5));
    const pixel = await page.evaluate(() => {
      const canvas = document.querySelectorAll('canvas')[1];
      const gl = canvas.getContext('webgl2');
      if (!gl) return null;
      const rgba = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return [...rgba];
    });
    assert(pixel && pixel[3] > 0, 'Layer 3 must draw an impression through WebGL2');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-layer3.png`) });
    await page.getByRole('button', { name: 'Open menu' }).click();
    const layer3Panel = page.getByRole('tabpanel', { name: 'Layer 3 texture controls' });
    await layer3Panel.getByLabel('layer3 base color').fill('#ff2020');
    const shadowSlider = layer3Panel.getByRole('slider', { name: 'layer3 shadow depth' });
    await shadowSlider.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(Number(await shadowSlider.getAttribute('aria-valuenow')), 0.75);
    const scaleSlider = layer3Panel.getByRole('slider', { name: 'layer3 Noise scale' });
    await scaleSlider.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(Number(await scaleSlider.getAttribute('aria-valuenow')), 39);
    const recolored = await page.evaluate(() => {
      const canvas = document.querySelectorAll('canvas')[1];
      const gl = canvas.getContext('webgl2');
      const rgba = new Uint8Array(4);
      gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return [...rgba];
    });
    assert(recolored[0] > recolored[1], 'Layer 3 color control must change its existing impression');
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'mobile' : 'desktop'}: layer defaults, independent depth, layer 3 stamp OK`);
    await context.close();
  }
} finally { await browser.close(); }
