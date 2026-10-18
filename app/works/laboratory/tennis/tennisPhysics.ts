export type Side = 0 | 1;
export type V3 = { x: number; y: number; z: number };
export type Ball = { p: V3; v: V3; top: number; side: number; curve?: number };
export const COURT = { halfWidth: 4.115, doubles: 5.485, halfLength: 11.885, service: 6.4, net: .914, radius: .13 };
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const opposite = (side: Side): Side => side === 0 ? 1 : 0;
export const courtSide = (side: Side) => side === 0 ? 1 : -1;
export const newBall = (): Ball => ({ p: { x: 0, y: 1, z: 9 }, v: { x: 0, y: 0, z: 0 }, top: 0, side: 0 });
export const cloneBall = (b: Ball): Ball => ({ p: { ...b.p }, v: { ...b.v }, top: b.top, side: b.side, curve: b.curve });

export const swipeSpin = (speed: number, threshold: number) =>
  .18 + .82 * Math.pow(clamp((speed - threshold) / 1600, 0, 1), .7);

// Integral of a damped, rotating horizontal velocity. The same expression is
// used for launch aiming, simulation and prediction, including semicircle shots.
function arcTravel(turn: number, time: number) {
  const drag = .07, decay = Math.exp(-drag*time), angle = turn*time;
  const denominator = drag*drag+turn*turn;
  return {
    a: (drag+decay*(-drag*Math.cos(angle)+turn*Math.sin(angle)))/denominator,
    b: (turn+decay*(-drag*Math.sin(angle)-turn*Math.cos(angle)))/denominator,
  };
}

/** A lightweight Magnus/drag model, in metres and seconds. */
export function advanceBall(b: Ball, dt: number): "net" | "bounce" | null {
  const oldZ = b.p.z, oldY = b.p.y;
  const turn=b.curve ?? 0, angle=turn*dt, travel=arcTravel(turn,dt);
  const vx=b.v.x, vz=b.v.z, gravity=9.81+b.top*7;
  b.p.x += travel.a*vx-travel.b*vz; b.p.z += travel.b*vx+travel.a*vz;
  b.p.y += b.v.y*dt-.5*gravity*dt*dt;
  b.v.y -= gravity*dt;
  const drag = Math.exp(-.07 * dt);
  b.v.x = (vx*Math.cos(angle)-vz*Math.sin(angle))*drag;
  b.v.z = (vx*Math.sin(angle)+vz*Math.cos(angle))*drag;
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
    b.curve = turn*.35;
    return "bounce";
  }
  return null;
}

export function launchShot(b: Ball, targetX: number, targetZ: number, power: number, top: number, side: number) {
  b.top = clamp(top, -1, 1); b.side = clamp(side, -1, 1);
  const gravity = 9.81 + b.top * 7;
  const dz = targetZ - b.p.z;
  const dx = targetX-b.p.x;
  const angle = Math.sign(b.side)*Math.PI*Math.pow(Math.abs(b.side),1.35);
  const arcFactor = Math.abs(angle)<.001?1:Math.abs(angle)/(2*Math.sin(Math.abs(angle)/2));
  let duration = Math.max(.55, Math.hypot(dx, dz)*arcFactor / (12 + clamp(power,0,1) * 11));
  // Increase the arc when a short/low contact would otherwise hit the net.
  for (let i = 0; i < 60; i++) {
    b.curve=angle/duration;
    const travel=arcTravel(b.curve,duration), denominator=travel.a**2+travel.b**2;
    b.v.x=(travel.a*dx+travel.b*dz)/denominator;
    b.v.z=(-travel.b*dx+travel.a*dz)/denominator;
    const vy = (COURT.radius - b.p.y + .5 * gravity * duration ** 2) / duration;
    b.v.y=vy;
    let lastZ=b.p.z, clear=true;
    for(let j=1;j<=80;j++) {
      const t=duration*j/80, step=arcTravel(b.curve,t);
      const z=b.p.z+step.b*b.v.x+step.a*b.v.z;
      if(lastZ*z<0) {
        const tNet=t-duration/80*Math.abs(z/(z-lastZ));
        const atNet=arcTravel(b.curve,tNet), x=b.p.x+atNet.a*b.v.x-atNet.b*b.v.z;
        if(Math.abs(x)<COURT.doubles+.5 && b.p.y+vy*tNet-.5*gravity*tNet*tNet<1.2)clear=false;
      }
      lastZ=z;
    }
    if(clear) break;
    duration += .04;
  }
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
