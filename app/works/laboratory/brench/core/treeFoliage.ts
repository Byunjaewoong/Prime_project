import * as THREE from "three";
import { randomSource, type BranchSettings, type Stem } from "./branchSkeleton";

export function growthTime(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  return p < .28 ? .12 * Math.pow(p / .28, 1.5) : .12 + (p - .28) / .72 * .88;
}

export function createTreeFoliage(stems: Stem[], settings: BranchSettings) {
  const random = randomSource(settings.seed ^ 0x73ad918);
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 16; row++) {
    const v = row / 16, width = Math.pow(Math.sin(v * Math.PI), .8) * .36;
    for (let col = 0; col <= 6; col++) {
      const u = col / 6, x = (u * 2 - 1) * width;
      positions.push(x, v, .10 * Math.sin(v * Math.PI) - Math.abs(x) * .23);
      uvs.push(u, v);
      if (row < 16 && col < 6) {
        const k = row * 7 + col;
        indices.push(k, k + 1, k + 7, k + 1, k + 8, k + 7);
      }
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const pixels = new Uint8Array(128 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
    const u = x / 127, v = y / 255;
    const rib = Math.exp(-Math.abs(u - .5) * 110);
    const branch = Math.pow(Math.max(0, Math.cos((v * 11 - Math.abs(u - .5) * 2.5) * Math.PI * 2)), 22);
    const grain = random() * 9;
    const i = (y * 128 + x) * 4;
    pixels[i] = 72 + rib * 44 + branch * 17 + grain;
    pixels[i + 1] = 111 + rib * 42 + branch * 19 + grain;
    pixels[i + 2] = 35 + rib * 15 + grain;
    pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, 128, 256);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: .76 });
  const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x728448, roughness: .9 });
  const stalkGeometry = new THREE.CylinderGeometry(.006, .009, 1, 5);
  const sites: { origin: THREE.Vector3; direction: THREE.Vector3; twist: number; length: number; birth: number; end: number; cotyledon: boolean }[] = [];
  const add = (stem: Stem, at: number, azimuth: number, cotyledon = false, temporary = false) => {
    const tangent = stem.curve.getTangentAt(at);
    const radial = new THREE.Vector3(Math.cos(azimuth), .18, Math.sin(azimuth));
    const direction = radial.addScaledVector(tangent, cotyledon ? .12 : .35).normalize();
    sites.push({ origin: stem.curve.getPointAt(at), direction, twist: (random() - .5) * 1.2,
      length: (cotyledon ? .38 : .36 + random() * .26) * settings.leafSize,
      birth: stem.growthStart + (stem.growthEnd - stem.growthStart) * at + .005,
      end: cotyledon ? .19 : temporary ? .48 : 2, cotyledon });
  };
  if (settings.leafDensity > 0) {
    add(stems[0], .027, 0, true); add(stems[0], .027, Math.PI, true);
    for (const [i, at] of [.065, .105, .16, .22].entries()) add(stems[0], at, i * 2.399963, false, true);
    stems.forEach(stem => {
      if (stem.kind === "stub" || stem.parent === null || (stem.parent === 0 && stem.attachment < .1)) return;
      const count = Math.round((stem.level >= 2 ? 9 : 4) * settings.leafDensity);
      const phase = random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const at = .3 + (i + random() * .6) / Math.max(1, count) * .66;
        add(stem, at, phase + i * 2.399963);
      }
    });
  }
  const leaves = new THREE.InstancedMesh(geometry, material, sites.length);
  const stalks = new THREE.InstancedMesh(stalkGeometry, stalkMaterial, sites.length);
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stalks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leaves.frustumCulled = stalks.frustumCulled = false;
  leaves.castShadow = leaves.receiveShadow = stalks.castShadow = true;
  const group = new THREE.Group(); group.add(leaves, stalks);
  const object = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let previous = -1;
  const update = (time: number) => {
    if (time === previous) return false;
    previous = time;
    sites.forEach((site, i) => {
      const opening = THREE.MathUtils.smoothstep(time, site.birth, site.birth + (site.cotyledon ? .025 : .065));
      const fading = 1 - THREE.MathUtils.smoothstep(time, site.end - .065, site.end);
      const scale = opening * fading;
      const direction = site.direction.clone().lerp(up, (1 - opening) * .78).normalize();
      const petiole = site.length * .19 * scale;
      object.quaternion.setFromUnitVectors(up, direction);
      object.rotateY(site.twist);
      object.position.copy(site.origin).addScaledVector(direction, petiole);
      object.scale.set(site.length * scale * (.12 + .88 * opening) * (site.cotyledon ? 1.35 : 1), site.length * scale, site.length * scale);
      object.updateMatrix(); leaves.setMatrixAt(i, object.matrix);
      color.set(site.cotyledon ? 0xe0efaa : 0xffffff).lerp(new THREE.Color(0xb3c88b), 1 - opening);
      leaves.setColorAt(i, color);
      object.position.copy(site.origin).addScaledVector(direction, petiole * .5);
      object.scale.set(scale, petiole, scale);
      object.updateMatrix(); stalks.setMatrixAt(i, object.matrix);
    });
    leaves.instanceMatrix.needsUpdate = stalks.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    return true;
  };
  update(0);
  return { group, update, count: sites.length, dispose: () => {
    leaves.dispose(); stalks.dispose();
    material.dispose(); stalkMaterial.dispose(); map.dispose();
  } };
}
