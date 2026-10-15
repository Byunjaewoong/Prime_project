// Independent animation and randomness: butterflies never change flower seeds.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const SHUTTER_SECONDS = 1 / 48; // 180° exposure at a virtual 24 fps.
  const EXPOSURE_SAMPLES = 5;

  window.createButterflyGarden = canvas => {
    const context = canvas.getContext('2d');
    let state = crypto.getRandomValues(new Uint32Array(1))[0];
    const random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    let targets = [], butterflies = [], frame = 0, last = 0, width = 1, height = 1;
    let sceneWidth = 1, sceneHeight = 1;

    // Four separate painted wings: warm white washes, pooled grey edges,
    // capillary veins and granulation echo the flower pigment treatment.
    function wing(hind) {
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 160;
      const ctx = sprite.getContext('2d');
      ctx.translate(14, 78);
      const path = new Path2D();
      path.moveTo(0, 0);
      if (hind) {
        path.bezierCurveTo(29, -18, 85, -8, 104, 16);
        path.bezierCurveTo(110, 38, 83, 67, 57, 65);
        path.bezierCurveTo(27, 61, 8, 27, 0, 0);
      } else {
        path.bezierCurveTo(25, -27, 51, -71, 83, -68);
        path.bezierCurveTo(105, -66, 128, -33, 122, -11);
        path.bezierCurveTo(115, 9, 57, 22, 0, 0);
      }
      path.closePath();
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = '#f6f3dd'; ctx.fillRect(-10, -80, 160, 160);
      const wash = ctx.createRadialGradient(15, 2, 0, 30, 0, 120);
      wash.addColorStop(0, '#babda1'); wash.addColorStop(.25, '#eff0d4');
      wash.addColorStop(.7, '#fffdf0'); wash.addColorStop(1, '#d9dacd');
      ctx.fillStyle = wash; ctx.fillRect(-10, -80, 160, 160);
      for (let i = 0; i < 38; i++) {
        ctx.fillStyle = i % 3 ? 'rgba(159,163,139,.035)' : 'rgba(255,255,249,.15)';
        ctx.beginPath(); ctx.ellipse(random() * 130, random() * 145 - 75,
          4 + random() * 22, 2 + random() * 12, random() * TAU, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 11; i++) {
        const endX = 38 + i * 8;
        const endY = hind ? 63 - i * 4 : -68 + i * 5;
        ctx.beginPath(); ctx.moveTo(1, 1);
        ctx.bezierCurveTo(25, endY * .1, endX * .62, endY * .8, endX, endY);
        ctx.strokeStyle = 'rgba(113,123,98,.22)'; ctx.lineWidth = .6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(endX * .62, endY * .58);
        ctx.lineTo(endX + 10, endY * .65); ctx.lineWidth = .35; ctx.stroke();
      }
      if (!hind) {
        for (let i = 0; i < 28; i++) {
          ctx.fillStyle = 'rgba(91,103,91,.035)';
          ctx.beginPath(); ctx.ellipse(102 + random() * 14, -48 + random() * 23,
            4 + random() * 11, 5 + random() * 9, -.6, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = 'rgba(105,113,91,.4)';
        ctx.beginPath(); ctx.ellipse(69, -10, 4.2, 5.8, -.2, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 2100; i++) {
        ctx.fillStyle = i % 3 ? 'rgba(113,121,99,.10)' : 'rgba(255,255,250,.45)';
        ctx.fillRect(random() * 140, random() * 155 - 78, .35 + random(), .3 + random());
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(105,119,99,.32)'; ctx.lineWidth = .8; ctx.stroke(path);
      return sprite;
    }
    const fore = wing(false), hind = wing(true);
    const poseCanvas = document.createElement('canvas');
    const exposureCanvas = document.createElement('canvas');
    const poseContext = poseCanvas.getContext('2d');
    const exposureContext = exposureCanvas.getContext('2d');
    let pixelRatio = 1;

    function resize() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      pixelRatio = ratio;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      poseCanvas.width = poseCanvas.height = exposureCanvas.width = exposureCanvas.height = Math.ceil(128 * ratio);
    }
    function counters() {
      canvas.dataset.count = String(butterflies.length);
      canvas.dataset.flying = String(butterflies.filter(b => b.state === 'flying').length);
      canvas.dataset.perched = String(butterflies.filter(b => b.state === 'perched').length);
      canvas.dataset.targets = String(targets.length);
    }
    function clear() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      butterflies = []; targets = [];
      context.clearRect(0, 0, width, height); counters();
    }
    function point(b, t) {
      const segment = Math.min(b.route.length - 2, Math.floor(t * (b.route.length - 1)));
      const u = t === 1 ? 1 : t * (b.route.length - 1) - segment;
      const a = b.route[Math.max(0, segment - 1)], c = b.route[segment];
      const d = b.route[segment + 1], e = b.route[Math.min(b.route.length - 1, segment + 2)];
      const at = key => .5 * ((2 * c[key]) + (-a[key] + d[key]) * u +
        (2 * a[key] - 5 * c[key] + 4 * d[key] - e[key]) * u * u +
        (-a[key] + 3 * c[key] - 3 * d[key] + e[key]) * u * u * u);
      return { x: at('x'), y: at('y') };
    }
    // Each waypoint is reached with the wings folded. Keep a straight glide
    // while they open, and round the corner only around that folded phase.
    function flightPoint(b, cursor) {
      const points = b.flightRoute;
      const corner = Math.round(cursor), turnWindow = .18;
      if (corner > 0 && corner < points.length - 1 && Math.abs(cursor - corner) < turnWindow) {
        const a = points[corner - 1], p = points[corner], c = points[corner + 1];
        const u = (cursor - corner + turnWindow) / (2 * turnWindow);
        const at = key => {
          const start = p[key] + (a[key] - p[key]) * turnWindow;
          const end = p[key] + (c[key] - p[key]) * turnWindow;
          return (1 - u) ** 2 * start + 2 * (1 - u) * u * p[key] + u * u * end;
        };
        return { x: at('x'), y: at('y') };
      }
      const index = Math.min(points.length - 2, Math.floor(cursor));
      const u = cursor - index, a = points[index], c = points[index + 1];
      return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
    }
    function wingOpening(b) {
      const beat = .5 + .5 * Math.sin(b.phase);
      return b.state === 'perched' ? .10 + .65 * beat ** 2.2 : .13 + .87 * beat;
    }
    function draw(b, context) {
      const perched = b.state === 'perched';
      context.save(); context.translate(b.x, b.y); context.rotate(b.angle);
      const opening = wingOpening(b);
      const scale = b.size / 122;
      // Feet remain anchored while folded wings rise around the thorax.
      if (perched) {
        context.strokeStyle = 'rgba(88,95,71,.7)'; context.lineWidth = .55;
        for (const side of [-1, 1]) for (let j = 0; j < 3; j++) {
          context.beginPath(); context.moveTo(side, j * 2 - 3);
          context.lineTo(side * 4, j * 3 - 4); context.lineTo(side * 6, j * 3 - 2); context.stroke();
        }
      }
      for (const side of [-1, 1]) {
        context.save();
        context.scale(side * scale * opening, scale);
        context.rotate((perched ? .1 : .045 * Math.cos(b.phase)) * side);
        context.drawImage(hind, -14, -75);
        context.drawImage(fore, -14, -80);
        context.restore();
      }
      context.fillStyle = '#7c8063'; context.beginPath(); context.ellipse(0, 1, 1.5, 7, 0, 0, TAU); context.fill();
      context.fillStyle = '#c3c8a4'; context.beginPath(); context.ellipse(-.3, -2, 1.25, 3.6, 0, 0, TAU); context.fill();
      context.fillStyle = '#666d55'; context.beginPath(); context.arc(0, -6, 1.8, 0, TAU); context.fill();
      context.strokeStyle = '#6c755d'; context.lineWidth = .55;
      for (const side of [-1, 1]) {
        context.beginPath(); context.moveTo(side, -6);
        context.quadraticCurveTo(side * 3, -12, side * 5, -12); context.stroke();
      }
      context.restore();
    }
    function flightPose(b, age) {
      const t = clamp(age / b.duration, 0, 1);
      const launch = .12, brake = .2, area = 1 - (launch + brake) / 2;
      let travel;
      if (t < launch) {
        const u = t / launch;
        travel = launch * (u ** 3 - .5 * u ** 4);
      } else if (t <= 1 - brake) travel = t - launch / 2;
      else {
        const u = (t - (1 - brake)) / brake;
        travel = 1 - brake - launch / 2 + brake * (u - u ** 3 + .5 * u ** 4);
      }
      const beatCursor = Math.min(b.cycles, travel / area * b.cycles);
      // A small, continuous push during opening; the stroke returns to its
      // nominal position at each fold, so it cannot introduce landing drift.
      const cursor = clamp(beatCursor + .025 * (1 - Math.cos(beatCursor * TAU)), 0, b.cycles);
      const p = flightPoint(b, cursor);
      const before = flightPoint(b, Math.max(0, cursor - .00005));
      const after = flightPoint(b, Math.min(b.cycles, cursor + .00005));
      return { ...b, x: p.x, y: p.y, phase: Math.PI * 1.5 + beatCursor * TAU,
        angle: Math.atan2(after.y - before.y, after.x - before.x) + Math.PI / 2 };
    }
    function drawExposure(b) {
      // Average complete poses with additive premultiplied alpha. Averaging
      // poses avoids dark trails and keeps a stationary white wing opaque.
      exposureContext.setTransform(1, 0, 0, 1, 0, 0);
      exposureContext.clearRect(0, 0, exposureCanvas.width, exposureCanvas.height);
      exposureContext.globalCompositeOperation = 'lighter';
      exposureContext.globalAlpha = 1 / EXPOSURE_SAMPLES;
      for (let i = 0; i < EXPOSURE_SAMPLES; i++) {
        const pose = flightPose(b, Math.max(0, b.age - SHUTTER_SECONDS * i / (EXPOSURE_SAMPLES - 1)));
        poseContext.setTransform(1, 0, 0, 1, 0, 0);
        poseContext.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
        poseContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        draw({ ...pose, x: 64 + pose.x - b.x, y: 64 + pose.y - b.y }, poseContext);
        exposureContext.drawImage(poseCanvas, 0, 0);
      }
      context.drawImage(exposureCanvas, b.x - 64, b.y - 64, 128, 128);
    }
    function animate(now) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      context.clearRect(0, 0, width, height);
      for (const b of butterflies) {
        b.age += dt;
        if (b.state === 'flying') {
          const pose = flightPose(b, b.age);
          b.x = pose.x; b.y = pose.y; b.phase = pose.phase; b.angle = pose.angle;
          if (b.age >= b.duration) { b.x = b.target.x; b.y = b.target.y; b.state = 'perched'; counters(); }
        } else b.phase += dt * TAU / b.restPeriod;
        b.wing = wingOpening(b);
        if (b.state === 'flying') drawExposure(b);
        else draw(b, context);
      }
      if (butterflies.length && !document.hidden) frame = requestAnimationFrame(animate);
    }
    function chooseTarget(x, y, previous) {
      const different = targets.filter(p => !previous || Math.hypot(p.x - previous.x, p.y - previous.y) > 40);
      if (!different.length) return null;
      const candidates = different.filter(p => Math.hypot(p.x - x, p.y - y) > 65 &&
        Math.hypot(p.x - x, p.y - y) < Math.max(500, width * .65));
      const pool = candidates.length ? candidates : different;
      return pool[Math.floor(random() * pool.length)];
    }
    function launch(b, x, y, target) {
      const dx = target.x - x, dy = target.y - y, distance = Math.hypot(dx, dy);
      const route = [{ x, y }], bends = 3 + Math.floor(random() * 2);
      for (let i = 1; i < bends; i++) {
        const t = i / bends;
        const offset = (random() < .5 ? -1 : 1) * Math.min(30, distance * .07)
          * (.6 + random() * .4) * Math.sin(Math.PI * t);
        route.push({ x: clamp(x + dx * t - dy / Math.max(1, distance) * offset, 14, width - 14),
          y: clamp(y + dy * t + dx / Math.max(1, distance) * offset, 14, height - 14) });
      }
      route.push({ ...target });
      // Equal arc-length steps remove the speed jumps caused by unequal
      // waypoint spacing. Small turns then require only a gentle folded bank.
      const guide = Array.from({ length: 257 }, (_, i) => point({ route }, i / 256));
      const lengths = [0];
      for (let i = 1; i < guide.length; i++) lengths.push(lengths[i - 1] + Math.hypot(
        guide[i].x - guide[i - 1].x, guide[i].y - guide[i - 1].y));
      const length = lengths.at(-1);
      const duration = clamp(length / (90 * .84), 4, 12);
      const cycles = Math.max(8, Math.round(duration * (3 + random() * .6) * .84));
      let segment = 1;
      const flightRoute = Array.from({ length: cycles + 1 }, (_, i) => {
        const at = length * i / cycles;
        while (segment < guide.length - 1 && lengths[segment] < at) segment++;
        const u = (at - lengths[segment - 1]) / Math.max(.0001, lengths[segment] - lengths[segment - 1]);
        const a = guide[segment - 1], c = guide[segment];
        return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
      });
      Object.assign(b, { x, y, target, route, flightRoute, cycles, state: 'flying', age: 0, wing: .13,
        angle: Math.atan2(route[1].y - y, route[1].x - x) + Math.PI / 2,
        duration, phase: Math.PI * 1.5 });
      counters();
      if (!frame && !document.hidden) { last = 0; frame = requestAnimationFrame(animate); }
    }
    function spawn(x, y) {
      const target = chooseTarget(x, y);
      if (!target) return false;
      if (butterflies.length >= 12) butterflies.shift();
      const b = { size: 19 + random() * 6, restPeriod: 4.5 + random() * 2 };
      butterflies.push(b);
      launch(b, x, y, target);
      return true;
    }
    function scatter() {
      let moved = 0;
      for (const b of butterflies) {
        if (b.state !== 'perched') continue;
        const target = chooseTarget(b.x, b.y, b.target);
        if (!target) continue;
        launch(b, b.x, b.y, target);
        moved++;
      }
      return moved;
    }
    function visibility() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (!document.hidden && butterflies.length) frame = requestAnimationFrame(animate);
    }
    document.addEventListener('visibilitychange', visibility);
    resize(); counters();
    return {
      spawn, scatter, clear,
      setScene(points, w, h) {
        clear(); resize(); sceneWidth = w; sceneHeight = h;
        targets = points.filter(p => p.x > 8 && p.x < w - 8 && p.y > 8 && p.y < h - 8)
          .map(p => ({ x: p.x * width / sceneWidth, y: p.y * height / sceneHeight }));
        counters();
      },
      snapshot: () => butterflies.map(b => ({ x: b.x, y: b.y, target: { ...b.target }, state: b.state,
        wing: b.wing, phase: b.phase, angle: b.angle, age: b.age, duration: b.duration })),
    };
  };
})();
