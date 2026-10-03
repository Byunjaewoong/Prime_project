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
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`${base}/works/laboratory/sole`, { waitUntil: 'networkidle' });
    assert(await page.getByRole('img', { name: /procedural tread/ }).isVisible());
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-generated.png`) });
    await page.getByRole('button', { name: 'Image shape' }).click();
    await page.getByRole('img', { name: /Extracted shoe sole with \d+ tread pieces/ }).waitFor();
    const first = await page.locator('section svg path').first().getAttribute('d');
    assert(first && first.length > 1000, 'The example should produce vector contours');
    assert(await page.getByText(/extracted shapes/).isVisible());
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    assert(scrollHeight <= (mobile ? 844 : 800), 'Sole should fit within the viewport');
    await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-sample.png`) });
    const upload = await sharp(Buffer.from('<svg width="64" height="128" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="128" fill="white"/><rect x="12" y="12" width="30" height="35" fill="black"/><rect x="18" y="75" width="28" height="36" fill="black"/></svg>')).png().toBuffer();
    await page.locator('input[type=file]').setInputFiles({ name: 'test-sole.png', mimeType: 'image/png', buffer: upload });
    await page.getByRole('img', { name: 'Extracted shoe sole with 2 tread pieces' }).waitFor();
    await page.getByRole('slider', { name: 'Darkness' }).fill('60');
    const second = await page.locator('section svg path').first().getAttribute('d');
    assert(second && second.length > 50 && second !== first);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download SVG' }).click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), 'sole-shape.svg');
    const saved = path.join(output, `${mobile ? 'mobile' : 'desktop'}-shape.svg`);
    await download.saveAs(saved);
    assert((await fs.readFile(saved, 'utf8')).includes(second));
    assert.deepEqual(errors, []);
    console.log(`${mobile ? 'mobile' : 'desktop'}: image extraction, upload, threshold OK`);
    await context.close();
  }
} finally { await browser.close(); }
