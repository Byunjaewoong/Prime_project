import * as THREE from "three";
import type { LeafType } from "./leafShapes";
import { trunkTimeAt } from "./sproutGrowth";

export type BranchSettings = {
  seed: number;
  height: number;
  thickness: number;
  branches: number;
  depth: number;
  angle: number;
  curvature: number;
  spread: number;
  irregularity: number;
  stubs: number;
  texture: number;
  leafDensity: number;
  leafSize: number;
  leafType: LeafType;
};

export const DEFAULT_BRANCH_SETTINGS: BranchSettings = {
  seed: 24659, height: 10, thickness: .38, branches: 8, depth: 3,
  angle: 58, curvature: 1, spread: 1.1, irregularity: 1, stubs: .7, texture: 1, leafDensity: 1, leafSize: 1, leafType: "lance",
};

export type Stem = {
  curve: THREE.CatmullRomCurve3;
  radius: number;
  tip: number;
  length: number;
  growthStart: number;
  growthEnd: number;
  parent: number | null;
  attachment: number;
  kind: "shoot" | "stub";
  level: number;
};

export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Recursive, apically biased branching. Each daughter inherits its parent's
 * tangent, taper and birth time, with seeded three-dimensional divergence. */
export function createBranchSkeleton(settings: BranchSettings): Stem[] {
  const random = randomSource(settings.seed);
  const vary = (amount: number) => (random() - .5) * 2 * amount;
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const stems: Stem[] = [];
  const add = (points: THREE.Vector3[], radius: number, start: number, end: number,
    parent: number | null, attachment: number, level: number, stub = false) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    curve.arcLengthDivisions = Math.max(320, points.length * 48);
    stems.push({ curve, radius, tip: stub ? .28 + random() * .28 : .035,
      length: curve.getLength(), growthStart: start, growthEnd: end, parent,
      attachment, kind: stub ? "stub" : "shoot", level });
    return stems.length - 1;
  };
  const trunk: THREE.Vector3[] = [];
  const phase = random() * Math.PI * 2;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const sway = settings.curvature * settings.height * .045 * Math.sin(t * Math.PI / 2);
    trunk.push(new THREE.Vector3(
      sway * (Math.sin(t * 7 + phase) + vary(.3)),
      settings.height * (t - .5),
      sway * (.6 * Math.sin(t * 5 + phase * .7) + vary(.2))));
  }
  add(trunk, settings.thickness, 0, .52, null, 0, 0);

  const nodes = (count: number, min: number, max: number) => {
    const gap = (max - min) / Math.max(1, count) * .38;
    const room = max - min - Math.max(0, count - 1) * gap;
    return Array.from({ length: count }, () => random()).sort((a, b) => a - b)
      .map((value, i) => min + i * gap + value * room);
  };
  const grow = (parentIndex: number, at: number, azimuth: number, stub = false) => {
    const parent = stems[parentIndex], level = parent.level + 1;
    const start = parent.curve.getPointAt(at), tangent = parent.curve.getTangentAt(at).normalize();
    const axis = Math.abs(tangent.z) < .85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const outward = normal.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(binormal, Math.sin(azimuth));
    const lateral = new THREE.Vector3().crossVectors(tangent, outward).normalize();
    const opening = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(settings.angle + vary(17) - (level > 1 ? 7 : 0), 15, 85));
    const direction = tangent.clone().multiplyScalar(Math.cos(opening)).addScaledVector(outward, Math.sin(opening));
    const reach = stub ? (.16 + random() * .46) * settings.height / 10
      : level === 1 ? settings.height * (.23 + (1 - at) * .24) * (.8 + random() * .35)
        : parent.length * (.40 + random() * .20) * (1.15 - at * .28);
    const divisions = stub ? integer(2, 3) : level === 1 ? integer(5, 7) : integer(3, 5);
    const steps = Array.from({ length: divisions }, () => .5 + random());
    const total = steps.reduce((sum, step) => sum + step, 0);
    const points = [start], previousHeading = direction.clone();
    let turn = random() < .5 ? -1 : 1;
    for (let i = 0; i < divisions; i++) {
      if (random() < .48) turn *= -1;
      const bend = i === 0 ? 0 : turn * (.15 + random() * .5) * settings.curvature;
      const twist = i === 0 ? 0 : vary(.32) * settings.curvature;
      const heading = direction.clone().applyAxisAngle(lateral, bend).applyAxisAngle(outward, twist)
        .add(new THREE.Vector3(0, stub ? 0 : .22 * i / divisions, 0)).normalize();
      const change = previousHeading.angleTo(heading), maxTurn = .7 + settings.curvature * .2;
      if (change > maxTurn) {
        const q = new THREE.Quaternion().setFromUnitVectors(previousHeading, heading);
        heading.copy(previousHeading).applyQuaternion(new THREE.Quaternion().slerp(q, maxTurn / change));
      }
      const step = heading.clone().multiplyScalar(reach * steps[i] / total);
      step.x *= settings.spread; step.z *= settings.spread;
      points.push(points[points.length - 1].clone().add(step));
      previousHeading.copy(heading);
    }
    const parentRadius = parent.radius * (parent.tip + (1 - parent.tip) * Math.pow(1 - at, .78));
    const radius = parentRadius * (stub ? .25 + random() * .2 : .52 + random() * .16);
    const birth = Math.min(.955, parentIndex === 0 ? Math.max(.315, trunkTimeAt(at) + .014)
      : parent.growthStart + (parent.growthEnd - parent.growthStart) * at + .014);
    const duration = stub ? .07 : .07 + .025 / level;
    return add(points, radius, birth, Math.min(.97, birth + duration), parentIndex, at, level, stub);
  };
  const primary = nodes(Math.max(3, settings.branches + integer(-1, 1)), .12, .82)
    .map((at, i) => grow(0, at, phase + i * 2.399963 + vary(.6)));
  let generation = primary;
  for (let level = 2; level <= settings.depth; level++) {
    const next: number[] = [];
    for (const parent of generation) {
      const azimuth = random() * Math.PI * 2;
      for (const [i, at] of nodes(integer(2, 3), .38, .88).entries()) {
        // Bound geometry cost at the most complex menu settings.
        if (stems.length >= 220) break;
        next.push(grow(parent, at, azimuth + i * 2.399963 + vary(.5)));
      }
    }
    generation = next;
  }
  for (const parent of [0, ...primary]) {
    const count = Math.round((parent === 0 ? integer(5, 9) : integer(1, 3)) * settings.stubs);
    for (const at of nodes(count, .14, .87)) grow(parent, at, random() * Math.PI * 2, true);
  }
  // Radial buttress roots complete the base, visible within the full-tree frame.
  const rootCount = integer(5, 7), rootAt = .018;
  const rootStart = stems[0].curve.getPointAt(rootAt);
  for (let i = 0; i < rootCount; i++) {
    const angle = phase + i / rootCount * Math.PI * 2 + vary(.2);
    const reach = (.55 + random() * .55) * settings.height / 10;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const middle = rootStart.clone().addScaledVector(radial, reach * .4);
    middle.y = -settings.height / 2 + .035;
    const end = rootStart.clone().addScaledVector(radial, reach);
    end.y = -settings.height / 2 - .045;
    add([rootStart.clone(), middle, end], settings.thickness * (.36 + random() * .15),
      .025, .17, 0, rootAt, 1);
  }
  return stems;
}
