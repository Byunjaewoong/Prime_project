import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`${base}/works/laboratory/trace`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('canvas[data-sole-outline]')?.getAttribute('data-sole-outline') === 'model');
  await page.mouse.click(195, 350);
  await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1');
  await page.waitForTimeout(1900);

  // Compare the same print before and after a 2x viewport resize. The renderer
  // deliberately uses a 2x canvas pixel ratio at both viewport sizes.
  async function impressionStats() {
    return page.locator('canvas[data-print-count]').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const histogram = new Uint32Array(256);
      const stride = Math.round(canvas.width / 195);
      let count = 0, total = 0;
      for (let y = 0; y < canvas.height; y += stride) {
        for (let x = 0; x < canvas.width; x += stride) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index + 3] < 245) continue;
          const value = Math.round((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3);
          histogram[value]++;
          count++;
          total += value;
        }
      }
      function percentile(fraction) {
        const target = count * fraction;
        let seen = 0;
        for (let i = 0; i < histogram.length; i++) {
          seen += histogram[i];
          if (seen >= target) return i;
        }
        return 255;
      }
      return { count, mean: total / count, p05: percentile(0.05), p50: percentile(0.5) };
    });
  }

  const small = await impressionStats();
  await page.setViewportSize({ width: 780, height: 1688 });
  await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.width === 1560);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('canvas[data-print-count]').getAttribute('data-print-count'), '1');
  const large = await impressionStats();
  assert(small.count > 1000 && large.count > 1000, 'The impression must be visible at both sizes');
  assert(Math.abs(small.count - large.count) / small.count < 0.04, 'The print coverage must survive viewport scaling');
  assert(Math.abs(small.mean - large.mean) < 6, 'Mean print shading changed with viewport size');
  assert(Math.abs(small.p05 - large.p05) < 8, 'Deep wall shadows changed with viewport size');
  assert.deepEqual(errors, []);
  console.log({ small, large, result: 'Trace depth and shadow scale consistently' });
} finally {
  await browser.close();
}
