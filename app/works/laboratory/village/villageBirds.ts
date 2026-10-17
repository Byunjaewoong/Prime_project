type Bird = {
  direction: 1 | -1;
  startY: number;
  endY: number;
  speed: number;
  delay: number;
  age: number;
  scale: number;
  phase: number;
  glideLift: number;
  flapStart: number;
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

function drawWing(ctx: CanvasRenderingContext2D, lift: number) {
  // Pure 180-degree side projection: the two wings overlap into one outline.
  // The elbow and the feather edge bend independently as the tip rises/falls.
  const rootX = -5, rootY = -3;
  const tipX = -29 - lift * 7;
  const tipY = -12 - lift * 27;
  const dx = tipX - rootX, dy = tipY - rootY;
  const length = Math.hypot(dx, dy);
  const nx = dy / length, ny = -dx / length;
  const feather = (along: number, width: number): [number, number] =>
    [rootX + dx * along + nx * width, rootY + dy * along + ny * width];
  const [f1x, f1y] = feather(.82, 2.3);
  const [n1x, n1y] = feather(.79, 1.1);
  const [f2x, f2y] = feather(.64, 4.5);
  const [n2x, n2y] = feather(.61, 2.5);
  const [f3x, f3y] = feather(.43, 6.4);
  const [innerX, innerY] = feather(.2, 7);
  ctx.beginPath();
  ctx.moveTo(rootX, rootY);
  ctx.bezierCurveTo(rootX - 9, rootY - 7 - lift * 4, tipX + 10, tipY - 4, tipX, tipY);
  ctx.quadraticCurveTo(tipX + nx * 2, tipY + ny * 2, f1x, f1y);
  ctx.lineTo(n1x, n1y);
  ctx.quadraticCurveTo(...feather(.69, 5), f2x, f2y);
  ctx.lineTo(n2x, n2y);
  ctx.quadraticCurveTo(...feather(.5, 7), f3x, f3y);
  ctx.quadraticCurveTo(innerX, innerY, rootX + 5, rootY + 5);
  ctx.closePath();
  ctx.fill();
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, x: number, y: number) {
  let lift = bird.glideLift + Math.sin(bird.age * 1.2 + bird.phase * Math.PI * 2) * .035;
  if (bird.age >= bird.flapStart && bird.age < bird.flapEnd) {
    const progress = (bird.age - bird.flapStart) / (bird.flapEnd - bird.flapStart);
    const envelope = Math.sin(Math.PI * progress) ** 2;
    lift += envelope * Math.sin(progress * Math.PI * 4.5 + bird.phase * Math.PI * 2) * .95;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(bird.direction * bird.scale, bird.scale);
  ctx.fillStyle = "#ffffff";

  // One continuous white silhouette, including the small forked tail and beak.
  ctx.beginPath();
  ctx.moveTo(-16, -2);
  ctx.quadraticCurveTo(-22, -2, -28, -5);
  ctx.lineTo(-24, -1);
  ctx.lineTo(-29, 2);
  ctx.quadraticCurveTo(-20, 1, -16, 3);
  ctx.bezierCurveTo(-7, 6, 8, 5, 13, 0);
  ctx.quadraticCurveTo(17, -1, 22, -2);
  ctx.quadraticCurveTo(17, -3, 14, -4);
  ctx.bezierCurveTo(10, -7, 5, -6, 2, -5);
  ctx.bezierCurveTo(-7, -6, -12, -3, -16, -2);
  ctx.closePath();
  ctx.fill();
  drawWing(ctx, lift);
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
        scale: random(.58, .88) * clamp(width / 900, .78, 1.08),
        phase: random(),
        glideLift: random(-.12, .16),
        flapStart: -1,
        flapEnd: -1,
        nextFlap: random(1.2, 5),
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
        bird.flapStart = bird.age;
        bird.flapEnd = bird.age + random(.9, 1.5);
        bird.nextFlap = bird.flapEnd + random(4, 8);
      }
      const progress = clamp(bird.speed * travel / (width + 110), 0, 1);
      const y = bird.startY + (bird.endY - bird.startY) * progress + Math.sin(travel * 1.3 + bird.phase * Math.PI * 2) * 3;
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
