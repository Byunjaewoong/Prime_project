import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve(process.argv[2]));
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    window.renderSamples = [];
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => raf.call(window, timestamp => {
      const before = performance.now();
      callback(timestamp);
      const duration = performance.now() - before;
      const count = Number(document.querySelector('#butterflies')?.dataset.flying || 0);
      if (count && callback.name === 'animate' && window.renderSamples.length < 3000) window.renderSamples.push({ duration, count, timestamp });
    });
    let factory;
    Object.defineProperty(window, 'createButterflyGarden', {
      get: () => factory,
      set: value => { factory = canvas => (window.testGarden = value(canvas)); },
    });
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[3] || 1) });
  await page.goto('http://127.0.0.1:3000/nonflowers/index.html?mode=mixed&seed=12345');
  await page.waitForFunction(() => document.querySelector('#meadow').getAttribute('aria-busy') === 'false' && document.querySelector('#status').hidden);
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) window.testGarden.spawn(30 + i * 35, 100 + i * 20);
  });
  await page.waitForTimeout(3000);
  const samples = await page.evaluate(() => window.renderSamples);
  const byCount = new Map();
  for (const sample of samples) {
    const list = byCount.get(sample.count) || [];
    list.push(sample.duration);
    byCount.set(sample.count, list);
  }
  for (const [count, durations] of byCount) {
    durations.sort((a, b) => a - b);
    console.log(JSON.stringify({ count, samples: durations.length, median: durations[Math.floor(durations.length * .5)], p95: durations[Math.floor(durations.length * .95)], max: durations.at(-1) }));
  }
  const intervals = samples.slice(1).map((sample, index) => sample.timestamp - samples[index].timestamp).filter(value => value > 0).sort((a, b) => a - b);
  console.log(JSON.stringify({ frameIntervalMedian: intervals[Math.floor(intervals.length * .5)], frameIntervalP95: intervals[Math.floor(intervals.length * .95)] }));
} finally { await browser.close(); }
