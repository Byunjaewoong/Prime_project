// Independent animation and randomness: butterflies never change flower seeds.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const smooth = t => t * t * (3 - 2 * t);

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

    function resize() {
      width = innerWidth; height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    function draw(b) {
      const perched = b.state === 'perched';
      context.save(); context.translate(b.x, b.y); context.rotate(b.angle);
      const beat = .5 + .5 * Math.sin(b.phase);
      b.wing = perched ? .10 + .65 * Math.pow(beat, 2.2) : .13 + .87 * beat;
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
        context.scale(side * scale * b.wing, scale);
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
    function animate(now) {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      context.clearRect(0, 0, width, height);
      for (const b of butterflies) {
        b.age += dt;
        if (b.state === 'flying') {
          const t = Math.min(1, b.age / b.duration);
          const arrival = smooth(clamp((t - .82) / .18, 0, 1));
          b.phase += dt * TAU * (b.frequency * (1 - arrival) + 1.8 * arrival);
          const p = point(b, t), next = point(b, Math.min(1, t + .008));
          const bob = Math.sin(Math.PI * t) * (1 - arrival);
          b.x = p.x + Math.sin(b.phase * .5 + b.twist) * 3.5 * bob;
          b.y = p.y + Math.cos(b.phase) * 2.3 * bob;
          const heading = Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2;
          const turn = Math.atan2(Math.sin(heading - b.angle), Math.cos(heading - b.angle));
          b.angle += turn * Math.min(1, dt * 7) * (1 - arrival * .9);
          if (t === 1) { b.x = b.target.x; b.y = b.target.y; b.state = 'perched'; counters(); }
        } else b.phase += dt * TAU / b.restPeriod;
        draw(b);
      }
      if (butterflies.length && !document.hidden) frame = requestAnimationFrame(animate);
    }
    function spawn(x, y) {
      if (!targets.length) return false;
      const candidates = targets.filter(p => Math.hypot(p.x - x, p.y - y) > 65 &&
        Math.hypot(p.x - x, p.y - y) < Math.max(500, width * .65));
      const pool = candidates.length ? candidates : targets;
      const target = pool[Math.floor(random() * pool.length)];
      const dx = target.x - x, dy = target.y - y, distance = Math.hypot(dx, dy);
      const route = [{ x, y }], bends = 5 + Math.floor(random() * 3);
      for (let i = 1; i < bends; i++) {
        const t = i / bends;
        const offset = (i % 2 ? -1 : 1) * (25 + random() * 65) * Math.sin(Math.PI * t);
        route.push({ x: clamp(x + dx * t - dy / Math.max(1, distance) * offset, 14, width - 14),
          y: clamp(y + dy * t + dx / Math.max(1, distance) * offset, 14, height - 14) });
      }
      route.push({ ...target });
      if (butterflies.length >= 12) butterflies.shift();
      butterflies.push({ x, y, target, route, state: 'flying', age: 0, wing: 1,
        angle: Math.atan2(route[1].y - y, route[1].x - x) + Math.PI / 2,
        duration: clamp(distance / 90 + 3, 4, 10), phase: random() * TAU,
        frequency: 6 + random() * 2, twist: random() * TAU, restPeriod: 3.5 + random() * 2,
        size: 19 + random() * 6 });
      counters();
      if (!frame && !document.hidden) { last = 0; frame = requestAnimationFrame(animate); }
      return true;
    }
    function visibility() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (!document.hidden && butterflies.length) frame = requestAnimationFrame(animate);
    }
    document.addEventListener('visibilitychange', visibility);
    resize(); counters();
    return {
      spawn, clear,
      setScene(points, w, h) {
        clear(); resize(); sceneWidth = w; sceneHeight = h;
        targets = points.filter(p => p.x > 8 && p.x < w - 8 && p.y > 8 && p.y < h - 8)
          .map(p => ({ x: p.x * width / sceneWidth, y: p.y * height / sceneHeight }));
        counters();
      },
      snapshot: () => butterflies.map(b => ({ x: b.x, y: b.y, target: { ...b.target }, state: b.state, wing: b.wing })),
    };
  };
})();
