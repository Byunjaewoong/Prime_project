import * as THREE from "three";
import type { Stem } from "./branchSkeleton";
import { sproutPoint, trunkFrontier } from "./sproutGrowth";

/** The plump, folded tip seen on a newly emerging hypocotyl. It parts as the
 * cotyledons spread, then disappears before the straight seedling stage. */
export function createSproutCap(stem: Stem, leafSize: number, hasLeaves: boolean) {
  const geometry = new THREE.SphereGeometry(1, 28, 16);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const original = new Float32Array(positions.array);
  const material = new THREE.MeshStandardMaterial({ color: 0xc4d542, roughness: .64, metalness: 0,
    emissive: 0x243300, emissiveIntensity: .045 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "folded-sprout-tip";
  mesh.castShadow = mesh.receiveShadow = true;
  const update = (time: number) => {
    const opening = (hasLeaves ? 1 : 0) * THREE.MathUtils.smoothstep(time, .012, .042)
      * (1 - THREE.MathUtils.smoothstep(time, .075, .12));
    mesh.visible = opening > .001;
    if (!mesh.visible) return;
    const frontier = trunkFrontier(time);
    const center = sproutPoint(stem, time, frontier * .76, frontier);
    const width = .25 * leafSize * opening, height = .12 * leafSize * opening;
    const depth = .16 * leafSize * opening;
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(i, center.x + original[i * 3] * width,
        center.y + original[i * 3 + 1] * height,
        center.z + original[i * 3 + 2] * depth);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    material.color.set(0xdbe14e).lerp(new THREE.Color(0x8fc72d),
      THREE.MathUtils.smoothstep(time, .04, .12));
  };
  update(0);
  return { mesh, update, dispose: () => material.dispose() };
}
