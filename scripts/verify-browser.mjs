import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Pass the path to a temporary Playwright installation; no runtime dependency is added.
const require = createRequire(path.resolve(process.argv[2]));
const { chromium } = require('playwright');
const output = path.resolve('artifacts/browser-260914');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const routes = process.env.VERIFY_ROUTES?.split(',') ?? ['Geo-centr', 'Helio-centr', 'ASCII-Donut', 'Perlin-noise', 'Snow-walker', 'Emergence', 'Vortex', 'Vortex_GPU', 'Fluid', 'weatherProject'];
const results = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => {
      window.__draws = 0;
      for (const [prototype, names] of [[CanvasRenderingContext2D.prototype, ['fill', 'drawImage', 'fillRect', 'fillText', 'stroke', 'putImageData']], [WebGL2RenderingContext.prototype, ['drawArrays', 'drawElements']]]) {
        for (const name of names) {
          const original = prototype[name];
          prototype[name] = function (...args) { window.__draws++; return original.apply(this, args); };
        }
      }
    });
    const page = await context.newPage();
    for (const route of routes) {
      const entry = { route, viewport: mobile ? 'mobile' : 'desktop', errors: [], failedResponses: [], screenshots: [] };
      const onError = error => entry.errors.push(String(error));
      const onResponse = response => { if (response.status() >= 400 && response.url().startsWith('http://localhost:3000')) entry.failedResponses.push({ url: response.url(), status: response.status() }); };
      page.on('pageerror', onError);
      const onConsole = message => { if (message.type() === 'error') entry.errors.push(message.text()); };
      page.on('console', onConsole);
      page.on('response', onResponse);
      try {
        const response = await page.goto(`http://localhost:3000/works/${route}`, { waitUntil: 'networkidle', timeout: 60000 });
        entry.status = response.status();
        await page.waitForTimeout(route === 'weatherProject' || route === 'Snow-walker' ? 4000 : 1200);
        const save = async suffix => {
          const file = `${entry.viewport}-${route}-${suffix}.png`;
          await page.screenshot({ path: path.join(output, file) });
          entry.screenshots.push(file);
        };
        if (route === 'Emergence') {
          for (const label of ['Lenia', 'Boids', 'Gray-Scott', 'Physarum']) {
            await page.getByText(label, { exact: true }).first().click();
            await page.waitForTimeout(1800);
            await save(label);
            if (entry.errors.length) console.log(JSON.stringify({ route, errors: entry.errors }));
            await page.goto('http://localhost:3000/works/Emergence', { waitUntil: 'networkidle' });
          }
          await page.getByText('Boids', { exact: true }).first().click();
        }
        await save('initial');
        const canvas = page.locator('canvas').first();
        const rect = await canvas.boundingBox();
        entry.canvas = rect;
        if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Canvas has no visible dimensions');
        await page.mouse.move(rect.x + rect.width * 0.55, rect.y + rect.height * 0.5);
        await page.mouse.down();
        for (let i = 0; i < 12; i++) { await page.mouse.move(rect.x + rect.width * (0.25 + i * 0.035), rect.y + rect.height * (0.35 + Math.sin(i) * 0.08)); await page.waitForTimeout(60); }
        await page.mouse.up();
        if (route !== 'Fluid') {
          if (mobile) await page.touchscreen.tap(rect.x + rect.width * 0.6, rect.y + rect.height * 0.4);
          else await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.4);
        }
        if (route === 'Fluid' && await page.getByText(/Tap to Play/).count()) {
          await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.4);
        }
        const drawsBefore = await page.evaluate(() => window.__draws);
        await page.waitForTimeout(route === 'Vortex_GPU' ? 100 : 800);
        entry.drawsAfterInteraction = await page.evaluate(() => window.__draws) - drawsBefore;
        if (!entry.drawsAfterInteraction) throw new Error('No canvas drawing activity after interaction');
        await save('interaction');
        const fab = page.locator('.orbit-fab__main');
        if (await fab.count()) { await fab.click(); await page.waitForTimeout(250); await save('controls'); }
        if (route === 'Vortex' || route === 'Vortex_GPU') {
          const toggle = page.getByRole('button', { name: /vectors/ });
          if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(500); await save('vectors'); }
        }
        const slider = page.locator('input[type="range"]').first();
        if (await slider.count()) {
          const before = await slider.inputValue();
          await slider.focus();
          await slider.press('ArrowRight');
          entry.slider = { before, after: await slider.inputValue() };
        }
        if (route === 'Fluid') {
          entry.audioPlaying = await page.locator('audio').evaluate(audio => !audio.paused);
          if (!entry.audioPlaying) throw new Error('Fluid audio did not start after user input');
          await page.mouse.click(rect.x + rect.width * 0.6, rect.y + rect.height * 0.4);
          entry.audioPaused = await page.locator('audio').evaluate(audio => audio.paused);
          if (!entry.audioPaused) throw new Error('Fluid audio did not pause');
        }
        await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 1000, height: 700 });
        await page.waitForTimeout(600);
        entry.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        await save('resized');
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
        // Exercise client navigation to trigger renderer cleanup.
        const home = page.locator('a[href="/"]').first();
        if (await home.count()) { await home.evaluate(link => link.click()); await page.waitForTimeout(300); }
        else await page.goto('http://localhost:3000');
        const homeDraws = await page.evaluate(() => window.__draws);
        await page.waitForTimeout(250);
        entry.drawsAfterNavigation = await page.evaluate(() => window.__draws) - homeDraws;
        if (entry.drawsAfterNavigation) throw new Error('Renderer keeps drawing after navigation');
        entry.passed = entry.errors.length === 0 && entry.failedResponses.length === 0 && !entry.horizontalOverflow;
      } catch (error) { entry.errors.push(String(error)); entry.passed = false; }
      page.off('pageerror', onError);
      page.off('console', onConsole);
      page.off('response', onResponse);
      results.push(entry);
      fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
      console.log(`${entry.viewport} ${route}: ${entry.passed ? 'PASS' : 'FAIL'} ${entry.errors.join(' | ')}`);
    }
    await context.close();
  }
} finally { await browser.close(); }
if (results.some(result => !result.passed)) process.exitCode = 1;
