export type Side = 0 | 1;
export type V3 = { x: number; y: number; z: number };
export type Ball = { p: V3; v: V3; top: number; side: number };
export const COURT = { halfWidth: 4.115, doubles: 5.485, halfLength: 11.885, service: 6.4, net: .914, radius: .13 };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const opposite = (side: Side): Side => side === 0 ? 1 : 0;
export const courtSide = (side: Side) => side === 0 ? 1 : -1;
export const newBall = (): Ball => ({ p: { x: 0, y: 1, z: 9 }, v: { x: 0, y: 0, z: 0 }, top: 0, side: 0 });
export const cloneBall = (b: Ball): Ball => ({ p: { ...b.p }, v: { ...b.v }, top: b.top, side: b.side });

/** A lightweight Magnus/drag model, in metres and seconds. */
export function advanceBall(b: Ball, dt: number): "net" | "bounce" | null {
  const oldZ = b.p.z, oldY = b.p.y;
  b.v.x += b.side * 2.2 * dt;
  b.v.y -= (9.81 + b.top * 3.6) * dt;
  const drag = Math.exp(-.07 * dt);
  b.v.x *= drag; b.v.z *= drag;
  b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
  if (oldZ * b.p.z < 0 && Math.abs(b.p.x) < COURT.doubles + .5) {
    const y = oldY + (b.p.y - oldY) * Math.abs(oldZ / (b.p.z - oldZ));
    if (y < COURT.net + COURT.radius) return "net";
  }
  if (b.p.y <= COURT.radius && b.v.y < 0) {
    b.p.y = COURT.radius;
    b.v.y = -b.v.y * (.66 + b.top * .075);
    const grip = .83 + b.top * .085;
    b.v.x *= grip; b.v.z *= grip;
    b.v.x += b.side * .35;
    b.top *= .6; b.side *= .65;
    return "bounce";
  }
  return null;
}

export function launchShot(b: Ball, targetX: number, targetZ: number, power: number, top: number, side: number) {
  b.top = clamp(top, -1, 1); b.side = clamp(side, -1, 1);
  const gravity = 9.81 + b.top * 3.6;
  const dz = targetZ - b.p.z;
  let duration = Math.max(.55, Math.hypot(targetX - b.p.x, dz) / (12 + power * 11));
  // Increase the arc when a short/low contact would otherwise hit the net.
  for (let i = 0; i < 20; i++) {
    const vy = (COURT.radius - b.p.y + .5 * gravity * duration ** 2) / duration;
    const tNet = duration * clamp(-b.p.z / dz, 0, 1);
    if (b.p.y + vy * tNet - .5 * gravity * tNet ** 2 > 1.2 || b.p.z * targetZ >= 0) break;
    duration += .04;
  }
  const travel = (1 - Math.exp(-.07 * duration)) / .07;
  b.v.x = (targetX - b.p.x - .5 * b.side * 2.2 * duration ** 2) / travel;
  b.v.z = dz / travel;
  b.v.y = (COURT.radius - b.p.y + .5 * gravity * duration ** 2) / duration + .045;
}

export type Score = { points: [number, number]; games: [number, number]; winner: Side | null };
export const newScore = (): Score => ({ points: [0, 0], games: [0, 0], winner: null });
export function awardPoint(score: Score, side: Side): boolean {
  score.points[side]++;
  const other = opposite(side);
  if (score.points[side] >= 4 && score.points[side] - score.points[other] >= 2) {
    score.games[side]++;
    score.points = [0, 0];
    if (score.games[side] >= 3 && score.games[side] - score.games[other] >= 2) score.winner = side;
    return true;
  }
  return false;
}
export function pointLabels(score: Score): [string, string] {
  const [a, b] = score.points;
  if (a >= 3 && b >= 3) return a === b ? ["40", "40"] : a > b ? ["AD", "40"] : ["40", "AD"];
  return [String([0, 15, 30, 40][Math.min(a, 3)]), String([0, 15, 30, 40][Math.min(b, 3)])];
}
