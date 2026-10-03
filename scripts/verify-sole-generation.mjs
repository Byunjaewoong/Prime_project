import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('artifacts/sole');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${base}/works/laboratory/sole`, { waitUntil: 'networkidle' });
  const style = page.getByRole('combobox', { name: 'Style' });
  assert.equal(await style.inputValue(), 'imprint');
  const patterns = new Set();
  const tiles = [];
  for (let index = 0; index < 12; index++) {
    if (index) await page.getByRole('button', { name: 'new pattern' }).click();
    const paths = await page.locator('section svg g path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    assert(paths.length >= 10, 'Imprint should have forefoot and heel pieces');
    patterns.add(paths.join('|'));
    const screenshot = await page.locator('section svg').screenshot();
    const tile = await sharp(screenshot).extract({ left: 454, top: 0, width: 340, height: 624 }).png().toBuffer();
    tiles.push({ input: tile, left: (index % 4) * 340, top: Math.floor(index / 4) * 624 });
  }
  assert.equal(patterns.size, 12, 'Each new pattern must change the generated geometry');
  await sharp({ create: { width: 1360, height: 1872, channels: 4, background: '#fff' } })
    .composite(tiles).png().toFile(path.join(output, 'generated-gallery.png'));
  await style.selectOption('trail');
  assert(await page.getByRole('img', { name: /Trail lugs shoe sole/ }).isVisible());
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(String(error)));
  await mobile.goto(`${base}/works/laboratory/sole`, { waitUntil: 'networkidle' });
  const before = await mobile.locator('section svg g path').first().getAttribute('d');
  await mobile.getByRole('button', { name: 'new pattern' }).click();
  assert.notEqual(await mobile.locator('section svg g path').first().getAttribute('d'), before);
  assert(await mobile.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  assert.deepEqual(errors, []);
  console.log('12 distinct imprint designs, mobile regeneration, and legacy style selection OK');
} finally { await browser.close(); }
