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
  assert.equal(await style.inputValue(), 'air-force-1');
  const choices = await style.locator('option').evaluateAll(nodes => nodes.map(node => node.value));
  assert.equal(choices.length, 12, 'The product selector needs exactly 12 references');
  const outline = await page.locator('section svg > path').getAttribute('d');
  assert(outline?.length > 500, 'The original shoe outline must remain visible');
  const patterns = new Set();
  const tiles = [];
  for (let index = 0; index < choices.length; index++) {
    await style.selectOption(choices[index]);
    const paths = await page.locator('section svg g path').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    assert(paths.length >= 10, `${choices[index]} should have detailed tread pieces`);
    assert.equal(await page.locator('section svg > path').getAttribute('d'), outline, 'Regeneration must not change the outline');
    patterns.add(paths.join('|'));
    const screenshot = await page.locator('section svg > path').screenshot();
    const tile = await sharp(screenshot).resize(280, 660, { fit: 'contain', background: '#fff' }).png().toBuffer();
    tiles.push({ input: tile, left: (index % 4) * 280, top: Math.floor(index / 4) * 660 });
  }
  assert.equal(patterns.size, 12, 'Each product must have distinct geometry');
  await sharp({ create: { width: 1120, height: 1980, channels: 4, background: '#fff' } })
    .composite(tiles).png().toFile(path.join(output, 'generated-gallery.png'));
  await style.selectOption('air-force-1');
  await page.getByRole('button', { name: 'new pattern' }).click();
  assert.notEqual(await style.inputValue(), 'air-force-1', 'Regeneration should select a different product');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => errors.push(String(error)));
  await mobile.goto(`${base}/works/laboratory/sole`, { waitUntil: 'networkidle' });
  const before = await mobile.locator('section svg g path').first().getAttribute('d');
  await mobile.getByRole('button', { name: 'new pattern' }).click();
  assert.notEqual(await mobile.locator('section svg g path').first().getAttribute('d'), before);
  assert(await mobile.evaluate(() => document.documentElement.scrollHeight <= innerHeight));
  assert.deepEqual(errors, []);
  console.log('12 distinct product treads, fixed outline, randomized product, and mobile regeneration OK');
} finally { await browser.close(); }
