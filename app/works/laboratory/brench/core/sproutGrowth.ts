import * as THREE from "three";
import type { Stem } from "./branchSkeleton";

export type SproutPose = { point: THREE.Vector3; tangent: THREE.Vector3; hook: number };

const EARLY_END = .12, SEEDLING_END = .34, TRUNK_END = .52;
const EARLY_LENGTH = EARLY_END / TRUNK_END, SEEDLING_LENGTH = .34;

/** Early vertical growth remains compact, then the sapling accelerates. The
 * inverse schedules branches only after their attachment point exists. */
export function trunkFrontier(time: number) {
  const t = THREE.MathUtils.clamp(time, 0, 1);
  if (t <= EARLY_END) return t / TRUNK_END;
  if (t <= SEEDLING_END) return EARLY_LENGTH + (t - EARLY_END) / (SEEDLING_END - EARLY_END)
    * (SEEDLING_LENGTH - EARLY_LENGTH);
  return Math.min(1, SEEDLING_LENGTH + (t - SEEDLING_END) / (TRUNK_END - SEEDLING_END)
    * (1 - SEEDLING_LENGTH));
}

export function trunkTimeAt(fraction: number) {
  const f = THREE.MathUtils.clamp(fraction, 0, 1);
  if (f <= EARLY_LENGTH) return f * TRUNK_END;
  if (f <= SEEDLING_LENGTH) return EARLY_END + (f - EARLY_LENGTH)
    / (SEEDLING_LENGTH - EARLY_LENGTH) * (SEEDLING_END - EARLY_END);
  return SEEDLING_END + (f - SEEDLING_LENGTH) / (1 - SEEDLING_LENGTH)
    * (TRUNK_END - SEEDLING_END);
}

/** The hypocotyl first lifts a folded, downturned apex. It straightens before
 * the cotyledon node stops rising and the shoot continues above that node. */
export function sproutPoint(stem: Stem, time: number, at: number, frontier: number) {
  const t = THREE.MathUtils.clamp(at, 0, 1);
  const point = stem.curve.getPointAt(t);
  const hook = 1 - THREE.MathUtils.smoothstep(time, .055, .14);
  if (hook <= 0 || frontier <= .001 || t / frontier <= .55) return point;
  const q = THREE.MathUtils.clamp(t / frontier, 0, 1);
  const theta = (q - .55) / .45 * Math.PI * 1.15;
  const shoulder = THREE.MathUtils.smoothstep(q, .55, .62);
  const length = stem.length * frontier;
  const radius = Math.min(.48, length * .34);
  // The seed-specific azimuth is taken from the growing trunk, so each seed
  // produces a different three-dimensional hook without changing the tree.
  const tangent = stem.curve.getTangentAt(0);
  const sideways = new THREE.Vector3(tangent.z + .9, 0, -tangent.x + .32).normalize();
  point.addScaledVector(sideways, hook * shoulder * radius * (1 - Math.cos(theta)));
  point.y += hook * shoulder * (radius * Math.sin(theta) - length * (q - .55));
  return point;
}

export function sproutPose(stem: Stem, time: number): SproutPose {
  const nodeTime = .14, nodeAt = trunkFrontier(nodeTime);
  const at = Math.min(trunkFrontier(time), nodeAt);
  const frontier = trunkFrontier(time);
  const point = sproutPoint(stem, time, at, frontier);
  const behind = sproutPoint(stem, time, Math.max(0, at - .002), frontier);
  const tangent = point.clone().sub(behind).normalize();
  if (tangent.lengthSq() < .01) tangent.copy(stem.curve.getTangentAt(at));
  return { point, tangent, hook: 1 - THREE.MathUtils.smoothstep(time, .055, .14) };
}
