type Bird = {
  direction: 1 | -1;
  startY: number;
  endY: number;
  speed: number;
  delay: number;
  age: number;
  scale: number;
  phase: number;
  flapEnd: number;
  nextFlap: number;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (min = 0, max = 1) => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return min + (((value ^ value >>> 14) >>> 0) / 4294967296) * (max - min);
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function drawWing(ctx: CanvasRenderingContext2D, lift: number, far: boolean) {
  const rootX = far ? 2 : -5;
  const tipX = far ? -19 + lift * 4 : -36 + lift * 8;
  const tipY = far ? -7 - lift * 17 : -10 - lift * 27;
  ctx.beginPath();
  ctx.moveTo(rootX, -3);
  ctx.bezierCurveTo(rootX - 7, -9, tipX + 11, tipY + 1, tipX, tipY);
  ctx.bezierCurveTo(tipX + 7, tipY + 6, rootX - 10, 2 + lift * 2, rootX + 5, 2);
  ctx.closePath();
  ctx.fillStyle = far ? "#dce7e7" : "#fffefa";
  ctx.strokeStyle = "#536971";
  ctx.lineWidth = far ? .8 : 1.15;
  ctx.fill();
  ctx.stroke();

  // A short grey feather edge makes the long, white gliding wing legible
  // against pale roofs without turning the bird into a dark silhouette.
  if (!far) {
    ctx.beginPath();
    ctx.moveTo(tipX + 6, tipY + 4);
    ctx.quadraticCurveTo(tipX + 16, tipY + 9, rootX - 8, 1);
    ctx.strokeStyle = "#91a6aa";
    ctx.lineWidth = .75;
    ctx.stroke();
  }
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, x: number, y: number) {
  const flapping = bird.age < bird.flapEnd;
  const lift = flapping
    ? Math.sin((bird.age - bird.phase) * Math.PI * 6.2)
    : .1 + Math.sin(bird.age * 1.4 + bird.phase) * .045;
  const slope = Math.atan2((bird.endY - bird.startY) * bird.direction, ctx.canvas.clientWidth + 90);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(slope);
  ctx.scale(bird.direction * bird.scale, bird.scale);
  ctx.shadowColor = "#233a4566";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;

  drawWing(ctx, lift * .72, true);

  // Forked tail, tapered body, rounded head and pointed beak in side profile.
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-29, -4);
  ctx.lineTo(-24, 1);
  ctx.lineTo(-29, 4);
  ctx.lineTo(-15, 3);
  ctx.bezierCurveTo(-4, 7, 9, 4, 15, 0);
  ctx.bezierCurveTo(19, -4, 13, -7, 7, -6);
  ctx.bezierCurveTo(-3, -7, -13, -4, -18, 0);
  ctx.closePath();
  ctx.fillStyle = "#fffefa";
  ctx.strokeStyle = "#4f6269";
  ctx.lineWidth = 1.05;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(15, -3);
  ctx.lineTo(24, -1);
  ctx.lineTo(16, 0);
  ctx.closePath();
  ctx.fillStyle = "#eee8d3";
  ctx.fill();
  ctx.stroke();

  drawWing(ctx, lift, false);
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(13, -4.1, .8, 0, Math.PI * 2);
  ctx.fillStyle = "#33434a";
  ctx.fill();
  ctx.restore();
}

export function animateVillageBirds(canvas: HTMLCanvasElement, seed: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const random = seededRandom(seed ^ 0x738fa15d);
  let width = 0;
  let height = 0;
  let birds: Bird[] = [];
  let idle = 0;
  let frame = 0;
  let previous = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(nextWidth * ratio);
    const pixelHeight = Math.round(nextHeight * ratio);
    width = nextWidth;
    height = nextHeight;
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    birds = [];
    idle = 0;
  };

  const makeWave = () => {
    const direction: 1 | -1 = random() < .5 ? 1 : -1;
    const count = Math.floor(random(2, 7));
    const center = random(height * .16, height * .53);
    birds = Array.from({ length: count }, (_, index) => {
      const startY = clamp(center + random(-height * .11, height * .11), height * .08, height * .66);
      return {
        direction,
        startY,
        endY: clamp(startY + random(-height * .13, height * .13), height * .08, height * .7),
        speed: random(95, 155),
        delay: index * random(.16, .42),
        age: 0,
        scale: random(.72, 1.25) * clamp(width / 650, .8, 1.18),
        phase: random(0, Math.PI * 2),
        flapEnd: -1,
        nextFlap: random(.8, 4.5),
      };
    });
    canvas.dataset.flockSize = String(count);
    canvas.dataset.flightDirection = direction === 1 ? "right" : "left";
  };

  const tick = (now: number) => {
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    ctx.clearRect(0, 0, width, height);
    if (!birds.length) {
      idle -= dt;
      if (idle <= 0) makeWave();
    }
    let visible = 0;
    const hadBirds = birds.length > 0;
    birds = birds.filter(bird => {
      bird.age += dt;
      if (bird.age < bird.delay) return true;
      const travel = bird.age - bird.delay;
      const x = (bird.direction === 1 ? -55 : width + 55) + bird.direction * bird.speed * travel;
      if (x < -80 || x > width + 80) return false;
      if (bird.age >= bird.nextFlap) {
        bird.flapEnd = bird.age + random(.65, 1.15);
        bird.nextFlap = bird.flapEnd + random(2.8, 6.5);
      }
      const progress = clamp(bird.speed * travel / (width + 110), 0, 1);
      const y = bird.startY + (bird.endY - bird.startY) * progress + Math.sin(travel * 1.3 + bird.phase) * 3;
      drawBird(ctx, bird, x, y);
      if (x >= 0 && x <= width) visible++;
      return true;
    });
    canvas.dataset.visibleBirds = String(visible);
    if (hadBirds && !birds.length) idle = random(1.2, 3.5);
    frame = requestAnimationFrame(tick);
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    ctx.clearRect(0, 0, width, height);
  };
}
