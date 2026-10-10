import * as THREE from "three";
import { randomSource } from "./branchSkeleton";

/** A small earthy emergence point gives the sprout a ground reference. It
 * recedes as the study moves from seedling to the full branching tree. */
export function createSeedbed(base: THREE.Vector3, seed: number) {
  const random = randomSource(seed ^ 0x425b0e);
  const group = new THREE.Group();
  group.name = "seedbed";
  const soil = new THREE.MeshStandardMaterial({ color: 0x54422f, roughness: 1, transparent: true, depthWrite: false });
  const grains = new THREE.MeshStandardMaterial({ color: 0x7b6850, roughness: 1, transparent: true, depthWrite: false });
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 16), soil);
  mound.scale.set(1.1, .16, .88);
  mound.position.copy(base).add(new THREE.Vector3(0, -.12, 0));
  mound.receiveShadow = true;
  group.add(mound);
  const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), grains, 96);
  const object = new THREE.Object3D(), color = new THREE.Color();
  for (let i = 0; i < pebbles.count; i++) {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
    object.position.copy(base).add(new THREE.Vector3(
      Math.cos(angle) * radius * 1.1, -.038 + random() * .055, Math.sin(angle) * radius * .86));
    object.rotation.set(random() * 3, random() * 3, random() * 3);
    const size = .015 + random() * .05;
    object.scale.set(size * (1.3 + random()), size * (.3 + random() * .7), size * (1 + random()));
    object.updateMatrix(); pebbles.setMatrixAt(i, object.matrix);
    color.setHSL(.08 + random() * .035, .15 + random() * .1, .34 + random() * .22);
    pebbles.setColorAt(i, color);
  }
  pebbles.receiveShadow = true;
  group.add(pebbles);
  return { group, update: (time: number) => {
    const opacity = 1 - THREE.MathUtils.smoothstep(time, .27, .47);
    group.visible = opacity > .001;
    soil.opacity = grains.opacity = opacity;
  }, dispose: () => { soil.dispose(); grains.dispose(); } };
}
