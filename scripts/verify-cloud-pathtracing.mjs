import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [name, label] of [['Cloud', 'Cloud'], ['Pathtracing', 'Pathtracing']]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:3000/works/laboratory/${name}`);
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(name === 'Cloud' ? 2200 : 5000);
    assert.equal(await page.locator('main [role="alert"]').count(), 0, `${name}: ${await page.locator('main [role="alert"]').allTextContents()}`);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    const canvas = page.locator('canvas');
    const dimensions = await canvas.evaluate(element => [element.width, element.height]);
    assert(dimensions[0] > 300 && dimensions[1] > 200, `${name}: invalid canvas dimensions`);
    await page.screenshot({ path: `artifacts/${name.toLowerCase()}-desktop.png` });
    if (name === 'Pathtracing') {
      const before = await page.locator('main').innerText();
      assert.match(before, /\d+ SAMPLES/);
      await canvas.dragTo(canvas, { sourcePosition: { x: 400, y: 360 }, targetPosition: { x: 500, y: 350 } });
      await page.waitForTimeout(1000);
      assert.equal(await page.locator('main [role="alert"]').count(), 0);
    }
    await page.getByRole('button', { name: /CONTROLS/ }).click();
    assert.equal(await page.getByRole('heading', { name: label }).count(), 1);
    if (name === 'Pathtracing') await page.getByRole('button', { name: 'Reset view' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/${name.toLowerCase()}-mobile-controls.png` });
    await page.getByRole('button', { name: /CONTROLS/ }).click();
    await page.screenshot({ path: `artifacts/${name.toLowerCase()}-mobile.png` });
    console.log(`${name}: ${dimensions.join('x')} canvas, controls, desktop/mobile render OK`);
    await page.close();
  }
} finally {
  await browser.close();
}
