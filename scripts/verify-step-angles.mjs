import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
const output = path.resolve('artifacts/trace');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const angles = [];
    for (const [name, sample] of [['northeast', 0.125], ['northwest', 0.375]]) {
      const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${base}/works/laboratory/trace`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('canvas[data-sole-outline]')?.getAttribute('data-sole-outline') === 'model');
      await page.getByRole('button', { name: 'Open menu' }).click();
      assert.equal(await page.getByRole('button', { name: 'Random', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('slider', { name: 'Shoe and footprint size' }).fill('0.4');
      await page.getByRole('button', { name: 'Close menu' }).click();
      await page.evaluate(value => { Math.random = () => value; }, sample);
      if (mobile) await page.touchscreen.tap(viewport.width / 2, viewport.height / 2);
      else await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.waitForFunction(() => document.querySelector('canvas[data-print-count]')?.getAttribute('data-print-count') === '1');
      await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-${name}-contact.png`) });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: path.join(output, `${mobile ? 'mobile' : 'desktop'}-${name}-print.png`) });
      const angle = await page.locator('canvas[data-print-count]').evaluate(canvas => {
        const gl = canvas.getContext('webgl2');
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
        for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
          if (pixels[(y * canvas.width + x) * 4 + 3] < 128) continue;
          n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        }
        const covarianceX = sxx / n - (sx / n) ** 2;
        const covarianceY = syy / n - (sy / n) ** 2;
        const covarianceXY = sxy / n - sx * sy / (n * n);
        const degrees = Math.atan2(2 * covarianceXY, covarianceX - covarianceY) * 90 / Math.PI;
        return { count: n, degrees };
      });
      assert(angle.count > 1000, 'Diagonal step should leave a visible imprint');
      assert(Math.abs(Math.sin(angle.degrees * Math.PI / 90)) > 0.45,
        `Random angle should be diagonal, got ${angle.degrees.toFixed(1)}°`);
      assert.deepEqual(errors, []);
      angles.push(angle.degrees);
      await page.close();
    }
    assert(Math.sign(Math.sin(angles[0] * Math.PI / 90)) !== Math.sign(Math.sin(angles[1] * Math.PI / 90)),
      'Opposite random quadrants should leave different diagonal orientations');
    console.log(`${mobile ? 'mobile' : 'desktop'}: diagonal imprint axes ${angles.map(value => value.toFixed(1)).join('°, ')}°`);
  }
} finally {
  await browser.close();
}
