import * as THREE from "three";

export type BranchSettings = {
  seed: number;
  curvature: number;
  spread: number;
  texture: number;
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
};

export function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Seeded topology is independent of bark tessellation and material settings. */
export function createBranchSkeleton(settings: BranchSettings): Stem[] {
  const random = randomSource(settings.seed);
  const vary = (amount: number) => (random() - .5) * 2 * amount;
  const integer = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const stems: Stem[] = [];
  const add = (points: THREE.Vector3[], radius: number, tip: number, start: number, end: number, parent: number | null, attachment = 0, kind: Stem["kind"] = "shoot") => {
    // Let tangents flow across whole internodes. The irregular heading changes
    // remain, but neighbouring bends connect through bowed, continuous curves.
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    curve.arcLengthDivisions = Math.max(400, points.length * 48);
    stems.push({ curve, radius, tip, length: curve.getLength(), growthStart: start, growthEnd: end, parent, attachment, kind });
    return stems.length - 1;
  };
  const trunkPoints = [
    [-2.42, -6.43], [-1.97, -5.63], [-1.65, -5.2], [-1.18, -4.65],
    [-.42, -4], [.12, -3.3], [.35, -2.52], [.19, -1.71], [.43, -.96],
    [.24, -.2], [-.17, .51], [-.51, 1.27], [-.61, 2.09], [-.43, 2.88],
    [-.48, 3.62], [-.29, 4.38],
  ].map(([x, y], i) => new THREE.Vector3(x + vary(.13) * settings.curvature,
    y + vary(.07) * settings.curvature, Math.sin(i * .53) * .25 + vary(.12) * settings.curvature));
  add(trunkPoints, .33, .08, 0, .68, null);

  // Random order statistics with minimum separation, without fixed branch nodes.
  const attachments = (count: number, min: number, max: number, gap: number) => {
    const room = max - min - Math.max(0, count - 1) * gap;
    return Array.from({ length: count }, () => random()).sort((a, b) => a - b)
      .map((value, i) => min + i * gap + value * room);
  };
  const grow = (parentIndex: number, at: number, azimuth: number, major: boolean, stopped = false) => {
    const parent = stems[parentIndex];
    const start = parent.curve.getPointAt(at);
    const tangent = parent.curve.getTangentAt(at).normalize();
    const axis = Math.abs(tangent.z) < .85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, axis).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const outward = normal.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(binormal, Math.sin(azimuth));
    const lateral = new THREE.Vector3().crossVectors(tangent, outward).normalize();
    const opening = THREE.MathUtils.degToRad((major ? 32 : 26) + random() * (major ? 46 : 58));
    const angle = Math.atan(Math.tan(opening) * settings.spread);
    const direction = tangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(outward, Math.sin(angle));
    const desiredLength = stopped ? .17 + random() * .48 : major ? 2.5 + random() * 3.6 : .35 + random() * Math.min(1.25, parent.length * .36);
    // Keep random crowns within the existing inspection camera, including depth.
    const rise = Math.max(.35, direction.y + .38);
    const radial = Math.hypot(start.x, start.z);
    const horizontal = Math.max(.25, Math.hypot(direction.x, direction.z));
    const reach = Math.max(.18, Math.min(desiredLength, (4.65 - start.y) / rise,
      Math.max(.35, 4.3 - radial) / horizontal));
    const divisions = stopped ? integer(2, 3) : major ? integer(5, 8) : integer(3, 5);
    const steps = Array.from({ length: divisions }, () => .45 + random());
    const total = steps.reduce((sum, step) => sum + step, 0);
    const roughness = .35 + settings.curvature * .65;
    const points = [start];
    let turn = random() < .5 ? -1 : 1;
    const previousHeading = direction.clone();
    for (let i = 0; i < divisions; i++) {
      // Unequal internodes and independent turns in two planes make crooked
      // elbows, with occasional changes of direction rather than a sine wave.
      if (random() < .48) turn *= -1;
      const deflection = i === 0 ? 0 : turn * (.22 + random() * .55) * roughness;
      const twist = i === 0 ? 0 : vary(.42) * roughness;
      const heading = direction.clone().applyAxisAngle(lateral, deflection).applyAxisAngle(outward, twist)
        .add(new THREE.Vector3(0, .12 * i / divisions, 0)).normalize();
      const change = previousHeading.angleTo(heading);
      const maxTurn = .8 + Math.min(2, settings.curvature) * .22;
      if (change > maxTurn) {
        const rotation = new THREE.Quaternion().setFromUnitVectors(previousHeading, heading);
        heading.copy(previousHeading).applyQuaternion(new THREE.Quaternion().slerp(rotation, maxTurn / change));
      }
      points.push(points[points.length - 1].clone().addScaledVector(heading, reach * steps[i] / total));
      previousHeading.copy(heading);
    }
    const parentRadius = parent.radius * (parent.tip + (1 - parent.tip) * Math.pow(1 - at, .78));
    const radius = parentRadius * (stopped ? .24 + random() * .22 : major ? .48 + random() * .16 : .3 + random() * .23);
    // Buds emerge only after the parent's growing tip has passed their actual node.
    const birth = parent.growthStart + (parent.growthEnd - parent.growthStart) * at + .018;
    const end = Math.min(.96, birth + (stopped ? .065 : major ? .17 : .10) + reach * .06);
    return add(points, radius, stopped ? .28 + random() * .28 : major ? .065 : .035,
      birth, end, parentIndex, at, stopped ? "stub" : "shoot");
  };

  const mainCount = integer(3, 7);
  const mainNodes = attachments(mainCount, .24, .81, .045);
  const crownPhase = random() * Math.PI * 2;
  const limbs = mainNodes.map((at, i) => grow(0, at, crownPhase + i * 2.399963 + vary(.85), true));
  for (const parent of limbs) {
    const nodes = attachments(integer(1, 4), .2, .88, .08);
    const phase = random() * Math.PI * 2;
    for (let i = 0; i < nodes.length; i++) {
      const twig = grow(parent, nodes[i], phase + i * 2.399963 + vary(.9), false);
      if (random() < .3 && stems[twig].growthEnd < .84 && stems[twig].length > .65) {
        grow(twig, .35 + random() * .35, random() * Math.PI * 2, false);
      }
    }
  }
  for (const at of attachments(integer(0, 3), .45, .93, .08)) {
    grow(0, at, random() * Math.PI * 2, false);
  }
  // Arrested side shoots keep a short, weathered silhouette while older wood
  // thickens. They are born on the growth timeline just like the longer limbs.
  for (const parent of [0, ...limbs]) {
    const count = parent === 0 ? integer(6, 10) : integer(1, 3);
    const phase = random() * Math.PI * 2;
    for (const [i, at] of attachments(count, parent === 0 ? .15 : .16, .86, .04).entries()) {
      grow(parent, at, phase + i * 2.399963 + vary(.7), false, true);
    }
  }
  return stems;
}
