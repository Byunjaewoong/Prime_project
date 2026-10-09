import * as THREE from "three";
import { randomSource, type BranchSettings, type Stem } from "./branchSkeleton";
import { createLeafGeometry, createLeafRachis, createLeafSurface } from "./leafSurface";

export function growthTime(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  return p < .28 ? .12 * Math.pow(p / .28, 1.5) : .12 + (p - .28) / .72 * .88;
}

export function createTreeFoliage(stems: Stem[], settings: BranchSettings) {
  const random = randomSource(settings.seed ^ 0x73ad918);
  const geometry = createLeafGeometry(settings.leafType, "canopy");
  const surface = createLeafSurface(settings.leafType);
  const cotyledonGeometry = createLeafGeometry("cotyledon");
  const cotyledonSurface = createLeafSurface("cotyledon");
  const rachisGeometry = createLeafRachis(settings.leafType);
  const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x728448, roughness: .9 });
  const stalkGeometry = new THREE.CylinderGeometry(.006, .009, 1, 5);
  const sites: { origin: THREE.Vector3; direction: THREE.Vector3; twist: number; length: number; birth: number; end: number; cotyledon: boolean; tint: number }[] = [];
  const add = (stem: Stem, at: number, azimuth: number, cotyledon = false, temporary = false) => {
    const tangent = stem.curve.getTangentAt(at);
    const radial = new THREE.Vector3(Math.cos(azimuth), .18, Math.sin(azimuth));
    const direction = radial.addScaledVector(tangent, cotyledon ? .12 : .35).normalize();
    sites.push({ origin: stem.curve.getPointAt(at), direction, twist: (random() - .5) * 1.2,
      length: (cotyledon ? .38 : .36 + random() * .26) * settings.leafSize,
      birth: stem.growthStart + (stem.growthEnd - stem.growthStart) * at + .005,
      end: cotyledon ? .19 : temporary ? .48 : 2, cotyledon, tint: .86 + random() * .14 });
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
  const adultSites = sites.filter(site => !site.cotyledon);
  const seedSites = sites.filter(site => site.cotyledon);
  const leaves = new THREE.InstancedMesh(geometry, surface.material, adultSites.length);
  const cotyledons = new THREE.InstancedMesh(cotyledonGeometry, cotyledonSurface.material, seedSites.length);
  const rachises = rachisGeometry ? new THREE.InstancedMesh(rachisGeometry, stalkMaterial, adultSites.length) : null;
  leaves.name = "true-leaves"; cotyledons.name = "cotyledons";
  if (rachises) rachises.name = "leaf-rachises";
  const stalks = new THREE.InstancedMesh(stalkGeometry, stalkMaterial, sites.length);
  const meshes = [leaves, cotyledons, stalks, ...(rachises ? [rachises] : [])];
  meshes.forEach(mesh => {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
  });
  const group = new THREE.Group(); group.name = "foliage"; group.add(...meshes);
  const object = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color(), youngColor = new THREE.Color(0xd2e7a1);
  let previous = -1;
  const update = (time: number) => {
    if (time === previous) return false;
    previous = time;
    let adultIndex = 0, seedIndex = 0;
    sites.forEach((site, i) => {
      const leaf = site.cotyledon ? cotyledons : leaves;
      const index = site.cotyledon ? seedIndex++ : adultIndex++;
      const opening = THREE.MathUtils.smoothstep(time, site.birth, site.birth + (site.cotyledon ? .025 : .065));
      const fading = 1 - THREE.MathUtils.smoothstep(time, site.end - .065, site.end);
      const scale = opening * fading;
      const direction = site.direction.clone().lerp(up, (1 - opening) * .78).normalize();
      const petiole = site.length * .19 * scale;
      object.quaternion.setFromUnitVectors(up, direction);
      object.rotateY(site.twist);
      object.position.copy(site.origin).addScaledVector(direction, petiole);
      object.scale.set(site.length * scale * (.12 + .88 * opening) * (site.cotyledon ? 1.35 : 1), site.length * scale, site.length * scale);
      object.updateMatrix(); leaf.setMatrixAt(index, object.matrix);
      if (!site.cotyledon) rachises?.setMatrixAt(index, object.matrix);
      color.setRGB(site.tint, site.tint, site.tint).lerp(youngColor, (1 - opening) * .4);
      leaf.setColorAt(index, color);
      object.position.copy(site.origin).addScaledVector(direction, petiole * .5);
      object.scale.set(scale, petiole, scale);
      object.updateMatrix(); stalks.setMatrixAt(i, object.matrix);
    });
    meshes.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return true;
  };
  update(0);
  return { group, update, count: sites.length, dispose: () => {
    meshes.forEach(mesh => mesh.dispose());
    surface.dispose(); cotyledonSurface.dispose(); stalkMaterial.dispose();
  } };
}
