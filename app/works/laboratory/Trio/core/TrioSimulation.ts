export type Point = { x: number; y: number };
export type Body = Point & {
  vx: number;
  vy: number;
  mass: number;
  color: string;
  trail: Point[];
};

const GRAVITY = 0.65;
const SOFTENING = 0.075;
const COLORS = ["#81ef00", "#ff008b", "#009fff"];
const TRAIL_LENGTH = 420;

export class TrioSimulation {
  bodies: Body[] = [];
  private trailClock = 0;

  constructor() {
    this.reset();
  }

  reset() {
    const rotation = Math.random() * Math.PI * 2;
    this.bodies = COLORS.map((color, index) => {
      const angle = rotation + index * Math.PI * 2 / 3 + (Math.random() - 0.5) * 0.65;
      const radius = 0.7 + Math.random() * 0.5;
      const speed = 0.24 + Math.random() * 0.3;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: -Math.sin(angle) * speed + (Math.random() - 0.5) * 0.15,
        vy: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.15,
        mass: 1,
        color,
        trail: [],
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
