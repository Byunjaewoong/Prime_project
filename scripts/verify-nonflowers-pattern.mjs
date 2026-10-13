import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.resolve(process.argv[2]));
const { chromium } = require('playwright');
const base = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';
const output = path.resolve('artifacts/nonflowers-pattern');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [name, viewport] of [
    ['mobile', { width: 390, height: 844 }],
    ['desktop', { width: 1440, height: 900 }],
    ['wide', { width: 1920, height: 540 }],
    ['tall', { width: 540, height: 1200 }],
  ]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/nonflowers/index.html?mode=pattern&seed=12345`);
    await page.waitForFunction(() => {
      const status = document.querySelector('#status');
      const progress = document.querySelector('#pattern-progress');
      return !status.hidden && !progress.hidden && progress.value > 0 && progress.value < 100 &&
        status.textContent.includes('패턴 생성 중');
    });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#meadow');
      return canvas?.getAttribute('aria-busy') === 'false' && document.querySelector('#status').hidden;
    });
    const values = await page.evaluate(() => {
      const canvas = document.querySelector('#meadow');
      return {
        size: document.querySelector('#pattern-size').value,
        stem: document.querySelector('#pattern-stem').value,
        spacing: document.querySelector('#pattern-spacing').value,
        ratio: document.querySelector('#pattern-ratio').value,
        count: Number(canvas.dataset.patternCount),
        generated: Number(canvas.dataset.patternGenerated),
        stemmed: Number(canvas.dataset.patternStemmed),
        heads: Number(canvas.dataset.patternHeads),
        coverage: Number(canvas.dataset.patternCoverage),
        viewCoverage: Number(canvas.dataset.patternViewCoverage),
        seed: canvas.dataset.seed,
        canvasAspect: canvas.width / canvas.height,
        objectFit: getComputedStyle(canvas).objectFit,
      };
    });
    assert.deepEqual([values.size, values.stem, values.spacing, values.ratio], ['40', '30', '20', '100']);
    assert.equal(values.stemmed, values.count);
    assert.equal(values.heads, 0);
    if (name === 'wide') assert.equal(values.generated, 50);
    assert.equal(await page.locator('#pattern-progress').evaluate(progress => progress.value), 100);
    assert.equal(await page.locator('#status').isHidden(), true);
    assert(values.count > 0 && values.viewCoverage >= .94, `Pattern left too much visible empty area: ${JSON.stringify(values)}`);
    assert(Math.abs(values.canvasAspect - viewport.width / viewport.height) < .01);
    assert.equal(values.objectFit, 'cover');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, `${name}-pattern-fill.png`) });
    console.log(JSON.stringify({ viewport: name, ...values, errors }));
    if (name === 'mobile') {
      await page.locator('#pattern-ratio').evaluate(input => {
        input.value = '0';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#meadow');
        return canvas.dataset.patternHeads !== '0' && canvas.getAttribute('aria-busy') === 'false';
      });
      assert.equal(await page.locator('#meadow').getAttribute('data-pattern-stemmed'), '0');
      assert(Number(await page.locator('#meadow').getAttribute('data-pattern-coverage')) >= .85);
    }
    if (name === 'desktop') {
      await page.setViewportSize({ width: 1000, height: 1100 });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#meadow');
        return canvas.getAttribute('aria-busy') === 'false' &&
          Math.abs(canvas.width / canvas.height - 1000 / 1100) < .01;
      });
      assert(Number(await page.locator('#meadow').getAttribute('data-pattern-view-coverage')) >= .94);
    }
    if (name === 'wide') {
      await page.locator('#pattern-regenerate').evaluate(button => button.click());
      await page.waitForFunction(previousSeed => {
        const canvas = document.querySelector('#meadow');
        return canvas.dataset.seed !== previousSeed && canvas.getAttribute('aria-busy') === 'false';
      }, values.seed);
      assert(Number(await page.locator('#meadow').getAttribute('data-pattern-view-coverage')) >= .94);
    }
    await page.close();
  }
  const atoms = await fetch(`${base}/works/Emergence/atoms`).then(response => response.text());
  for (const song of ['Rihanna%20-%20S%26M.mp3', 'Yo%20Trane%20Magnetic.mp3', 'FREE%20MOBB%20DEEP']) {
    assert(atoms.includes(song), `Atoms music library is missing ${song}`);
  }
} finally {
  await browser.close();
}
