import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Uses the same temporary Playwright installation convention as verify-browser.
const require = createRequire(path.resolve(process.argv[2]));
const { chromium } = require('playwright');
const output = path.resolve('artifacts/nonflowers-pattern');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const results = [];
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/works/laboratory/nonFlowers`);
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    const ready = () => frame.waitForFunction(() => document.querySelector('#meadow')?.getAttribute('aria-busy') === 'false' && document.querySelector('#status').hidden);
    await ready();
    const image = () => frame.locator('#meadow').evaluate(c => c.toDataURL());
    const first = await image();
    assert(first.length > 100000, 'Artwork must have nontrivial rendered content');
    const box = await page.locator('iframe').boundingBox();
    assert.equal(box.width, mobile ? 390 : 1440);
    assert.equal(box.height, mobile ? 844 : 900);
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-initial.png`) });
    await frame.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    const seed = await frame.locator('#edition').textContent();
    await frame.getByRole('button', { name: '앤티크 크림', exact: true }).click();
    await frame.waitForFunction(() => document.querySelector('#tone').value === '#e3d5b9');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-menu.png`) });
    assert.notEqual(await image(), first, 'Tone selection should alter the image');
    assert.equal(await frame.locator('#edition').textContent(), seed, 'Tone selection must preserve composition');
    await frame.getByRole('button', { name: '미스트 블루', exact: true }).click();
    await frame.waitForFunction(() => document.querySelector('#tone').value === '#a6b7b2');
    // Wait for the color compositor's animation frame before exact comparison.
    await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const restored = await image();
    if (restored !== first) {
      const difference = await frame.evaluate(async original => {
        const image = new Image(); image.src = original; await image.decode();
        const canvas = document.querySelector('#meadow');
        const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
        const comparison = copy.getContext('2d'); comparison.drawImage(image, 0, 0);
        const before = comparison.getImageData(0, 0, copy.width, copy.height).data;
        const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let max = 0, total = 0;
        for (let i = 0; i < before.length; i++) { const delta = Math.abs(before[i] - after[i]); max = Math.max(max, delta); total += delta; }
        return { max, mean: total / before.length };
      }, first);
      console.log('Tone round-trip pixel delta', difference);
      // GPU/software Canvas compositing can round a channel by one level.
      assert(difference.max <= 2 && difference.mean < .15, 'Tone round-trip must preserve the flower artwork');
    }
    let previous = first;
    const start = Date.now();
    for (let i = 0; i < 12; i++) {
      await frame.locator('#regenerate').click();
      await ready();
      const next = await image();
      assert.notEqual(next, previous, 'Every regeneration must produce a different image');
      previous = next;
      assert.equal(await frame.locator('canvas').count(), 1, 'DOM canvases must not accumulate');
    }
    const renderMs = (Date.now() - start) / 12;
    const numericSeed = await frame.locator('#meadow').getAttribute('data-seed');
    await frame.goto(`${base}/nonflowers/index.html?seed=${numericSeed}`);
    await ready();
    assert(await image() === previous, 'Saved seed must reproduce the composition after reload');
    await frame.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    const pendingDownload = page.waitForEvent('download');
    await frame.locator('#download').click();
    const download = await pendingDownload;
    assert.match(download.suggestedFilename(), /^nonflowers-\d+\.png$/);
    const downloadedPath = path.join(output, `${mobile ? 'mobile' : 'desktop'}-export.png`);
    await download.saveAs(downloadedPath);
    assert((await fs.stat(downloadedPath)).size > 10000);
    await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1000, height: 700 });
    await frame.waitForFunction(() => {
      const c = document.querySelector('#meadow');
      const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3200000 / (innerWidth * innerHeight)));
      return c.width === Math.round(innerWidth * ratio) && c.height === Math.round(innerHeight * ratio) && c.getAttribute('aria-busy') === 'false';
    });
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
    assert.deepEqual(errors, []);
    results.push({ viewport: mobile ? 'mobile' : 'desktop', regenerated: 12, meanRegenerationMs: Math.round(renderMs), errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
