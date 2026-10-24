import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const baseUrl = process.argv[3] || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function redWallCenter(page) {
  const image = `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
  return page.evaluate(async source => {
    const picture = new Image();
    picture.src = source;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = picture.width;
    canvas.height = picture.height;
    const context = canvas.getContext('2d');
    context.drawImage(picture, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0, weighted = 0;
    for (let y = 150; y < Math.min(570, canvas.height); y += 3) for (let x = 150; x < Math.min(850, canvas.width); x += 3) {
      const index = (y * canvas.width + x) * 4;
      const [r, g, b] = pixels.slice(index, index + 3);
      if (r > 60 && r > g * 1.35 && r > b * 1.3) { total++; weighted += x; }
    }
    return total ? weighted / total : NaN;
  }, image);
}
try {
  for (const [name, label] of [['Cloud', 'Cloud'], ['Pathtracing', 'Pathtracing']]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/works/laboratory/${name}`);
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
      const wallBefore = await redWallCenter(page);
      await canvas.dragTo(canvas, { sourcePosition: { x: 400, y: 360 }, targetPosition: { x: 500, y: 350 } });
      await page.waitForTimeout(1000);
      assert.equal(await page.locator('main [role="alert"]').count(), 0);
      const wallAfter = await redWallCenter(page);
      assert(wallAfter > wallBefore + 10, `Pathtracing: right drag moved the red wall left (${wallBefore} → ${wallAfter})`);
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
