/* global Prng, Noise, paper, leaf, stroke, hsv, genParams, Layer, woody, herbal */
// Vintage meadow composition. Built on Lingdong Huang's MIT-licensed Nonflowers:
// seeded randomness, Perlin contours, variable-width strokes and veined leaves.
(() => {
  'use strict';
  const canvas = document.getElementById('meadow');
  const ctx = canvas.getContext('2d', { alpha: false });
  const menu = document.getElementById('menu');
  const toggle = document.getElementById('menu-toggle');
  const status = document.getElementById('status');
  const generateButton = document.getElementById('regenerate');
  const downloadButton = document.getElementById('download');
  const toneInput = document.getElementById('tone');
  const tau = Math.PI * 2;
  const random = (a, b) => a + Math.random() * (b - a);
  const pick = values => values[Math.floor(Math.random() * values.length)];
  const palettes = [
    [356, .86, .68], [4, .78, .77], [345, .75, .43],
    [38, .24, .96], [34, .28, .93], [17, .44, .88],
    [226, .30, .62], [281, .30, .56],
  ];
  let tone = '#a6b7b2';
  try { tone = localStorage.getItem('nonflowers-paper-tone') || tone; } catch { /* Private mode. */ }
  if (!/^#[0-9a-f]{6}$/i.test(tone)) tone = '#a6b7b2';
  let seed = newSeed();
  const query = new URLSearchParams(location.search);
  const querySeed = Number(query.get('seed'));
  if (Number.isSafeInteger(querySeed) && querySeed > 1 && querySeed <= 0xffffffff) seed = querySeed;
  let mode = query.get('mode') === 'mixed' ? 'mixed' : 'vintage';
  let pendingMode = mode;
  document.querySelector(`input[name="flower-mode"][value="${mode}"]`).checked = true;
  const bloomInput = document.getElementById('bloom-size');
  const stemInput = document.getElementById('stem-length');
  const resolutionInput = document.getElementById('resolution');
  const vintageControls = document.getElementById('vintage-controls');
  const mixedControls = document.getElementById('mixed-controls');
  const mixedSizeInput = document.getElementById('mixed-size');
  const mixedStemInput = document.getElementById('mixed-stem');
  const mixedPetalInput = document.getElementById('mixed-petal');
  const readPercent = (name, fallback, min, max) => {
    const value = Number(query.get(name));
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  bloomInput.value = String(readPercent('bloom', 85, 50, 140));
  stemInput.value = String(readPercent('stem', 115, 95, 145));
  mixedSizeInput.value = String(readPercent('mixedSize', 50, 40, 120));
  mixedStemInput.value = String(readPercent('mixedStem', 120, 80, 400));
  mixedPetalInput.value = String(readPercent('mixedPetal', 100, 60, 180));
  resolutionInput.value = ['1', '1.5', '2'].includes(query.get('quality')) ? query.get('quality') : '2';
  document.getElementById('bloom-size-value').value = `${bloomInput.value}%`;
  document.getElementById('stem-length-value').value = `${stemInput.value}%`;
  for (const [input, output] of [[mixedSizeInput, 'mixed-size-value'], [mixedStemInput, 'mixed-stem-value'], [mixedPetalInput, 'mixed-petal-value']]) {
    document.getElementById(output).value = `${input.value}%`;
  }
  mixedControls.hidden = pendingMode !== 'mixed';
  vintageControls.hidden = pendingMode === 'mixed';
  let flowers = null;
  let generation = 0;
  let resizeTimer;
  let controlsTimer;
  let frame = 0;
  let disposed = false;

  // A fixed noise field makes saved seeds repeatable even after a page reload.
  // Only the PRNG is advanced by each composition; tone changes never touch it.
  Prng.s = 739391;
  Noise.noise(0);
  const paperTile = paper({ col: [1, 1, 1], tex: 16, spr: .035 });
  const wear = document.createElement('canvas');
  wear.width = wear.height = 256;
  const wearCtx = wear.getContext('2d');
  const grain = wearCtx.createImageData(256, 256);
  for (let i = 0; i < grain.data.length; i += 4) {
    grain.data[i] = grain.data[i + 1] = grain.data[i + 2] = 244;
    grain.data[i + 3] = Math.random() < .24 ? random(10, 75) : 0;
  }
  wearCtx.putImageData(grain, 0, 0);

  function newSeed() {
    return 2 + crypto.getRandomValues(new Uint32Array(1))[0] % 4294967293;
  }

  function ink(color, value = 1, alpha = 1) {
    return hsv((color[0] + 360) % 360, color[1], Math.min(1, color[2] * value), alpha);
  }

  function curve(start, end, bend, steps = 32) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push([
        start[0] + (end[0] - start[0]) * t + Math.sin(t * Math.PI) * bend,
        start[1] + (end[1] - start[1]) * t,
      ]);
    }
    return points;
  }

  function stalk(context, points, width, alpha = 1) {
    stroke({ ctx: context, pts: points, wid: t => width * (1 - .66 * t), col: `rgba(64,76,44,${alpha})` });
    stroke({ ctx: context, pts: points.map(p => [p[0] - width * .3, p[1]]), wid: t => width * .26 * (1 - .8 * t), col: `rgba(181,167,113,${alpha * .8})` });
  }

  function foliage(context, x, y, angle, length, feathered) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    if (feathered) {
      const line = curve([0, 0], [0, -length], random(-5, 5), 12);
      stalk(context, line, .5, .65);
      for (let i = 2; i < 11; i++) {
        for (const side of [-1, 1]) {
          const l = length * .3 * Math.sin(i / 12 * Math.PI);
          stalk(context, curve(line[i], [line[i][0] + side * l, line[i][1] - l * .75], side * 2, 8), .48, .68);
        }
      }
    } else {
      const phase = random(0, 90);
      leaf({ ctx: context, len: length, seg: 16, rot: [Math.PI / 2, 0, 0],
        wid: t => Math.pow(Math.max(0, Math.sin(t * Math.PI)), .8) * length * .15 * (.75 + Noise.noise(t * 7, phase) * .4),
        ben: t => [.2 * Math.sin(t * Math.PI), 0, .25], vei: [2, 3, 3],
        col: { min: [76, .28, .30, .8], max: [68, .30, .58, .85] },
      });
    }
    context.restore();
  }

  // Petals extend the original centerline + width-profile construction with a
  // scalloped terminal edge, translucent pigment washes and fine radial veins.
  function petal(context, length, width, color, phase) {
    const path = new Path2D();
    const curl = random(-.15, .15) * length;
    path.moveTo(0, 0);
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 26; i++) {
        const t = side === -1 ? i / 26 : 1 - i / 26;
        const profile = Math.pow(Math.sin(Math.PI * t * .82), .65);
        const irregularity = .85 + Noise.noise(t * 9, phase + side * 3) * .28;
        const x = curl * t * t + side * width * profile * irregularity;
        const y = -length * t;
        if (side === 1 && i === 0) {
          // Five shallow lobes across the broad, slightly torn petal tip.
          for (let j = 1; j <= 16; j++) {
            const q = j / 16;
            path.lineTo(curl + (q * 2 - 1) * width * .68,
              -length - Math.sin(q * Math.PI) * length * .1 + Math.sin(q * Math.PI * 10 + phase) * length * .024);
          }
        }
        path.lineTo(x, y);
      }
    }
    path.closePath();
    const wash = context.createLinearGradient(0, 0, curl, -length);
    wash.addColorStop(0, ink(color, .50));
    wash.addColorStop(.22, ink(color, .81));
    wash.addColorStop(.66, ink(color, 1));
    wash.addColorStop(1, ink(color, random(.95, 1.1)));
    context.fillStyle = wash;
    context.fill(path);
    context.save();
    context.clip(path);
    for (let j = 0; j < 24; j++) {
      const spread = random(-1, 1);
      context.beginPath();
      context.moveTo(spread * width * .08, -length * random(0, .16));
      context.bezierCurveTo(spread * width * .5, -length * .4,
        curl * .6 + spread * width * .8, -length * .75,
        curl + spread * width * .85, -length * 1.1);
      context.strokeStyle = j % 3 ? ink(color, .56, random(.07, .19)) : `rgba(255,238,195,${random(.12, .34)})`;
      context.lineWidth = random(.2, .65);
      context.stroke();
    }
    for (let j = 0; j < 28; j++) {
      context.fillStyle = j % 2 ? ink(color, .5, .10) : 'rgba(255,230,181,.17)';
      context.fillRect(random(-width, width) + curl * .5, -random(0, length), random(.2, 1.2), random(.5, 2.3));
    }
    context.restore();
    context.strokeStyle = ink(color, .5, .25);
    context.lineWidth = .35;
    context.stroke(path);
  }

  function blossom(context, x, y, radius, color, tilt, double) {
    context.save();
    context.translate(x, y);
    context.rotate(random(-.6, .6));
    context.scale(1, tilt);
    const count = Math.floor(random(7, 11));
    const offset = random(0, tau);
    const rings = double ? 2 : 1;
    for (let ring = 0; ring < rings; ring++) {
      for (let k = 0; k < count; k++) {
        context.save();
        context.rotate(offset + k / count * tau + random(-.11, .11) + ring * .24);
        const length = radius * random(.80, 1.13) * (1 - ring * .25);
        petal(context, length, length * random(.31, .43), color, random(1, 100));
        context.restore();
      }
    }
    context.fillStyle = 'rgba(77,54,25,.9)';
    context.beginPath();
    context.ellipse(0, 0, radius * .14, radius * .12, 0, 0, tau);
    context.fill();
    for (let k = 0; k < 42; k++) {
      const angle = k * 2.39996;
      const r = Math.sqrt(k / 42) * radius * .19;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      context.strokeStyle = 'rgba(111,81,34,.8)';
      context.lineWidth = .55;
      context.beginPath(); context.moveTo(x * .7, y * .7 + 1.7); context.lineTo(x, y - 1.5); context.stroke();
      context.fillStyle = pick(['#d9b668', '#ecce8a', '#a88545', '#f2d99e']);
      context.beginPath(); context.ellipse(x, y - 1.5, random(.55, 1.1), random(.8, 1.5), angle, 0, tau); context.fill();
    }
    context.restore();
  }

  function umbel(context, x, y, radius, color) {
    const count = Math.floor(random(7, 12));
    for (let j = 0; j < count; j++) {
      const angle = -Math.PI + (j + random(.1, .9)) / count * Math.PI;
      const reach = radius * random(.5, 1);
      const tx = x + Math.cos(angle) * reach;
      const ty = y + Math.sin(angle) * reach * .65 - radius * .15;
      stalk(context, curve([x, y + radius * .5], [tx, ty], random(-3, 3), 12), .45, .65);
      for (let k = 0; k < 7; k++) {
        const a = k * 2.4;
        const spread = Math.sqrt(k) * radius * .066;
        const fx = tx + Math.cos(a) * spread;
        const fy = ty + Math.sin(a) * spread * .7;
        const size = random(1.4, 2.7);
        for (let p = 0; p < 5; p++) {
          const pa = p / 5 * tau;
          context.fillStyle = ink(color, random(.86, 1.1), .94);
          context.beginPath();
          context.ellipse(fx + Math.cos(pa) * size, fy + Math.sin(pa) * size, size * .8, size * .65, pa, 0, tau);
          context.fill();
        }
        context.fillStyle = '#9f8050'; context.fillRect(fx, fy, .9, .9);
      }
    }
  }

  function plant(context, item, height) {
    const { x, y, size, kind, color, depth } = item;
    const root = [x + random(-175, 175), height + random(30, 170)];
    const points = curve(root, [x, y + (kind === 'umbel' ? size * .5 : 0)], random(-75, 75));
    context.globalAlpha = .68 + depth * .3;
    stalk(context, points, random(.75, 1.4) * (kind === 'umbel' ? .7 : 1));
    const count = Math.floor(random(3, 7));
    for (let j = 0; j < count; j++) {
      const i = Math.floor(random(5, 29));
      const side = j % 2 ? 1 : -1;
      const point = points[i];
      foliage(context, point[0], point[1], side * random(.45, 1.1), random(19, 49), kind !== 'blue' && Math.random() < .7);
      if (j < 2 && kind !== 'umbel' && point[1] < height * .93) {
        const tip = [point[0] + side * random(16, 40), point[1] - random(26, 65)];
        stalk(context, curve(point, tip, side * 6, 16), .6);
        context.fillStyle = ink(color, .7);
        context.beginPath(); context.ellipse(tip[0], tip[1], 2.5, 5, side * .35, 0, tau); context.fill();
      }
    }
    context.globalAlpha = 1;
    if (kind === 'umbel') umbel(context, x, y, size, color);
    else blossom(context, x, y, size, color, random(.50, 1), Math.random() < .24);
    context.globalAlpha = 1;
  }

  // Keep the original plant's shape and pigment colors, but make its painted
  // pixels opaque. Preserve low-alpha edge pixels for smooth silhouettes.
  function solidifyPigment(context) {
    const image = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    const pixels = image.data;
    for (let i = 3; i < pixels.length; i += 4) {
      const alpha = pixels[i];
      if (alpha === 0) continue;
      const coverage = Math.min(1, alpha / 72);
      pixels[i] = Math.round(255 * coverage * coverage * (3 - 2 * coverage));
    }
    context.putImageData(image, 0, 0);
  }

  // Generate the complete plant through the original woody/herbal path, then
  // adjust only its finished raster opacity before placing it in the meadow.
  function originalPlant(context, worldWidth, worldHeight) {
    const par = genParams({ silent: true });
    const kind = Math.random() <= .5 ? 'woody' : 'herbal';
    const stemScale = Number(mixedStemInput.value) / 100;
    const petalScale = Number(mixedPetalInput.value) / 100;
    const sourceSize = Math.min(1600, Math.ceil(800 + Math.max(0, stemScale - 1) * 1000 + Math.max(0, petalScale - 1) * 100));
    const source = Layer.empty(sourceSize);
    par.flowerLength *= petalScale;
    par.innerLength *= petalScale;
    if (kind === 'woody') woody({ ctx: source, xof: sourceSize / 2, yof: sourceSize - 50, PAR: par, branchLength: 400 * stemScale });
    else {
      par.stemLength *= stemScale;
      herbal({ ctx: source, xof: sourceSize / 2, yof: sourceSize, PAR: par, adaptiveCanvas: true });
    }
    solidifyPigment(source);
    const bounds = Layer.bound(source);
    if (bounds.xmax < bounds.xmin || bounds.ymax < bounds.ymin) {
      source.canvas.width = source.canvas.height = 1;
      throw new Error('Original Nonflowers plant has no visible pixels');
    }
    const width = bounds.xmax - bounds.xmin + 1;
    const height = bounds.ymax - bounds.ymin + 1;
    const scale = Math.min(worldHeight * .80 / height, worldWidth * .78 / width, 2.2) * Number(mixedSizeInput.value) / 100;
    const centerX = worldWidth * random(.37, .63);
    const baseY = worldHeight + random(5, 65);
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.drawImage(source.canvas, bounds.xmin, bounds.ymin, width, height,
      centerX - width * scale / 2, baseY - height * scale, width * scale, height * scale);
    context.restore();
    source.canvas.width = source.canvas.height = 1;
    return kind;
  }

  function compose() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ctx.createPattern(paperTile, 'repeat');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    if (flowers) ctx.drawImage(flowers, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = .25;
    ctx.fillStyle = ctx.createPattern(wear, 'repeat');
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(canvas.width * .5, canvas.height * .4, 0, canvas.width * .5, canvas.height * .5, Math.hypot(canvas.width, canvas.height) * .62);
    vignette.addColorStop(0, 'rgba(234,216,165,.025)');
    vignette.addColorStop(1, 'rgba(69,56,27,.13)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async function render() {
    const id = ++generation;
    generateButton.disabled = downloadButton.disabled = true;
    canvas.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.textContent = '꽃을 그리고 있습니다…';
    // The previous composition stays visible until the new one is complete.
    // Pixel and plant budgets bound memory/work on phones and large monitors.
    const cssWidth = Math.max(1, innerWidth);
    const cssHeight = Math.max(1, innerHeight);
    const quality = Number(resolutionInput.value);
    const ratio = Math.min(quality, Math.sqrt((quality === 2 ? 6000000 : 3200000) / (cssWidth * cssHeight)));
    const width = Math.round(cssWidth * ratio);
    const height = Math.round(cssHeight * ratio);
    const working = document.createElement('canvas');
    working.width = width; working.height = height;
    const painter = working.getContext('2d');
    const worldHeight = 1350;
    const worldWidth = worldHeight * cssWidth / cssHeight;
    const bloomScale = Number(bloomInput.value) / 100;
    const stemScale = Number(stemInput.value) / 100;
    painter.scale(width / worldWidth, height / worldHeight);
    Prng.s = seed;
    const items = [];
    let originalKind = 'none';
    let vintageCount = 0;
    const columns = Math.max(5, Math.min(26, Math.round(worldWidth / 73)));
    // Stratified jitter avoids both a rigid repeat and large accidental holes.
    // The tallest layer is airy; lower layers gain larger, more crowded blooms.
    for (let row = 0; row < 7; row++) {
      for (let col = -1; col <= columns; col++) {
        const depth = row / 6;
        const x = (col + random(.05, .95)) / columns * worldWidth;
        const y = 160 + row * 180 / stemScale + random(-72, 72);
        const isUmbel = Math.random() < .43;
        const color = isUmbel ? pick([[34, .26, .96], [20, .42, .88], [10, .57, .84]]) : pick(palettes);
        if (!isUmbel) vintageCount++;
        items.push({ x, y, depth, kind: isUmbel ? 'umbel' : color[0] > 200 && color[0] < 300 ? 'blue' : 'cosmos',
          size: (isUmbel ? random(26, 48) : random(27, 43) * (.85 + depth * .45)) * bloomScale, color });
        if (row > 1 && Math.random() < .7) items.push({ x: x + random(-40, 40), y: y + random(35, 80), depth,
          kind: 'umbel', size: random(15, 29) * bloomScale, color: pick([[32, .30, .97], [15, .39, .9]]) });
      }
    }
    try {
      for (let i = 0; i < items.length; i++) {
        if (id !== generation || disposed) return;
        plant(painter, items[i], worldHeight);
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (id !== generation || disposed) return;
      if (mode === 'mixed') originalKind = originalPlant(painter, worldWidth, worldHeight);
      canvas.width = width; canvas.height = height;
      if (flowers) { flowers.width = flowers.height = 1; }
      flowers = working;
      compose();
      document.getElementById('edition').value = seed.toString(16).toUpperCase().padStart(8, '0');
      canvas.dataset.seed = String(seed);
      canvas.dataset.mode = mode;
      canvas.dataset.originalPlants = String(mode === 'mixed' ? 1 : 0);
      canvas.dataset.originalKind = originalKind;
      canvas.dataset.vintageFlowers = String(vintageCount);
      status.hidden = true;
      downloadButton.disabled = false;
    } catch (error) {
      console.error('Nonflowers composition failed', error);
      status.textContent = '생성을 완료하지 못했습니다. 메뉴에서 다시 생성해 주세요.';
      downloadButton.disabled = !flowers;
    } finally {
      if (working !== flowers) working.width = working.height = 1;
      if (id === generation) {
        generateButton.disabled = false;
        canvas.setAttribute('aria-busy', 'false');
      }
    }
  }

  function setTone(value) {
    tone = value;
    toneInput.value = value;
    for (const button of document.querySelectorAll('[data-tone]')) button.setAttribute('aria-pressed', String(button.dataset.tone === value));
    try { localStorage.setItem('nonflowers-paper-tone', value); } catch { /* Optional persistence. */ }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(compose);
  }

  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    if (open) document.getElementById('close-menu').focus();
    else toggle.focus();
  }
  toggle.addEventListener('click', () => setMenu(menu.hidden));
  document.getElementById('close-menu').addEventListener('click', () => setMenu(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) setMenu(false); });
  canvas.addEventListener('click', () => { if (!menu.hidden) setMenu(false); });
  document.getElementById('swatches').addEventListener('click', event => {
    const button = event.target.closest('[data-tone]');
    if (button) setTone(button.dataset.tone);
  });
  toneInput.addEventListener('input', event => setTone(event.target.value));
  document.querySelectorAll('input[name="flower-mode"]').forEach(input => {
    input.addEventListener('change', event => {
      pendingMode = event.target.value;
      mixedControls.hidden = pendingMode !== 'mixed';
      vintageControls.hidden = pendingMode === 'mixed';
    });
  });
  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    if (mode === 'mixed') url.searchParams.set('mode', 'mixed');
    else url.searchParams.delete('mode');
    for (const [name, value, fallback] of [
      ['bloom', bloomInput.value, '85'], ['stem', stemInput.value, '115'], ['quality', resolutionInput.value, '2'],
      ['mixedSize', mixedSizeInput.value, '50'], ['mixedStem', mixedStemInput.value, '120'], ['mixedPetal', mixedPetalInput.value, '100'],
    ]) {
      if (value === fallback) url.searchParams.delete(name);
      else url.searchParams.set(name, value);
    }
    history.replaceState(null, '', url);
  }
  function scheduleComposition() {
    updateUrl();
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(render, 220);
  }
  for (const [input, output] of [[bloomInput, 'bloom-size-value'], [stemInput, 'stem-length-value']]) {
    input.addEventListener('input', () => {
      document.getElementById(output).value = `${input.value}%`;
      scheduleComposition();
    });
  }
  for (const [input, output] of [[mixedSizeInput, 'mixed-size-value'], [mixedStemInput, 'mixed-stem-value'], [mixedPetalInput, 'mixed-petal-value']]) {
    input.addEventListener('input', () => {
      document.getElementById(output).value = `${input.value}%`;
      if (mode === 'mixed' && input !== mixedStemInput) scheduleComposition();
      else updateUrl();
    });
  }
  mixedStemInput.addEventListener('change', () => {
    if (mode === 'mixed') scheduleComposition();
  });
  resolutionInput.addEventListener('change', scheduleComposition);
  generateButton.addEventListener('click', () => {
    let next = newSeed();
    while (next === seed) next = newSeed();
    seed = next;
    mode = pendingMode;
    clearTimeout(controlsTimer);
    updateUrl();
    render();
  });
  downloadButton.addEventListener('click', () => {
    canvas.toBlob(blob => {
      if (!blob || disposed) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `nonflowers-${seed}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  });
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 180);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('pagehide', () => {
    disposed = true; generation++;
    clearTimeout(resizeTimer); clearTimeout(controlsTimer); cancelAnimationFrame(frame);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { disposed = false; render(); }
  });
  setTone(tone);
  render();
})();
