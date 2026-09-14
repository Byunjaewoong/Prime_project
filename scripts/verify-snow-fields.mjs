import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';

const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const out = path.resolve('artifacts/snow-fields-260914');
const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // Serve the actual core and Three.js modules through a browser-only harness.
    await page.route('**/__snow/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/__snow/harness') {
        await route.fulfill({ contentType: 'text/html', body: `<style>body{margin:0}canvas{display:block;width:100vw;height:100vh}</style><script type="importmap">{"imports":{"three":"/__snow/three/build/three.module.js","three/":"/__snow/three/"}}</script><canvas></canvas><script type="module">import * as THREE from 'three';import {App} from '/__snow/App.js';window.uploaded=new Set();const add=THREE.Texture.prototype.addEventListener,dispatch=THREE.Texture.prototype.dispatchEvent;THREE.Texture.prototype.addEventListener=function(type,listener){if(type==='dispose')window.uploaded.add(this);return add.call(this,type,listener)};THREE.Texture.prototype.dispatchEvent=function(event){if(event.type==='dispose')window.uploaded.delete(this);return dispatch.call(this,event)};window.app=new App(document.querySelector('canvas'));</script>` });
        return;
      }
      let body;
      if (pathname.startsWith('/__snow/three/')) {
        const root = path.resolve('node_modules/three');
        const file = path.resolve(root, pathname.slice('/__snow/three/'.length));
        if (!file.startsWith(root + path.sep)) throw new Error('Invalid module path');
        body = fs.readFileSync(file, 'utf8');
      } else {
        const files = { '/__snow/App.js': 'app/works/Snow-walker/core/App.ts', '/__snow/FieldStyles.js': 'app/works/Snow-walker/core/FieldStyles.ts', '/__snow/disposeObject.js': 'app/lib/disposeObject.ts' };
        body = compile(files[pathname]).replace('"@/app/lib/disposeObject"', '"/__snow/disposeObject.js"').replace('"./FieldStyles"', '"./FieldStyles.js"');
      }
      await route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.goto(`${base}/__snow/harness`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.app?.mixer);
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      clearInterval(window.app.logicIntervalId);
      const a = window.app;
      // Choose a visible moment on the same path for the comparison capture.
      a.camera.updateMatrixWorld();
      let best = a.curveProgress, distance = Infinity;
      for (let i = 0; i <= 200; i++) {
        const t = a.startProgress + (a.endProgress - a.startProgress) * i / 200;
        const p = a.curve.getPoint(t).project(a.camera);
        const d = p.x * p.x + p.y * p.y;
        if (p.z > -1 && p.z < 1 && d < distance) { best = t; distance = d; }
      }
      if (best > a.curveProgress) a.updateLogic((best - a.curveProgress) / a.moveSpeed);
      else { a.curveProgress = best; a.stepMovement(0); }
      // Pause walking for exact identity/position checks; rendering stays active.
      window.saved = {
        player: window.app.playerGroup, curve: window.app.curve,
        progress: window.app.curveProgress, position: window.app.playerGroup.position.toArray(),
        footprints: [...window.app.footprints],
        footprintPositions: window.app.footprints.map(fp => fp.position.toArray()),
        opacities: window.app.footprints.map(fp => fp.material.opacity),
        camera: window.app.camera.position.toArray(),
        mixerTime: window.app.mixer.time,
      };
    });
    const label = mobile ? 'mobile' : 'desktop';
    await page.screenshot({ path: path.join(out, `${label}-snow.png`) });
    for (const [index, name] of [[1, 'green'], [2, 'gold'], [0, 'snow-return']]) {
      if (mobile) await page.touchscreen.tap(200, 350);
      else await page.mouse.click(640, 400);
      const state = await page.evaluate(() => {
        const a = window.app, s = window.saved;
        return {
          field: a.fieldIndex, name: a.getFieldName(),
          sameObjects: a.playerGroup === s.player && a.curve === s.curve && a.footprints.every((fp, i) => fp === s.footprints[i]),
          position: a.playerGroup.position.toArray(), savedPosition: s.position,
          footprintPositions: a.footprints.map(fp => fp.position.toArray()), savedFootprintPositions: s.footprintPositions,
          opacity: a.footprints.map(fp => fp.material.opacity), savedOpacity: s.opacities,
          progress: a.curveProgress, savedProgress: s.progress,
          mixerTime: a.mixer.time, savedMixerTime: s.mixerTime,
          camera: a.camera.position.toArray(), savedCamera: s.camera,
        };
      });
      assert.equal(state.field, index);
      assert.equal(state.sameObjects, true);
      for (const [a, b] of [['position', 'savedPosition'], ['footprintPositions', 'savedFootprintPositions'], ['opacity', 'savedOpacity'], ['progress', 'savedProgress'], ['mixerTime', 'savedMixerTime'], ['camera', 'savedCamera']]) assert.deepEqual(state[a], state[b]);
      await page.evaluate(() => window.app.updateField(1));
      const fog = await page.evaluate(() => ({ exponential: window.app.scene.fog.isFogExp2, density: window.app.scene.fog.density, color: window.app.scene.fog.color.getHex(), background: window.app.scene.background.getHex() }));
      assert.equal(fog.exponential, true);
      assert.ok(Math.abs(fog.density - (index === 0 ? 0.035 : 0.0175)) < 0.00001);
      assert.equal(fog.color, fog.background);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `${label}-${name}.png`) });
    }
    // Fast repeated switching must not recreate textures/materials or scene objects.
    const stable = await page.evaluate(() => {
      const a = window.app, before = { ...a.renderer.info.memory }, children = a.scene.children.length;
      for (let i = 0; i < 60; i++) { a.nextField(); a.updateField(0.016); a.renderer.render(a.scene, a.camera); }
      return { before, after: { ...a.renderer.info.memory }, children, afterChildren: a.scene.children.length, footprints: a.footprints.length };
    });
    assert.deepEqual(stable.after, stable.before);
    assert.equal(stable.children, stable.afterChildren);
    assert.ok(stable.footprints > 0);
    const beforeTree = await page.evaluate(() => ({ children: window.app.scene.children.length, field: window.app.fieldIndex }));
    await page.mouse.click(mobile ? 200 : 640, mobile ? 350 : 400, { button: 'right' });
    await page.waitForFunction(count => window.app.scene.children.length === count + 1, beforeTree.children, { timeout: 30000 });
    assert.equal(await page.evaluate(() => window.app.fieldIndex), beforeTree.field);
    const treeRetained = await page.evaluate(() => {
      const a = window.app, count = a.scene.children.length;
      for (let i = 0; i < 3; i++) { a.nextField(); a.updateField(1); }
      return a.scene.children.length === count;
    });
    assert.equal(treeRetained, true);
    await page.evaluate(() => { window.app.updateField(1); });
    await page.screenshot({ path: path.join(out, `${label}-tree.png`) });
    // Walking resumes from the saved point rather than restarting.
    const resumed = await page.evaluate(() => {
      const a = window.app, progress = a.curveProgress, time = a.mixer.time;
      a.updateLogic(0.016);
      return { moved: a.curveProgress > progress, animated: a.mixer.time > time };
    });
    assert.equal(resumed.moved, true); assert.equal(resumed.animated, true);
    const disposed = await page.evaluate(() => {
      const a = window.app; a.destroy();
      return { ...a.renderer.info.memory, contextLost: a.renderer.getContext().isContextLost(), remaining: [...window.uploaded].map(t => ({ type: t.type, format: t.format, width: t.image?.width, height: t.image?.height })) };
    });
    // Three.js keeps its shared 32px DFG lookup in its module cache.
    // Keep the canvas context usable for React Strict Mode effect replay.
    assert.equal(disposed.geometries, 0); assert.equal(disposed.contextLost, false);
    assert.ok(disposed.remaining.every(t => t.type === 1016 && t.format === 1030 && t.width === 32 && t.height === 32));
    await page.evaluate(() => {
      window.app = new window.app.constructor(document.querySelector('canvas'));
      window.app.destroy();
      window.app = new window.app.constructor(document.querySelector('canvas'));
    });
    await page.waitForFunction(() => window.app?.mixer);
    await page.evaluate(() => window.app.destroy());
    assert.deepEqual(errors, []);
    const result = { viewport: label, stable, rightClickTree: true, statePreserved: true, resumed, disposed, errors };
    results.push(result); console.log(JSON.stringify(result));
    // Exercise the React page and its menu as well as the core harness.
    await page.goto(`${base}/works/Snow-walker`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    for (const name of ['snow', 'green', 'gold']) {
      if (name !== 'snow') {
        if (mobile) await page.touchscreen.tap(200, 350);
        else await page.mouse.click(640, 400);
        await page.waitForTimeout(800);
      }
      await page.screenshot({ path: path.join(out, `${label}-page-${name}.png`) });
    }
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    await page.getByText('Left click / tap: change field', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, `${label}-menu.png`) });
    await page.getByRole('link', { name: '메인으로 돌아가기' }).click();
    await page.waitForURL(`${base}/`);
    assert.deepEqual(errors, []);
    result.reactPageAndMenu = true;
    await page.close();
  }
} finally {
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  if (results.length === 2 && results.every(r => r.reactPageAndMenu)) {
    const images = Object.fromEntries(['desktop', 'mobile'].map(size => [size,
      Object.fromEntries(['snow', 'green', 'gold'].map(field => [field, fs.readFileSync(path.join(out, `${size}-${field}.png`)).toString('base64')]))]));
    fs.writeFileSync(path.join(out, 'comparison.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Snow-walker 필드 비교</title><style>body{background:#171717;color:white;font:16px system-ui;margin:24px}button,select{padding:10px;font:inherit;margin-right:12px}img{display:block;max-width:100%;max-height:85vh;margin-top:20px}</style><h1>Snow-walker 필드 비교</h1><p>같은 인물 위치와 발자국을 유지한 눈밭 · 초록 잔디 · 금빛 잔디</p><select id="size"><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select><button data-field="snow">눈밭</button><button data-field="green">초록 잔디</button><button data-field="gold">금빛 잔디</button><img id="image"><script>const images=${JSON.stringify(images)};let field='snow';const size=document.querySelector('#size');function update(){document.querySelector('#image').src='data:image/png;base64,'+images[size.value][field]}document.querySelectorAll('button').forEach(b=>b.onclick=()=>{field=b.dataset.field;update()});size.onchange=update;update()</script></html>`);
  }
  await browser.close();
}
