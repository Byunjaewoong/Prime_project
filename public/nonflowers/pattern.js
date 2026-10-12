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
  const mixedGenerateButton = document.getElementById('mixed-regenerate');
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
  const queryMixedSeed = Number(query.get('mixedSeed'));
  let mixedSeed = Number.isSafeInteger(queryMixedSeed) && queryMixedSeed > 1 && queryMixedSeed <= 0xffffffff
    ? queryMixedSeed : 2 + ((seed ^ 0x6d2b79f5) >>> 0) % 4294967293;
  const mixedDepthFor = flowerSeed => Math.round((.15 + (((flowerSeed ^ 0xa511e9b3) >>> 0) / 4294967296) * .7) * 1000) / 1000;
  const makeMixedFlower = (flowerSeed, size, stem, petal, depth = mixedDepthFor(flowerSeed)) =>
    ({ seed: flowerSeed, size, stem, petal, depth });
  const savedMix = query.get('mix');
  const parsedMix = savedMix?.split(';').map(entry => {
    const parts = entry.split(',');
    if (parts.length !== 5 || parts.some(part => !/^[0-9a-z]+$/i.test(part))) return null;
    const [flowerSeed, size, stem, petal, depth] = parts.map(part => parseInt(part, 36));
    if (!Number.isSafeInteger(flowerSeed) || flowerSeed < 2 || flowerSeed > 0xffffffff ||
        size < 40 || size > 120 || stem < 80 || stem > 400 || petal < 60 || petal > 180 ||
        depth < 0 || depth > 1000) return null;
    return makeMixedFlower(flowerSeed, size, stem, petal, depth / 1000);
  });
  let mixedFlowers = parsedMix?.length && parsedMix.every(Boolean) ? parsedMix : [];
  let mode = ['vintage', 'pattern'].includes(query.get('mode')) ? query.get('mode') : 'mixed';
  let pendingMode = mode;
  const vintageToggle = document.getElementById('show-vintage');
  let showVintage = query.has('vintage') ? query.get('vintage') === '1' : mode === 'vintage';
  vintageToggle.checked = showVintage;
  document.querySelector(`input[name="flower-mode"][value="${mode}"]`).checked = true;
  const bloomInput = document.getElementById('bloom-size');
  const stemInput = document.getElementById('stem-length');
  const resolutionInput = document.getElementById('resolution');
  const vintageControls = document.getElementById('vintage-controls');
  const mixedControls = document.getElementById('mixed-controls');
  const patternControls = document.getElementById('pattern-controls');
  const patternGenerateButton = document.getElementById('pattern-regenerate');
  const patternSizeInput = document.getElementById('pattern-size');
  const patternStemInput = document.getElementById('pattern-stem');
  const patternSpacingInput = document.getElementById('pattern-spacing');
  const patternRatioInput = document.getElementById('pattern-ratio');
  const mixedSizeInput = document.getElementById('mixed-size');
  const mixedStemInput = document.getElementById('mixed-stem');
  const mixedPetalInput = document.getElementById('mixed-petal');
  const mixedDepthInput = document.getElementById('mixed-depth');
  const readPercent = (name, fallback, min, max) => {
    const value = query.has(name) ? Number(query.get(name)) : NaN;
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  bloomInput.value = String(readPercent('bloom', 85, 50, 140));
  stemInput.value = String(readPercent('stem', 115, 95, 145));
  mixedSizeInput.value = String(readPercent('mixedSize', 50, 40, 120));
  mixedStemInput.value = String(readPercent('mixedStem', 120, 80, 400));
  mixedPetalInput.value = String(readPercent('mixedPetal', 100, 60, 180));
  patternSizeInput.value = String(readPercent('patternSize', 40, 25, 100));
  patternStemInput.value = String(readPercent('patternStem', 30, 20, 200));
  patternSpacingInput.value = String(readPercent('patternSpacing', 20, 0, 80));
  patternRatioInput.value = String(readPercent('patternRatio', 100, 0, 100));
  if (mixedFlowers.length) {
    const latest = mixedFlowers.at(-1);
    mixedSeed = latest.seed;
    mixedSizeInput.value = String(latest.size);
    mixedStemInput.value = String(latest.stem);
    mixedPetalInput.value = String(latest.petal);
    mixedDepthInput.value = String(Math.round(latest.depth * 100));
  } else {
    mixedFlowers = [makeMixedFlower(mixedSeed, Number(mixedSizeInput.value), Number(mixedStemInput.value), Number(mixedPetalInput.value))];
    mixedDepthInput.value = String(Math.round(mixedFlowers[0].depth * 100));
  }
  resolutionInput.value = ['1', '1.5', '2'].includes(query.get('quality')) ? query.get('quality') : '2';
  document.getElementById('bloom-size-value').value = `${bloomInput.value}%`;
  document.getElementById('stem-length-value').value = `${stemInput.value}%`;
  for (const [input, output] of [[mixedSizeInput, 'mixed-size-value'], [mixedStemInput, 'mixed-stem-value'], [mixedPetalInput, 'mixed-petal-value'], [mixedDepthInput, 'mixed-depth-value']]) {
    document.getElementById(output).value = `${input.value}%`;
  }
  document.getElementById('pattern-size-value').value = `${patternSizeInput.value}%`;
  document.getElementById('pattern-stem-value').value = `${patternStemInput.value}%`;
  document.getElementById('pattern-spacing-value').value = patternSpacingInput.value;
  document.getElementById('pattern-ratio-value').value = `${patternRatioInput.value} : ${100 - Number(patternRatioInput.value)}`;
  mixedControls.hidden = pendingMode !== 'mixed';
  vintageControls.hidden = pendingMode !== 'vintage';
  patternControls.hidden = pendingMode !== 'pattern';
  let flowers = null;
  let generation = 0;
  let resizeTimer;
  let controlsTimer;
  let frame = 0;
  let disposed = false;
  const originalCache = new Map();
  const patternCache = new Map();
  const vintageCache = new Map();
  let vintageCacheSignature = '';
  let vintageCachePixels = 0;

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
    let painted = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      const alpha = pixels[i];
      if (alpha === 0) continue;
      if (alpha > 48) painted++;
      const coverage = Math.min(1, alpha / 72);
      pixels[i] = Math.round(255 * coverage * coverage * (3 - 2 * coverage));
    }
    context.putImageData(image, 0, 0);
    return painted;
  }

  // Keep the expensive original geometry as a cropped transparent sprite.
  // A new flower does not regenerate plants already present in the scene.
  function originalPlant(worldWidth, worldHeight, flower, flowersOnly = false) {
    const par = genParams({ silent: true });
    const kind = flowersOnly ? 'herbal' : Math.random() <= .5 ? 'woody' : 'herbal';
    const stemScale = flower.stem / 100;
    const petalScale = flower.petal / 100;
    const sourceSize = Math.min(1600, Math.ceil(800 + Math.max(0, stemScale - 1) * 1000 + Math.max(0, petalScale - 1) * 100));
    const source = Layer.empty(sourceSize);
    par.flowerLength *= petalScale;
    par.innerLength *= petalScale;
    if (flowersOnly) {
      // Select fuller examples of the *same* generated flower layer. Tiny
      // blossoms looked like isolated specks after their branch was removed.
      par.flowerLength = Math.max(par.flowerLength, 20);
      par.flowerWidth = Math.max(par.flowerWidth, 11);
      par.flowerChance = Math.max(par.flowerChance, .16);
    }
    let geometryScale;
    if (kind === 'woody') geometryScale = woody({ ctx: source, xof: sourceSize / 2, yof: sourceSize - 50, PAR: par, branchLength: 400 * stemScale, flowersOnly });
    else {
      par.stemLength *= stemScale;
      geometryScale = herbal({ ctx: source, xof: sourceSize / 2, yof: sourceSize, PAR: par, adaptiveCanvas: true, flowersOnly });
    }
    const painted = solidifyPigment(source);
    const bounds = Layer.bound(source);
    if (bounds.xmax < bounds.xmin || bounds.ymax < bounds.ymin || (flowersOnly && painted < 1200)) {
      source.canvas.width = source.canvas.height = 1;
      throw new Error('Original Nonflowers plant has no visible pixels');
    }
    const width = bounds.xmax - bounds.xmin + 1;
    const height = bounds.ymax - bounds.ymin + 1;
    // Fitting each longer stem to the viewport made unrelated petals and leaves
    // shrink. Keep the camera fixed and undo the bounded internal raster scale.
    const scale = Math.min(worldHeight * .80 / 850, worldWidth * .78 / 350, 2.2)
      * flower.size / 100 / geometryScale;
    const centerX = worldWidth * random(.16, .84);
    const baseY = worldHeight + random(5, 65);
    const sprite = document.createElement('canvas');
    sprite.width = width; sprite.height = height;
    sprite.getContext('2d').drawImage(source.canvas, bounds.xmin, bounds.ymin, width, height, 0, 0, width, height);
    source.canvas.width = source.canvas.height = 1;
    return { canvas: sprite, kind, x: centerX - width * scale / 2, y: baseY - height * scale, width: width * scale, height: height * scale };
  }

  const originalKey = (flower, worldWidth, worldHeight) =>
    `${flower.seed}:${flower.size}:${flower.stem}:${flower.petal}:${worldWidth}:${worldHeight}`;

  // Pack against painted silhouettes, including the spaces between petals and
  // bent branches. The second pass uses those spaces instead of a regular grid.
  async function drawPattern(painter, worldWidth, worldHeight, id) {
    const cell = 5;
    const cols = Math.ceil(worldWidth / cell);
    const rows = Math.ceil(worldHeight / cell);
    const occupied = new Uint8Array(cols * rows);
    const distance = new Uint16Array(cols * rows);
    const spacing = Number(patternSpacingInput.value);
    const spacingCells = spacing / cell;
    const coverageRadius = Math.max(3, Math.round((spacing + 8) / cell * 10));
    const size = Number(patternSizeInput.value);
    const stem = Number(patternStemInput.value);
    const stemRatio = Number(patternRatioInput.value) / 100;
    const maxCount = Math.max(70, Math.min(220, Math.ceil(worldWidth * worldHeight / 8500)));
    const motifPoolSize = 28;
    let coverage = 0;
    let hasPainted = false;
    const rand = (() => {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
    })();
    const variants = new Map();
    const activeKeys = new Set();
    const failedKeys = new Set();
    const placements = [];
    let frontier = [];
    let generated = 0;

    async function prototype(kind, index) {
      // Keep a varied, bounded motif pool so filling a large screen does not
      // allocate hundreds of full-size original plant rasters.
      const motifIndex = index % motifPoolSize;
      for (let attempt = 0; attempt < 4; attempt++) {
        const flowerSeed = 2 + ((seed + Math.imul(motifIndex + 1, 0x9e3779b9)
          + Math.imul(attempt, 0x85ebca6b) + (kind === 'head' ? 0x41c64e6d : 0)) >>> 0) % 4294967293;
        const sizeJitter = (Math.imul(flowerSeed ^ (flowerSeed >>> 16), 0x85ebca6b) >>> 0) / 4294967296;
        const flower = { seed: flowerSeed,
          size: kind === 'head' ? Math.max(24, Math.round(size * (.75 + .18 * sizeJitter))) : size,
          stem, petal: 100 };
        const key = `${kind}:${originalKey(flower, worldWidth, worldHeight)}`;
        if (failedKeys.has(key)) continue;
        let sprite = patternCache.get(key);
        if (!sprite) {
          Prng.s = flowerSeed;
          try {
            sprite = originalPlant(worldWidth, worldHeight, flower, kind === 'head');
          } catch (error) {
            if (kind === 'head' && error.message === 'Original Nonflowers plant has no visible pixels') {
              failedKeys.add(key);
              continue;
            }
            throw error;
          }
          patternCache.set(key, sprite);
          generated++;
          if (generated % 2 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        return { sprite, key };
      }
      return null;
    }

    function variant(sprite, key, turn) {
      const cacheKey = `${key}:${turn}`;
      if (variants.has(cacheKey)) return variants.get(cacheKey);
      const angle = turn * Math.PI / 6;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const w = Math.ceil((Math.abs(cosine) * sprite.width + Math.abs(sine) * sprite.height) / cell) + 2;
      const h = Math.ceil((Math.abs(sine) * sprite.width + Math.abs(cosine) * sprite.height) / cell) + 2;
      const mask = document.createElement('canvas');
      mask.width = w; mask.height = h;
      const context = mask.getContext('2d', { willReadFrequently: true });
      context.translate(w / 2, h / 2);
      context.rotate(angle);
      context.drawImage(sprite.canvas, -sprite.width / (2 * cell), -sprite.height / (2 * cell),
        sprite.width / cell, sprite.height / cell);
      const pixels = context.getImageData(0, 0, w, h).data;
      const points = [];
      const painted = new Uint8Array(w * h);
      let massX = 0, massY = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (pixels[(y * w + x) * 4 + 3] > 8) {
          painted[y * w + x] = 1;
          points.push([x, y]);
          massX += x; massY += y;
        }
      }
      const rim = points.filter(([x, y]) => x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !painted[y * w + x - 1] || !painted[y * w + x + 1] ||
        !painted[(y - 1) * w + x] || !painted[(y + 1) * w + x]);
      mask.width = mask.height = 1;
      const stride = Math.max(1, Math.floor(points.length / 96));
      const samples = points.filter((_, index) => index % stride === 0);
      const centroid = points.length ? [Math.round(massX / points.length), Math.round(massY / points.length)] : [Math.floor(w / 2), Math.floor(h / 2)];
      const result = { angle, w, h, points, rim, samples, centroid };
      variants.set(cacheKey, result);
      return result;
    }

    function fits(shape, left, top) {
      let inside = 0;
      for (const [x, y] of shape.points) {
        const gx = left + x, gy = top + y;
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
        if (occupied[gy * cols + gx]) return null;
        inside++;
      }
      if (inside < shape.points.length * .66) return null;
      let totalGap = 0, far = 0, sampled = 0;
      for (const [x, y] of shape.samples) {
        const gx = left + x, gy = top + y;
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) continue;
        const gap = hasPainted ? distance[gy * cols + gx] : coverageRadius;
        totalGap += gap;
        if (gap > coverageRadius) far++;
        sampled++;
      }
      if (!sampled) return null;
      const cx = left + shape.centroid[0], cy = top + shape.centroid[1];
      const centerGap = hasPainted && cx >= 0 && cx < cols && cy >= 0 && cy < rows
        ? distance[cy * cols + cx] : totalGap / sampled;
      return { inside, meanGap: (totalGap / sampled * .8 + centerGap * .2) / 10,
        newArea: far / sampled };
    }

    function reserve(shape, left, top) {
      for (const [x, y] of shape.points) {
        const gx = left + x, gy = top + y;
        if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) occupied[gy * cols + gx] = 1;
      }
      hasPainted = true;
      distance.fill(65535);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (occupied[i]) { distance[i] = 0; continue; }
        let value = distance[i];
        if (x > 0) value = Math.min(value, distance[i - 1] + 10);
        if (y > 0) {
          value = Math.min(value, distance[i - cols] + 10);
          if (x > 0) value = Math.min(value, distance[i - cols - 1] + 14);
          if (x + 1 < cols) value = Math.min(value, distance[i - cols + 1] + 14);
        }
        distance[i] = value;
      }
      let covered = 0;
      for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
        const i = y * cols + x;
        let value = distance[i];
        if (x + 1 < cols) value = Math.min(value, distance[i + 1] + 10);
        if (y + 1 < rows) {
          value = Math.min(value, distance[i + cols] + 10);
          if (x > 0) value = Math.min(value, distance[i + cols - 1] + 14);
          if (x + 1 < cols) value = Math.min(value, distance[i + cols + 1] + 14);
        }
        distance[i] = value;
        if (value <= coverageRadius) covered++;
      }
      coverage = covered / distance.length;
      frontier = [];
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
        const position = y * cols + x;
        if (!occupied[position] && (occupied[position - 1] || occupied[position + 1] ||
          occupied[position - cols] || occupied[position + cols])) frontier.push([x, y]);
      }
    }

    async function fillPattern() {
      const nextIndex = { stem: 0, head: 0 };
      let stemmed = 0;
      let consecutiveMisses = 0;
      for (let slot = 0; slot < maxCount && (placements.length < 12 || coverage < .9); slot++) {
        if (id !== generation || disposed) return;
        const kind = stemRatio === 1 || (stemRatio > 0 && stemmed / Math.max(1, placements.length) < stemRatio) ? 'stem' : 'head';
        const index = nextIndex[kind]++;
        const item = await prototype(kind, index);
        if (!item) {
          if (++consecutiveMisses >= 10) break;
          continue;
        }
        const { sprite, key } = item;
        let best = null;
        for (let trial = 0; trial < 180; trial++) {
          const turn = Math.floor(rand() * 12);
          const shape = variant(sprite, key, turn);
          if (!shape.points.length) continue;
          let left, top;
          if (frontier.length && shape.rim.length && rand() < .4) {
            const [edgeX, edgeY] = frontier[Math.floor(rand() * frontier.length)];
            const [rimX, rimY] = shape.rim[Math.floor(rand() * shape.rim.length)];
            left = edgeX - rimX + Math.floor(rand() * 5) - 2;
            top = edgeY - rimY + Math.floor(rand() * 5) - 2;
          } else {
            left = Math.round(rand() * (cols + shape.w * .25) - shape.w * .62);
            top = Math.round(rand() * (rows + shape.h * .25) - shape.h * .62);
          }
          const fit = fits(shape, left, top);
          if (!fit) continue;
          // Spacing is a mean over the painted area and its center of mass.
          // Favor uncovered regions while keeping motifs around the requested gap.
          const targetGap = spacingCells + Math.sqrt(shape.points.length / Math.PI) * .32;
          const score = Math.exp(-Math.abs(fit.meanGap - targetGap) / Math.max(2, targetGap)) * .55 +
            fit.newArea * .35 + fit.inside / shape.points.length * .1 + rand() * .015;
          if (!best || score > best.score) best = { shape, left, top, score, sprite, kind };
        }
        if (best) {
          reserve(best.shape, best.left, best.top);
          placements.push(best);
          activeKeys.add(key);
          if (kind === 'stem') stemmed++;
          consecutiveMisses = 0;
        } else {
          consecutiveMisses++;
          if (consecutiveMisses >= 10) break;
        }
        if (slot % 3 === 2) await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    await fillPattern();
    if (id !== generation || disposed) return null;
    for (const item of placements) {
      painter.save();
      painter.translate((item.left + item.shape.w / 2) * cell, (item.top + item.shape.h / 2) * cell);
      painter.rotate(item.shape.angle);
      painter.drawImage(item.sprite.canvas, -item.sprite.width / 2, -item.sprite.height / 2,
        item.sprite.width, item.sprite.height);
      painter.restore();
    }
    for (const [key, sprite] of patternCache) if (!activeKeys.has(key)) {
      sprite.canvas.width = sprite.canvas.height = 1;
      patternCache.delete(key);
    }
    return { count: placements.length, stemmed: placements.filter(item => item.kind === 'stem').length,
      heads: placements.filter(item => item.kind === 'head').length, generated, coverage };
  }

  function drawSprite(context, sprite) {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(sprite.canvas, sprite.x, sprite.y);
    context.restore();
  }

  function drawVintage(context, item, width, height, worldWidth, worldHeight, cacheLimit) {
    const cached = vintageCache.get(item.cacheId);
    if (cached) { drawSprite(context, cached); return true; }
    Prng.s = item.paintSeed;
    if (item.kind === 'umbel' || vintageCachePixels >= cacheLimit) {
      plant(context, item, worldHeight);
      return false;
    }
    const scaleX = width / worldWidth;
    const scaleY = height / worldHeight;
    const x = Math.max(0, Math.floor((item.x - 320) * scaleX));
    const y = Math.max(0, Math.floor((item.y - 160) * scaleY));
    const right = Math.min(width, Math.ceil((item.x + 320) * scaleX));
    const boundsWidth = right - x;
    const boundsHeight = height - y;
    if (boundsWidth <= 0 || boundsHeight <= 0) return false;
    const temp = document.createElement('canvas');
    temp.width = boundsWidth; temp.height = boundsHeight;
    const tempContext = temp.getContext('2d', { willReadFrequently: true });
    tempContext.setTransform(scaleX, 0, 0, scaleY, -x, -y);
    plant(tempContext, item, worldHeight);
    const data = tempContext.getImageData(0, 0, boundsWidth, boundsHeight).data;
    let left = boundsWidth, top = boundsHeight, bottom = -1, edge = -1;
    for (let row = 0; row < boundsHeight; row++) {
      for (let col = 0; col < boundsWidth; col++) {
        if (data[(row * boundsWidth + col) * 4 + 3] === 0) continue;
        if (col < left) left = col;
        if (col > edge) edge = col;
        if (row < top) top = row;
        if (row > bottom) bottom = row;
      }
    }
    if (bottom < 0) { temp.width = temp.height = 1; return false; }
    const sprite = { canvas: document.createElement('canvas'), x: x + left, y: y + top };
    sprite.canvas.width = edge - left + 1;
    sprite.canvas.height = bottom - top + 1;
    sprite.canvas.getContext('2d').drawImage(temp, left, top, sprite.canvas.width, sprite.canvas.height,
      0, 0, sprite.canvas.width, sprite.canvas.height);
    temp.width = temp.height = 1;
    drawSprite(context, sprite);
    const pixels = sprite.canvas.width * sprite.canvas.height;
    if (vintageCachePixels + pixels <= cacheLimit) {
      vintageCache.set(item.cacheId, sprite);
      vintageCachePixels += pixels;
    } else sprite.canvas.width = sprite.canvas.height = 1;
    return false;
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
    generateButton.disabled = mixedGenerateButton.disabled = patternGenerateButton.disabled = downloadButton.disabled = true;
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
    const cacheSignature = `${seed}:${bloomScale}:${stemScale}:${width}:${height}`;
    if (cacheSignature !== vintageCacheSignature) {
      for (const sprite of vintageCache.values()) sprite.canvas.width = sprite.canvas.height = 1;
      vintageCache.clear();
      vintageCachePixels = 0;
      vintageCacheSignature = cacheSignature;
    }
    const vintageCacheLimit = cssWidth < 700 ? 16000000 : 32000000;
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
        const depth = Math.max(0, Math.min(1, (row + random(-.35, .35)) / 6));
        const x = (col + random(.05, .95)) / columns * worldWidth;
        const y = 160 + row * 180 / stemScale + random(-72, 72);
        const isUmbel = Math.random() < .43;
        const color = isUmbel ? pick([[34, .26, .96], [20, .42, .88], [10, .57, .84]]) : pick(palettes);
        if (!isUmbel) vintageCount++;
        items.push({ x, y, depth, kind: isUmbel ? 'umbel' : color[0] > 200 && color[0] < 300 ? 'blue' : 'cosmos',
          size: (isUmbel ? random(26, 48) : random(27, 43) * (.85 + depth * .45)) * bloomScale, color });
        if (row > 1 && Math.random() < .7) items.push({ x: x + random(-40, 40), y: y + random(35, 80), depth: Math.max(0, Math.min(1, depth + random(-.08, .08))),
          kind: 'umbel', size: random(15, 29) * bloomScale, color: pick([[32, .30, .97], [15, .39, .9]]) });
      }
    }
    // Each vintage plant has its own depth and random stream. Changing the
    // original flower or hiding the meadow cannot change vintage silhouettes.
    items.forEach((item, index) => {
      item.cacheId = index;
      item.paintSeed = 2 + ((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0) % 4294967293;
    });
    const currentMixedFlowers = mode === 'mixed' ? mixedFlowers.map(flower => ({ ...flower })) : [];
    const mixedDepth = currentMixedFlowers.at(-1)?.depth;
    const layers = [
      ...(showVintage && mode !== 'pattern' ? items.map(item => ({ type: 'vintage', depth: item.depth, item })) : []),
      ...currentMixedFlowers.map(flower => ({ type: 'mixed', depth: flower.depth, flower })),
    ].sort((a, b) => a.depth - b.depth);
    let vintageBehind = 0;
    let vintageFront = 0;
    let generatedOriginals = 0;
    let reusedOriginals = 0;
    let reusedVintage = 0;
    let originalMs = 0;
    let vintageMs = 0;
    try {
      const patternStats = mode === 'pattern' ? await drawPattern(painter, worldWidth, worldHeight, id) : null;
      if (id !== generation || disposed) return;
      if (mode !== 'pattern') {
        for (const sprite of patternCache.values()) sprite.canvas.width = sprite.canvas.height = 1;
        patternCache.clear();
      }
      for (let i = 0; i < layers.length; i++) {
        if (id !== generation || disposed) return;
        const layer = layers[i];
        if (layer.type === 'mixed') {
          const start = performance.now();
          const key = originalKey(layer.flower, worldWidth, worldHeight);
          let sprite = originalCache.get(key);
          if (sprite) reusedOriginals++;
          else {
            Prng.s = layer.flower.seed;
            sprite = originalPlant(worldWidth, worldHeight, layer.flower);
            originalCache.set(key, sprite);
            generatedOriginals++;
          }
          painter.drawImage(sprite.canvas, sprite.x, sprite.y, sprite.width, sprite.height);
          originalKind = sprite.kind;
          originalMs += performance.now() - start;
        } else {
          const start = performance.now();
          if (drawVintage(painter, layer.item, width, height, worldWidth, worldHeight, vintageCacheLimit)) reusedVintage++;
          vintageMs += performance.now() - start;
          if (layer.depth >= mixedDepth) vintageFront++;
          else vintageBehind++;
        }
        if (i % 4 === 3) await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (id !== generation || disposed) return;
      const activeKeys = new Set(currentMixedFlowers.map(flower => originalKey(flower, worldWidth, worldHeight)));
      for (const [key, sprite] of originalCache) {
        if (!activeKeys.has(key)) {
          sprite.canvas.width = sprite.canvas.height = 1;
          originalCache.delete(key);
        }
      }
      canvas.width = width; canvas.height = height;
      if (flowers) { flowers.width = flowers.height = 1; }
      flowers = working;
      compose();
      document.getElementById('edition').value = seed.toString(16).toUpperCase().padStart(8, '0');
      canvas.dataset.seed = String(seed);
      canvas.dataset.mode = mode;
      canvas.dataset.originalPlants = String(currentMixedFlowers.length);
      canvas.dataset.generatedOriginals = String(generatedOriginals);
      canvas.dataset.reusedOriginals = String(reusedOriginals);
      canvas.dataset.reusedVintage = String(reusedVintage);
      canvas.dataset.originalMs = String(Math.round(originalMs));
      canvas.dataset.vintageMs = String(Math.round(vintageMs));
      canvas.dataset.originalKind = originalKind;
      canvas.dataset.vintageFlowers = String(showVintage && mode !== 'pattern' ? vintageCount : 0);
      canvas.dataset.vintageVisible = String(showVintage && mode !== 'pattern');
      canvas.dataset.vintageBehind = String(vintageBehind);
      canvas.dataset.vintageFront = String(vintageFront);
      canvas.dataset.mixedDepth = mode === 'mixed' ? mixedDepth.toFixed(4) : '';
      canvas.dataset.mixedDepths = currentMixedFlowers.map(flower => flower.depth.toFixed(4)).join(',');
      canvas.dataset.mixedSeed = mode === 'mixed' ? String(mixedSeed) : '';
      canvas.dataset.patternCount = String(patternStats?.count || 0);
      canvas.dataset.patternStemmed = String(patternStats?.stemmed || 0);
      canvas.dataset.patternHeads = String(patternStats?.heads || 0);
      canvas.dataset.patternGenerated = String(patternStats?.generated || 0);
      canvas.dataset.patternCoverage = patternStats ? patternStats.coverage.toFixed(3) : '0';
      document.getElementById('pattern-count').value = patternStats
        ? `${patternStats.count} · ${patternStats.stemmed} stemmed / ${patternStats.heads} flowers · ${Math.round(patternStats.coverage * 100)}% area` : '0';
      document.getElementById('mixed-edition-row').hidden = mode !== 'mixed';
      document.getElementById('mixed-edition').value = mixedSeed.toString(16).toUpperCase().padStart(8, '0');
      document.getElementById('mixed-count').value = String(currentMixedFlowers.length);
      status.hidden = true;
      downloadButton.disabled = false;
    } catch (error) {
      console.error('Nonflowers composition failed', error);
      status.textContent = '생성을 완료하지 못했습니다. 메뉴에서 다시 생성해 주세요.';
      downloadButton.disabled = !flowers;
    } finally {
      if (working !== flowers) working.width = working.height = 1;
      if (id === generation) {
        generateButton.disabled = mixedGenerateButton.disabled = patternGenerateButton.disabled = false;
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
    if (open) { menu.scrollTop = 0; mixedGenerateButton.focus(); }
    else toggle.focus();
  }
  toggle.addEventListener('click', () => setMenu(menu.hidden));
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
      vintageControls.hidden = pendingMode !== 'vintage';
      patternControls.hidden = pendingMode !== 'pattern';
      if (pendingMode === 'vintage') {
        showVintage = vintageToggle.checked = true;
      }
    });
  });
  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    if (mode === 'mixed' || mode === 'pattern') url.searchParams.set('mode', mode);
    else url.searchParams.delete('mode');
    if (mode === 'mixed') url.searchParams.set('mixedSeed', String(mixedSeed));
    else url.searchParams.delete('mixedSeed');
    if (mode === 'mixed') {
      url.searchParams.set('mix', mixedFlowers.map(flower =>
        [flower.seed, flower.size, flower.stem, flower.petal, Math.round(flower.depth * 1000)]
          .map(value => value.toString(36)).join(',')).join(';'));
    } else url.searchParams.delete('mix');
    if (showVintage) url.searchParams.set('vintage', '1');
    else if (mode === 'vintage') url.searchParams.set('vintage', '0');
    else url.searchParams.delete('vintage');
    for (const [name, value, fallback] of [
      ['bloom', bloomInput.value, '85'], ['stem', stemInput.value, '115'], ['quality', resolutionInput.value, '2'],
      ['mixedSize', mixedSizeInput.value, '50'], ['mixedStem', mixedStemInput.value, '120'], ['mixedPetal', mixedPetalInput.value, '100'],
      ['patternSize', patternSizeInput.value, '40'], ['patternStem', patternStemInput.value, '30'],
      ['patternSpacing', patternSpacingInput.value, '20'], ['patternRatio', patternRatioInput.value, '100'],
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
  for (const [input, output] of [[mixedSizeInput, 'mixed-size-value'], [mixedStemInput, 'mixed-stem-value'], [mixedPetalInput, 'mixed-petal-value'], [mixedDepthInput, 'mixed-depth-value']]) {
    input.addEventListener('input', () => {
      document.getElementById(output).value = `${input.value}%`;
      const latest = mixedFlowers.at(-1);
      if (input === mixedSizeInput) latest.size = Number(input.value);
      if (input === mixedStemInput) latest.stem = Number(input.value);
      if (input === mixedPetalInput) latest.petal = Number(input.value);
      if (input === mixedDepthInput) latest.depth = Number(input.value) / 100;
      if (mode === 'mixed' && input !== mixedStemInput) scheduleComposition();
      else updateUrl();
    });
  }
  mixedStemInput.addEventListener('change', () => {
    if (mode === 'mixed') scheduleComposition();
  });
  for (const [input, output] of [[patternSizeInput, 'pattern-size-value'], [patternStemInput, 'pattern-stem-value'], [patternSpacingInput, 'pattern-spacing-value'], [patternRatioInput, 'pattern-ratio-value']]) {
    input.addEventListener('input', () => {
      document.getElementById(output).value = input === patternRatioInput
        ? `${input.value} : ${100 - Number(input.value)}`
        : input === patternSpacingInput ? input.value : `${input.value}%`;
      updateUrl();
    });
    input.addEventListener('change', () => { if (mode === 'pattern') scheduleComposition(); });
  }
  resolutionInput.addEventListener('change', scheduleComposition);
  vintageToggle.addEventListener('change', () => {
    showVintage = vintageToggle.checked;
    scheduleComposition();
  });
  mixedGenerateButton.addEventListener('click', () => {
    const randomStep = (min, max, step) => min + Math.floor(newSeed() / 0x100000000 * ((max - min) / step + 1)) * step;
    let next = newSeed();
    while (next === mixedSeed) next = newSeed();
    mixedSeed = next;
    mixedSizeInput.value = String(randomStep(60, 80, 5));
    mixedStemInput.value = String(randomStep(80, 400, 10));
    mixedPetalInput.value = String(randomStep(60, 180, 5));
    mixedFlowers.push(makeMixedFlower(mixedSeed, Number(mixedSizeInput.value), Number(mixedStemInput.value), Number(mixedPetalInput.value)));
    mixedDepthInput.value = String(Math.round(mixedFlowers.at(-1).depth * 100));
    for (const [input, output] of [[mixedSizeInput, 'mixed-size-value'], [mixedStemInput, 'mixed-stem-value'], [mixedPetalInput, 'mixed-petal-value'], [mixedDepthInput, 'mixed-depth-value']]) {
      document.getElementById(output).value = `${input.value}%`;
    }
    mode = pendingMode = 'mixed';
    document.querySelector('input[name="flower-mode"][value="mixed"]').checked = true;
    mixedControls.hidden = false;
    vintageControls.hidden = true;
    patternControls.hidden = true;
    clearTimeout(controlsTimer);
    updateUrl();
    render();
  });
  patternGenerateButton.addEventListener('click', () => {
    let next = newSeed();
    while (next === seed) next = newSeed();
    seed = next;
    mode = pendingMode = 'pattern';
    document.querySelector('input[name="flower-mode"][value="pattern"]').checked = true;
    mixedControls.hidden = vintageControls.hidden = true;
    patternControls.hidden = false;
    clearTimeout(controlsTimer);
    updateUrl();
    render();
  });
  generateButton.addEventListener('click', () => {
    let next = newSeed();
    while (next === seed) next = newSeed();
    seed = next;
    mixedSeed = newSeed();
    mixedFlowers = [makeMixedFlower(mixedSeed, Number(mixedSizeInput.value), Number(mixedStemInput.value), Number(mixedPetalInput.value))];
    mixedDepthInput.value = String(Math.round(mixedFlowers[0].depth * 100));
    document.getElementById('mixed-depth-value').value = `${mixedDepthInput.value}%`;
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
    for (const sprite of originalCache.values()) sprite.canvas.width = sprite.canvas.height = 1;
    originalCache.clear();
    for (const sprite of patternCache.values()) sprite.canvas.width = sprite.canvas.height = 1;
    patternCache.clear();
    for (const sprite of vintageCache.values()) sprite.canvas.width = sprite.canvas.height = 1;
    vintageCache.clear();
    vintageCachePixels = 0;
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) { disposed = false; render(); }
  });
  setTone(tone);
  render();
})();
