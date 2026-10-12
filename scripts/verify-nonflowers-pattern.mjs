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
  for (const [name, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/nonflowers/index.html?mode=pattern&seed=12345`);
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
        stemmed: Number(canvas.dataset.patternStemmed),
        heads: Number(canvas.dataset.patternHeads),
        coverage: Number(canvas.dataset.patternCoverage),
        seed: canvas.dataset.seed,
      };
    });
    assert.deepEqual([values.size, values.stem, values.spacing, values.ratio], ['40', '30', '20', '100']);
    assert.equal(values.stemmed, values.count);
    assert.equal(values.heads, 0);
    assert(values.count > 0 && values.coverage >= .85, `Pattern left too much empty area: ${JSON.stringify(values)}`);
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
    await page.close();
  }
  const atoms = await fetch(`${base}/works/Emergence/atoms`).then(response => response.text());
  for (const song of ['Rihanna%20-%20S%26M.mp3', 'Yo%20Trane%20Magnetic.mp3', 'FREE%20MOBB%20DEEP']) {
    assert(atoms.includes(song), `Atoms music library is missing ${song}`);
  }
} finally {
  await browser.close();
}
