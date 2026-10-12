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
  for (const mobile of process.env.VERIFY_QUICK ? [true] : [true, false]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/works/laboratory/nonFlowers`);
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    const ready = () => frame.waitForFunction(() => document.querySelector('#meadow')?.getAttribute('aria-busy') === 'false' && document.querySelector('#status').hidden);
    await frame.goto(`${base}/nonflowers/index.html?mode=vintage&seed=12345`);
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
    // Mode changes take effect with regeneration, and Mixed must retain both
    // the new meadow petals and the original Nonflowers leaf-built petals.
    await frame.getByRole('radio', { name: 'Nonflower' }).check();
    assert.equal(await frame.locator('#meadow').getAttribute('data-mode'), 'vintage');
    const start = Date.now();
    const repetitions = process.env.VERIFY_QUICK ? 1 : 12;
    for (let i = 0; i < repetitions; i++) {
      await frame.locator('#regenerate').click();
      await ready();
      const next = await image();
      assert.notEqual(next, previous, 'Every regeneration must produce a different image');
      previous = next;
      assert.equal(await frame.locator('#meadow').getAttribute('data-mode'), 'mixed');
      assert.equal(await frame.locator('#meadow').getAttribute('data-original-plants'), '1');
      assert.match(await frame.locator('#meadow').getAttribute('data-original-kind'), /^(woody|herbal)$/);
      assert(Number(await frame.locator('#meadow').getAttribute('data-vintage-flowers')) > 0);
      assert(Number(await frame.locator('#meadow').getAttribute('data-vintage-behind')) > 0);
      assert(Number(await frame.locator('#meadow').getAttribute('data-vintage-front')) > 0);
      assert.equal(await frame.locator('canvas').count(), 1, 'DOM canvases must not accumulate');
    }
    const renderMs = (Date.now() - start) / repetitions;
    const meadowSeed = await frame.locator('#meadow').getAttribute('data-seed');
    const formerMixedSeed = await frame.locator('#meadow').getAttribute('data-mixed-seed');
    const addStart = Date.now();
    await frame.locator('#mixed-regenerate').click();
    await ready();
    const firstAddMs = Date.now() - addStart;
    const firstAddWork = await frame.locator('#meadow').evaluate(canvas => ({ original: Number(canvas.dataset.originalMs), vintage: Number(canvas.dataset.vintageMs), reusedVintage: Number(canvas.dataset.reusedVintage) }));
    assert.equal(await frame.locator('#meadow').getAttribute('data-seed'), meadowSeed, 'Mixed-only regeneration must preserve the vintage seed');
    assert.notEqual(await frame.locator('#meadow').getAttribute('data-mixed-seed'), formerMixedSeed);
    assert.equal(await frame.locator('#meadow').getAttribute('data-original-plants'), '2', 'Mixed-only generation must add a flower');
    assert.equal(await frame.locator('#meadow').getAttribute('data-generated-originals'), '1');
    assert.equal(await frame.locator('#meadow').getAttribute('data-reused-originals'), '1');
    assert(Number(await frame.locator('#meadow').getAttribute('data-reused-vintage')) > 0);
    assert([60, 65, 70, 75, 80].includes(Number(await frame.locator('#mixed-size').inputValue())));
    assert(Number(await frame.locator('#mixed-stem').inputValue()) >= 80 && Number(await frame.locator('#mixed-stem').inputValue()) <= 400);
    assert(Number(await frame.locator('#mixed-petal').inputValue()) >= 60 && Number(await frame.locator('#mixed-petal').inputValue()) <= 180);
    assert(Number(await frame.locator('#meadow').getAttribute('data-vintage-behind')) > 0);
    assert(Number(await frame.locator('#meadow').getAttribute('data-vintage-front')) > 0);
    previous = await image();
    const secondAddStart = Date.now();
    await frame.locator('#mixed-regenerate').click();
    await ready();
    const secondAddMs = Date.now() - secondAddStart;
    const secondAddWork = await frame.locator('#meadow').evaluate(canvas => ({ original: Number(canvas.dataset.originalMs), vintage: Number(canvas.dataset.vintageMs), reusedVintage: Number(canvas.dataset.reusedVintage) }));
    assert.equal(await frame.locator('#meadow').getAttribute('data-original-plants'), '3');
    assert.equal(await frame.locator('#meadow').getAttribute('data-generated-originals'), '1');
    assert.equal(await frame.locator('#meadow').getAttribute('data-reused-originals'), '2');
    assert.equal((await frame.locator('#meadow').getAttribute('data-mixed-depths')).split(',').length, 3);
    assert.notEqual(await image(), previous, 'Each added mixed flower must change the artwork');
    const earlierDepths = (await frame.locator('#meadow').getAttribute('data-mixed-depths')).split(',').slice(0, 2);
    await frame.locator('#mixed-depth').evaluate(input => {
      input.value = '25';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await frame.waitForFunction(() => document.querySelector('#meadow').dataset.mixedDepth === '0.2500' && document.querySelector('#meadow').getAttribute('aria-busy') === 'false');
    assert.equal(await frame.locator('#meadow').getAttribute('data-generated-originals'), '0');
    assert.equal(await frame.locator('#meadow').getAttribute('data-reused-originals'), '3');
    assert.deepEqual((await frame.locator('#meadow').getAttribute('data-mixed-depths')).split(',').slice(0, 2), earlierDepths);
    previous = await image();
    await frame.locator('#show-vintage').uncheck();
    await frame.waitForFunction(() => document.querySelector('#meadow').dataset.vintageVisible === 'false' && document.querySelector('#meadow').getAttribute('aria-busy') === 'false');
    assert.equal(await frame.locator('#meadow').getAttribute('data-vintage-flowers'), '0');
    assert.equal(await frame.locator('#meadow').getAttribute('data-original-plants'), '3');
    await frame.locator('#show-vintage').check();
    await frame.waitForFunction(() => document.querySelector('#meadow').dataset.vintageVisible === 'true' && document.querySelector('#meadow').getAttribute('aria-busy') === 'false');
    assert.equal(await image(), previous, 'Toggling vintage visibility must preserve both compositions');
    await frame.getByRole('button', { name: '메뉴 닫기', exact: true }).first().click();
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-mixed.png`) });
    const savedUrl = frame.url();
    assert.match(savedUrl, /mode=mixed/);
    assert.match(savedUrl, /mix=/);
    await frame.goto(savedUrl);
    await ready();
    assert(await image() === previous, 'Saved seed must reproduce the composition after reload');
    assert.equal(await frame.locator('#meadow').getAttribute('data-mode'), 'mixed');
    await frame.getByRole('button', { name: '메뉴 열기', exact: true }).click();
    await frame.getByRole('radio', { name: 'Vintage', exact: true }).check();
    await frame.locator('#regenerate').click();
    await ready();
    assert.equal(await frame.locator('#meadow').getAttribute('data-mode'), 'vintage');
    assert.equal(await frame.locator('#meadow').getAttribute('data-original-plants'), '0');
    assert.equal(await frame.locator('#meadow').getAttribute('data-original-kind'), 'none');
    assert(!frame.url().includes('mode=mixed'));
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
      const quality = Number(document.querySelector('#resolution').value);
      const ratio = Math.min(quality, Math.sqrt((quality === 2 ? 6000000 : 3200000) / (innerWidth * innerHeight)));
      return c.width === Math.round(innerWidth * ratio) && c.height === Math.round(innerHeight * ratio) && c.getAttribute('aria-busy') === 'false';
    });
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
    assert.deepEqual(errors, []);
    results.push({ viewport: mobile ? 'mobile' : 'desktop', regenerated: repetitions, meanRegenerationMs: Math.round(renderMs), firstAddMs, secondAddMs,
      firstAddWork, secondAddWork, errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
