import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const backup = '58afedfe1080d53b964bc6cacbb6ffc5fc89c27b';
const out = path.resolve('artifacts/vortex-4k');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
const result = [];
const benchmarks = [];
const definitions = [
  ['baseline-solver', execFileSync('git', ['show', `${backup}:app/works/Vortex/core/FluidSolver.ts`], { encoding: 'utf8' })],
  ['baseline-renderer', execFileSync('git', ['show', `${backup}:app/works/Vortex/core/Renderer.ts`], { encoding: 'utf8' })],
  ['baseline-app', execFileSync('git', ['show', `${backup}:app/works/Vortex/core/App.ts`], { encoding: 'utf8' })],
  ...['FluidSolver', 'Renderer', 'resolution', 'DyeRenderer', 'App'].map(name => [name, fs.readFileSync(`app/works/Vortex/core/${name}.ts`, 'utf8')]),
];
const scripts = definitions.map(([name, source]) => {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mapping = name.startsWith('baseline-') ? { './FluidSolver': 'baseline-solver', './Renderer': 'baseline-renderer' } : {};
  return `(() => { const exports = {}; const require = name => window.modules[${JSON.stringify(mapping)}[name] ?? name.replace('./', '')]; ${js}\nwindow.modules[${JSON.stringify(name)}] = exports; })();`;
});
try {
  for (const [width, height, mobile] of [[1920, 1080, false], [3840, 2160, false], [390, 844, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setContent(`<style>body{margin:0;background:black}section{position:absolute;inset:0}canvas{position:absolute;inset:0;width:100%;height:100%}#input{z-index:1}</style><section id="baseline"><canvas id="old"></canvas></section><section id="updated"><canvas id="input"></canvas><canvas id="gpu"></canvas></section>`);
    await page.evaluate(() => {
      window.modules = {};
      window.requestAnimationFrame = () => 1;
      window.cancelAnimationFrame = () => {};
    });
    for (const script of scripts) await page.addScriptTag({ content: script });
    const metrics = await page.evaluate(({ width, height }) => {
      const factor = Math.min(1, 1920 / Math.max(width, height));
      const referenceWidth = width * factor, referenceHeight = height * factor;
      const withReferenceSize = callback => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: referenceWidth });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: referenceHeight });
        try { return callback(); } finally {
          Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
          Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
        }
      };
      const oldCanvas = document.querySelector('#old');
      const input = document.querySelector('#input'), gpu = document.querySelector('#gpu');
      const baseline = withReferenceSize(() => new window.modules['baseline-app'].App(oldCanvas));
      oldCanvas.width = width; oldCanvas.height = height;
      oldCanvas.style.width = '100%'; oldCanvas.style.height = '100%';
      const updated = new window.modules.App.App(input, gpu);
      baseline.setParam('vorticity', updated.getParams().vorticity);
      window.apps = { baseline, updated };
      const gl = gpu.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
      const timings = { baseline: [], updated: [], gpuSubmit: [] };
      let maxVelocityDifference = 0;
      for (let frame = 0; frame < 100; frame++) {
        if (frame < 60) {
          const x = width * (0.25 + frame * 0.008), y = height * (0.5 + Math.sin(frame * 0.1) * 0.13);
          const dx = width * 0.008, dy = height * Math.cos(frame * 0.1) * 0.013;
          withReferenceSize(() => baseline.injectAt(x * factor, y * factor, dx * factor, dy * factor));
          updated.injectAt(x, y, dx, dy);
        }
        baseline.hueAngle += 4; updated.hueAngle += 4;
        updated.dyeRenderer?.captureSources(updated.solver);
        let start = performance.now(); baseline.solver.step(); timings.baseline.push(performance.now() - start);
        start = performance.now(); updated.solver.step(); timings.updated.push(performance.now() - start);
        const a = baseline.solver, b = updated.solver;
        for (let i = 0; i < a.size; i++) maxVelocityDifference = Math.max(maxVelocityDifference, Math.abs(a.u[i] - b.u[i]), Math.abs(a.v[i] - b.v[i]));
        start = performance.now(); updated.dyeRenderer?.render(b, updated.renderer.saturation, updated.renderer.brightness); timings.gpuSubmit.push(performance.now() - start);
      }
      baseline.renderer.render(baseline.ctx, baseline.solver.W, baseline.solver.H, baseline.solver.W + 2,
        baseline.solver.dR, baseline.solver.dG, baseline.solver.dB, width, height);
      if (!updated.dyeRenderer?.available) throw new Error('GPU dye renderer is not active');
      const oldPixels = baseline.ctx.getImageData(0, 0, width, height).data;
      const newPixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, newPixels);
      let intersection = 0, union = 0, rgbError = 0, samples = 0;
      const oldCenter = [0, 0, 0], newCenter = [0, 0, 0];
      for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
        const a = (y * width + x) * 4, b = ((height - y - 1) * width + x) * 4;
        const oldMax = Math.max(oldPixels[a], oldPixels[a + 1], oldPixels[a + 2]);
        const newMax = Math.max(newPixels[b], newPixels[b + 1], newPixels[b + 2]);
        const oldVisible = oldMax > 8, newVisible = newMax > 8;
        if (oldVisible && newVisible) intersection++;
        if (oldVisible || newVisible) { union++; for (let c = 0; c < 3; c++) rgbError += Math.abs(oldPixels[a + c] - newPixels[b + c]); samples += 3; }
        oldCenter[0] += x * oldMax; oldCenter[1] += y * oldMax; oldCenter[2] += oldMax;
        newCenter[0] += x * newMax; newCenter[1] += y * newMax; newCenter[2] += newMax;
      }
      const summarize = values => {
        const sorted = values.slice(20).sort((a, b) => a - b);
        return { median: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)] };
      };
      return {
        width, height, renderer, resolution: updated.getResolutionInfo(), maxVelocityDifference,
        silhouetteIoU: intersection / Math.max(1, union), visibleRgbMeanError: rgbError / Math.max(1, samples),
        centroidDifference: { x: Math.abs(oldCenter[0] / oldCenter[2] - newCenter[0] / newCenter[2]) / width,
          y: Math.abs(oldCenter[1] / oldCenter[2] - newCenter[1] / newCenter[2]) / height },
        cpuStepMs: { baseline: summarize(timings.baseline), updated: summarize(timings.updated) },
        gpuSubmitMs: summarize(timings.gpuSubmit), webglError: gl.getError(),
      };
    }, { width, height });
    await page.evaluate(() => { document.querySelector('#updated').style.visibility = 'hidden'; });
    await page.screenshot({ path: path.join(out, `${width}x${height}-before.png`) });
    await page.evaluate(() => { document.querySelector('#baseline').style.visibility = 'hidden'; document.querySelector('#updated').style.visibility = 'visible'; });
    await page.screenshot({ path: path.join(out, `${width}x${height}-after.png`) });
    assert.equal(metrics.maxVelocityDifference, 0, 'CPU flow differs from reference');
    assert.equal(metrics.webglError, 0);
    assert.ok(metrics.silhouetteIoU > 0.85, `Shape overlap too low: ${metrics.silhouetteIoU}`);
    assert.ok(metrics.centroidDifference.x < 0.02 && metrics.centroidDifference.y < 0.02, 'Dye center moved');
    const controls = await page.evaluate(() => {
      const { updated } = window.apps;
      updated.showVectors = true; updated.animate(0);
      updated.showVectors = false; updated.animate(0);
      updated.reset(); updated.animate(0);
      const gpu = document.querySelector('#gpu'), gl = gpu.getContext('webgl2');
      const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const resetPixel = Array.from(pixel);
      gpu.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      updated.injectAt(innerWidth / 2, innerHeight / 2, 30, 10); updated.animate(0);
      const fallback = updated.getResolutionInfo().rendering;
      updated.destroy(); window.apps.baseline.destroy();
      return { resetPixel, fallback };
    });
    assert.deepEqual(controls.resetPixel.slice(0, 3), [0, 0, 0]);
    assert.equal(controls.fallback, 'canvas');
    assert.deepEqual(errors, []);
    result.push({ ...metrics, controls, errors });
    fs.writeFileSync(path.join(out, 'comparison.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result.at(-1)));
    await page.close();
  }
  const fallbackPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await fallbackPage.setContent('<canvas id="input"></canvas><canvas id="gpu"></canvas>');
  await fallbackPage.evaluate(() => {
    window.modules = {};
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  for (const script of scripts) await fallbackPage.addScriptTag({ content: script });
  const fallback = await fallbackPage.evaluate(() => {
    const input = document.querySelector('#input'), gpu = document.querySelector('#gpu');
    const app = new window.modules.App.App(input, gpu);
    for (let frame = 0; frame < 20; frame++) { app.injectAt(300 + frame * 10, 400, 10, 2); app.animate(0); }
    const pixels = app.ctx.getImageData(0, 0, input.width, input.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 8) colored++;
    const result = { rendering: app.getResolutionInfo().rendering, hiddenGpuCanvas: gpu.style.display === 'none', coloredPixels: colored };
    app.destroy();
    return result;
  });
  assert.equal(fallback.rendering, 'canvas');
  assert.equal(fallback.hiddenGpuCanvas, true);
  assert.ok(fallback.coloredPixels > 0);
  fs.writeFileSync(path.join(out, 'fallback.json'), JSON.stringify(fallback, null, 2));
  console.log(JSON.stringify(fallback));
  await fallbackPage.close();

  // Measure the complete App loop at native 4K, including its original grid
  // growth. These frame intervals include browser presentation, unlike GPU
  // submission timings above, which do not measure GPU completion.
  for (const engine of ['baseline', 'updated']) {
    const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
    await page.setContent('<style>body{margin:0;background:black}canvas{position:absolute;inset:0;width:100%;height:100%}#input{z-index:1}</style><canvas id="input"></canvas><canvas id="gpu"></canvas>');
    await page.evaluate(() => {
      window.modules = {};
      window.measurements = [];
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(timestamp => {
        const start = performance.now();
        callback(timestamp);
        window.measurements.push({ timestamp, cpuMs: performance.now() - start });
      });
    });
    for (const script of scripts) await page.addScriptTag({ content: script });
    await page.evaluate(engine => {
      const input = document.querySelector('#input'), gpu = document.querySelector('#gpu');
      window.app = engine === 'baseline' ? new window.modules['baseline-app'].App(input) : new window.modules.App.App(input, gpu);
      if (engine === 'baseline') window.app.setParam('vorticity', new window.modules.FluidSolver.FluidSolver(64, 64).vorticityEps);
    }, engine);
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(3840 * (0.2 + i * 0.015), 2160 * (0.5 + Math.sin(i * 0.16) * 0.15));
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(2200);
    const benchmark = await page.evaluate(engine => {
      const samples = window.measurements.slice(10);
      const intervals = samples.slice(1).map((sample, i) => sample.timestamp - samples[i].timestamp).sort((a, b) => a - b);
      const cpu = samples.map(sample => sample.cpuMs).sort((a, b) => a - b);
      const info = window.app.getResolutionInfo?.() ?? { grid: { width: window.app.solver.W, height: window.app.solver.H }, output: { width: 3840, height: 2160 } };
      window.app.destroy();
      return { engine, resolution: info, samples: samples.length,
        fps: (samples.length - 1) * 1000 / (samples.at(-1).timestamp - samples[0].timestamp),
        frameIntervalMedianMs: intervals[Math.floor(intervals.length * 0.5)],
        frameIntervalP95Ms: intervals[Math.floor(intervals.length * 0.95)],
        cpuMedianMs: cpu[Math.floor(cpu.length * 0.5)], cpuP95Ms: cpu[Math.floor(cpu.length * 0.95)] };
    }, engine);
    benchmarks.push(benchmark);
    fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify(benchmarks, null, 2));
    console.log(JSON.stringify(benchmark));
    await page.close();
  }
} finally { await browser.close(); }
