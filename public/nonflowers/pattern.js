/* global Prng, Noise, paper, leaf, stem, stroke, hsv, genParams */
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
  let flowers = null;
  let generation = 0;
  let resizeTimer;
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

  // Draw the original Nonflowers flower with its own sampled parameters. The
  // source's leaf() supplies 3D incremental curvature and HSV face shading;
  // genParams() supplies the original noise mask, opening and color curves.
  // Only its overall length is normalized to the meadow's flower size.
  function originalBlossom(context, x, y, radius, par) {
    const opening = Math.random();
    const count = par.flowerPetal;
    const width = radius * (.22 + (par.flowerWidth - 5) / 25 * .23);
    const length = radius * random(.86, 1.14);
    const innerLength = length * par.innerLength / par.flowerLength;
    const innerWidth = width * par.innerWidth / par.flowerWidth;
    const angle = random(0, tau);
    const facing = random(-.34, .34);
    context.save();
    context.translate(x, y);
    for (let k = 0; k < count; k++) {
      context.save();
      context.rotate(angle + k / count * tau);
      const rot = [Math.PI / 2 + facing, random(-.30, .30), 0];
      const bend = t => [par.flowerOpenCurve(t, opening), 0, 0];
      leaf({ ctx: context, flo: true, rot, len: length * random(.7, 1.3), seg: 40,
        wid: t => par.flowerShape(t) * width, vei: [0], col: par.flowerColor,
        cof: par.flowerColorCurve, ben: bend });
      if (innerLength > 1 && innerWidth > .3) {
        leaf({ ctx: context, flo: true, rot, len: innerLength * random(.8, 1.2), seg: 24,
          wid: t => Math.sin(Math.PI * t) * innerWidth, vei: [0], col: par.innerColor,
          cof: t => t, ben: bend });
      }
      context.restore();
    }
    context.restore();
  }

  // The original stem() grows a bent 3D centerline and paints three narrow
  // longitudinal color bands over its noise-shaped width. Rotate the finished
  // centerline into this meadow's planting direction, then return its real tip
  // and attachment points so flowers and shoots stay connected to the stem.
  function originalStalk(context, from, toward, par, thickness = 1) {
    const dx = toward[0] - from[0];
    const dy = toward[1] - from[1];
    const angle = Math.atan2(dx, -dy);
    const length = Math.hypot(dx, dy);
    const phase = random(0, 100);
    context.save();
    context.translate(from[0], from[1]);
    context.rotate(angle);
    const centerline = stem({ ctx: context, rot: [Math.PI / 2, 0, 0], len: length, seg: 40,
      col: { min: [72, .26, .56, .90], max: [72, .26, .56, .90] },
      wid: t => thickness * par.stemWidth * .25 *
        (Math.pow(Math.sin(t * Math.PI / 2 + Math.PI / 2), .5) * Noise.noise(t * 10, phase) * .5 + .5),
      ben: t => [
        (Noise.noise(t, phase) * 2 - 1) * t * par.stemBend,
        0,
        (Noise.noise(t, phase + Math.PI) * 2 - 1) * t * par.stemBend,
      ],
    });
    context.restore();
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const points = centerline.map(point => [from[0] + point[0] * ca - point[1] * sa,
      from[1] + point[0] * sa + point[1] * ca]);
    return { points, tip: points[points.length - 1] };
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

  function plant(context, item, height, stats) {
    const { x, y, size, kind, color, depth } = item;
    const root = [x + random(-175, 175), height + random(30, 170)];
    const original = item.variant === 'original';
    const par = original ? genParams({ silent: true }) : null;
    context.globalAlpha = .68 + depth * .3;
    let points;
    let flowerPoint = [x, y];
    if (original) {
      const generated = originalStalk(context, root, flowerPoint, par);
      points = generated.points;
      flowerPoint = generated.tip;
      stats.originalStems++;
    } else {
      points = curve(root, [x, y + (kind === 'umbel' ? size * .5 : 0)], random(-75, 75));
      stalk(context, points, random(.75, 1.4) * (kind === 'umbel' ? .7 : 1));
    }
    const count = Math.floor(random(3, 7));
    for (let j = 0; j < count; j++) {
      const i = Math.floor(random(5, 29));
      const side = j % 2 ? 1 : -1;
      const point = points[i];
      foliage(context, point[0], point[1], side * random(.45, 1.1), random(19, 49), !original && kind !== 'blue' && Math.random() < .7);
      if (j < 2 && kind !== 'umbel' && point[1] < height * .93) {
        const tip = [point[0] + side * random(16, 40), point[1] - random(26, 65)];
        const budTip = original ? originalStalk(context, point, tip, par, .48).tip : tip;
        if (original) stats.originalStems++;
        else stalk(context, curve(point, tip, side * 6, 16), .6);
        context.fillStyle = ink(color, .7);
        context.beginPath(); context.ellipse(budTip[0], budTip[1], 2.5, 5, side * .35, 0, tau); context.fill();
      }
    }
    context.globalAlpha = .85 + depth * .15;
    if (kind === 'umbel') umbel(context, x, y, size, color);
    else if (original) originalBlossom(context, flowerPoint[0], flowerPoint[1], size, par);
    else blossom(context, x, y, size, color, random(.50, 1), Math.random() < .24);
    context.globalAlpha = 1;
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
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3200000 / (cssWidth * cssHeight)));
    const width = Math.round(cssWidth * ratio);
    const height = Math.round(cssHeight * ratio);
    const working = document.createElement('canvas');
    working.width = width; working.height = height;
    const painter = working.getContext('2d');
    const worldHeight = 1100;
    const worldWidth = worldHeight * cssWidth / cssHeight;
    painter.scale(width / worldWidth, height / worldHeight);
    Prng.s = seed;
    const items = [];
    const stats = { originalStems: 0 };
    let originalCount = 0;
    let vintageCount = 0;
    const columns = Math.max(5, Math.min(26, Math.round(worldWidth / 73)));
    // Stratified jitter avoids both a rigid repeat and large accidental holes.
    // The tallest layer is airy; lower layers gain larger, more crowded blooms.
    for (let row = 0; row < 7; row++) {
      for (let col = -1; col <= columns; col++) {
        const depth = row / 6;
        const x = (col + random(.05, .95)) / columns * worldWidth;
        const y = 110 + row * 157 + random(-72, 72);
        const isUmbel = Math.random() < .43;
        const color = isUmbel ? pick([[34, .26, .96], [20, .42, .88], [10, .57, .84]]) : pick(palettes);
        const variant = mode === 'mixed' && !isUmbel && Math.random() < .5 ? 'original' : 'vintage';
        if (!isUmbel) { if (variant === 'original') originalCount++; else vintageCount++; }
        items.push({ x, y, depth, kind: isUmbel ? 'umbel' : color[0] > 200 && color[0] < 300 ? 'blue' : 'cosmos',
          size: isUmbel ? random(26, 48) : random(27, 43) * (.85 + depth * .45), color, variant });
        if (row > 1 && Math.random() < .7) items.push({ x: x + random(-40, 40), y: y + random(35, 80), depth,
          kind: 'umbel', size: random(15, 29), color: pick([[32, .30, .97], [15, .39, .9]]) });
      }
    }
    // Even an extreme random draw must still visibly contain both styles.
    if (mode === 'mixed' && originalCount === 0) {
      const flower = items.find(item => item.kind !== 'umbel');
      if (flower) { flower.variant = 'original'; originalCount++; vintageCount--; }
    }
    if (mode === 'mixed' && vintageCount === 0) {
      const flower = items.find(item => item.kind !== 'umbel' && item.variant === 'original');
      if (flower) { flower.variant = 'vintage'; vintageCount++; originalCount--; }
    }
    try {
      for (let i = 0; i < items.length; i++) {
        if (id !== generation || disposed) return;
        plant(painter, items[i], worldHeight, stats);
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (id !== generation || disposed) return;
      // Wear the pigment itself, so the selected paper tone appears in flecks.
      painter.setTransform(1, 0, 0, 1, 0, 0);
      painter.globalCompositeOperation = 'destination-out';
      painter.globalAlpha = .43;
      painter.fillStyle = painter.createPattern(wear, 'repeat');
      painter.fillRect(0, 0, width, height);
      canvas.width = width; canvas.height = height;
      if (flowers) { flowers.width = flowers.height = 1; }
      flowers = working;
      compose();
      document.getElementById('edition').value = seed.toString(16).toUpperCase().padStart(8, '0');
      canvas.dataset.seed = String(seed);
      canvas.dataset.mode = mode;
      canvas.dataset.originalFlowers = String(originalCount);
      canvas.dataset.originalStems = String(stats.originalStems);
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
    input.addEventListener('change', event => { pendingMode = event.target.value; });
  });
  generateButton.addEventListener('click', () => {
    let next = newSeed();
    while (next === seed) next = newSeed();
    seed = next;
    mode = pendingMode;
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    if (mode === 'mixed') url.searchParams.set('mode', 'mixed');
    else url.searchParams.delete('mode');
    history.replaceState(null, '', url);
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
    clearTimeout(resizeTimer); cancelAnimationFrame(frame);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { disposed = false; render(); }
  });
  setTone(tone);
  render();
})();
