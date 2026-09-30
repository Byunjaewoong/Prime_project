export type Point = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };
export type PlanetAppearance = {
  axis: Vec3;
  palette: { red: number; green: number; blue: number };
  detailSeed: number;
};
export type Body = Point & {
  vx: number;
  vy: number;
  mass: number;
  color: string;
  trail: Point[];
  appearance: PlanetAppearance;
  spinAngle: number;
  spinSpeed: number;
  baseSpinSpeed: number;
};

const GRAVITY = 0.65;
const SOFTENING = 0.075;
const COLORS = ["#81ef00", "#ff008b", "#009fff"];
const TRAIL_LENGTH = 420;

function randomAppearance(): PlanetAppearance {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(1 - z * z);
  const channel = () => (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 1.45);
  const red = channel();
  const green = channel();
  let blue = channel();
  if (Math.sign(red) === Math.sign(green)) blue = Math.sign(red) > 0 ? -Math.abs(blue) : Math.abs(blue);
  return {
    axis: { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z },
    palette: { red, green, blue },
    detailSeed: Math.random() * Math.PI * 2,
  };
}

function randomPositions(): Point[] {
  const positions: Point[] = [];
  for (let index = 0; index < 3; index += 1) {
    let candidate: Point = { x: 0, y: 0 };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const next = { x: (Math.random() - 0.5) * 3.5, y: (Math.random() - 0.5) * 3.5 };
      const nearest = Math.min(...positions.map(point => Math.hypot(next.x - point.x, next.y - point.y)), Infinity);
      if (nearest > bestDistance) {
        candidate = next;
        bestDistance = nearest;
      }
      if (nearest >= 1.35) {
        candidate = next;
        break;
      }
    }
    positions.push(candidate);
  }
  return positions;
}

export class TrioSimulation {
  bodies: Body[] = [];
  private trailClock = 0;

  constructor() {
    this.reset();
  }

  reset() {
    const positions = randomPositions();
    this.bodies = COLORS.map((color, index) => {
      const position = positions[index];
      const orbitalAngle = Math.atan2(position.y, position.x);
      const speed = 0.22 + Math.random() * 0.28;
      const baseSpinSpeed = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.65);
      return {
        x: position.x,
        y: position.y,
        vx: -Math.sin(orbitalAngle) * speed + (Math.random() - 0.5) * 0.34,
        vy: Math.cos(orbitalAngle) * speed + (Math.random() - 0.5) * 0.34,
        mass: 1,
        color,
        trail: [],
        appearance: randomAppearance(),
        spinAngle: Math.random() * Math.PI * 2,
        spinSpeed: baseSpinSpeed,
        baseSpinSpeed,
      };
    });
    const centerX = this.bodies.reduce((sum, body) => sum + body.x, 0) / 3;
    const centerY = this.bodies.reduce((sum, body) => sum + body.y, 0) / 3;
    const velocityX = this.bodies.reduce((sum, body) => sum + body.vx, 0) / 3;
    const velocityY = this.bodies.reduce((sum, body) => sum + body.vy, 0) / 3;
    for (const body of this.bodies) {
      body.x -= centerX;
      body.y -= centerY;
      body.vx -= velocityX;
      body.vy -= velocityY;
      body.trail.push({ x: body.x, y: body.y });
    }
    this.trailClock = 0;
  }

  private accelerations(): Point[] {
    const accelerations = this.bodies.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < this.bodies.length; i += 1) {
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const first = this.bodies[i];
        const second = this.bodies[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distanceSquared = dx * dx + dy * dy + SOFTENING * SOFTENING;
        const force = GRAVITY / (distanceSquared * Math.sqrt(distanceSquared));
        accelerations[i].x += dx * force * second.mass;
        accelerations[i].y += dy * force * second.mass;
        accelerations[j].x -= dx * force * first.mass;
        accelerations[j].y -= dy * force * first.mass;
      }
    }
    return accelerations;
  }

  step(dt: number) {
    // Velocity Verlet and a fixed small timestep keep close encounters stable.
    const before = this.accelerations();
    this.bodies.forEach((body, index) => {
      body.x += body.vx * dt + before[index].x * dt * dt * 0.5;
      body.y += body.vy * dt + before[index].y * dt * dt * 0.5;
      body.vx += before[index].x * dt * 0.5;
      body.vy += before[index].y * dt * 0.5;
    });
    const after = this.accelerations();
    this.bodies.forEach((body, index) => {
      body.vx += after[index].x * dt * 0.5;
      body.vy += after[index].y * dt * 0.5;
      const accelerationChange = Math.hypot(after[index].x - before[index].x, after[index].y - before[index].y) / dt;
      const targetSpeed = Math.sign(body.baseSpinSpeed)
        * (Math.abs(body.baseSpinSpeed) + Math.min(4, Math.sqrt(accelerationChange) * 0.45));
      body.spinSpeed += (targetSpeed - body.spinSpeed) * (1 - Math.exp(-dt * 3.5));
      body.spinAngle = (body.spinAngle + body.spinSpeed * dt) % (Math.PI * 2);
    });
    this.trailClock += dt;
    if (this.trailClock >= 1 / 60) {
      this.trailClock %= 1 / 60;
      for (const body of this.bodies) {
        body.trail.push({ x: body.x, y: body.y });
        if (body.trail.length > TRAIL_LENGTH) body.trail.shift();
      }
    }
  }
}
