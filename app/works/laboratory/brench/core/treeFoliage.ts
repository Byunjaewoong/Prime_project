import * as THREE from "three";
import { randomSource, type BranchSettings, type Stem } from "./branchSkeleton";
import { createLeafGeometry, createLeafRachis, createLeafSurface } from "./leafSurface";
import type { SproutPose } from "./sproutGrowth";
import { trunkFrontier } from "./sproutGrowth";

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
  const add = (stem: Stem, at: number, azimuth: number, cotyledon = false, temporary = false, firstLeafBirth = 0) => {
    const tangent = stem.curve.getTangentAt(at);
    const radial = new THREE.Vector3(Math.cos(azimuth), .18, Math.sin(azimuth));
    const direction = radial.addScaledVector(tangent, cotyledon ? .12 : .35).normalize();
    sites.push({ origin: stem.curve.getPointAt(at), direction, twist: (random() - .5) * 1.2,
      length: (cotyledon ? .72 : .36 + random() * .26) * settings.leafSize,
      birth: cotyledon ? .018 : Math.max(firstLeafBirth, stem.growthStart + (stem.growthEnd - stem.growthStart) * at + .005),
      end: cotyledon ? .42 : temporary ? .7 : 2, cotyledon, tint: .86 + random() * .14 });
  };
  if (settings.leafDensity > 0) {
    add(stems[0], .27, 0, true, false, .018); add(stems[0], .27, Math.PI, true, false, .018);
    for (const [i, at] of [.48, .52, .6, .66].entries())
      add(stems[0], at, i % 2 ? Math.PI + i * .21 : i * .21, false, true, [.36, .4, .46, .51][i]);
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
  const bud = new THREE.InstancedMesh(createLeafGeometry("lance", "canopy"), cotyledonSurface.material, seedSites.length);
  const rachises = rachisGeometry ? new THREE.InstancedMesh(rachisGeometry, stalkMaterial, adultSites.length) : null;
  leaves.name = "true-leaves"; cotyledons.name = "cotyledons";
  bud.name = "apical-bud";
  if (rachises) rachises.name = "leaf-rachises";
  const stalks = new THREE.InstancedMesh(stalkGeometry, stalkMaterial, sites.length);
  const meshes = [leaves, cotyledons, bud, stalks, ...(rachises ? [rachises] : [])];
  meshes.forEach(mesh => {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
  });
  // Matching pivots on blades, compound rachises and petioles keep the entire
  // leaf connected while fluttering. Phase comes from its immutable attachment.
  const attachWind = (mesh: THREE.InstancedMesh, entries: typeof sites) => {
    const data = new Float32Array(entries.length * 4);
    entries.forEach((site, i) => data.set([site.origin.x, site.origin.y, site.origin.z,
      site.origin.x * 13.7 + site.origin.y * 5.3 + site.origin.z * 9.1 + site.twist * 7], i * 4));
    const attribute = new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
    mesh.geometry.setAttribute("windAttachment", attribute);
    return attribute;
  };
  attachWind(leaves, adultSites);
  const cotyledonWind = attachWind(cotyledons, seedSites);
  const budWind = attachWind(bud, seedSites);
  const stalkWind = attachWind(stalks, sites);
  if (rachises) attachWind(rachises, adultSites);
  const group = new THREE.Group(); group.name = "foliage"; group.add(...meshes);
  const object = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color(), youngColor = new THREE.Color(0xd2e7a1);
  const radial = new THREE.Vector3(), openDirection = new THREE.Vector3(), closedDirection = new THREE.Vector3();
  let previous = -1;
  const update = (time: number, sprout: SproutPose) => {
    if (time === previous) return false;
    previous = time;
    let adultIndex = 0, seedIndex = 0;
    sites.forEach((site, i) => {
      const leaf = site.cotyledon ? cotyledons : leaves;
      const index = site.cotyledon ? seedIndex++ : adultIndex++;
      const opening = THREE.MathUtils.smoothstep(time, site.birth, site.birth + (site.cotyledon ? .025 : .065));
      const fading = 1 - THREE.MathUtils.smoothstep(time, site.end - .065, site.end);
      const scale = opening * fading;
      const unfolding = site.cotyledon ? THREE.MathUtils.smoothstep(time, .045, .155) : 1;
      radial.set(site.direction.x, 0, site.direction.z).normalize();
      openDirection.copy(radial).addScaledVector(up, .16).normalize();
      closedDirection.copy(sprout.tangent).addScaledVector(radial, .55).normalize();
      const direction = site.cotyledon ? closedDirection.clone().lerp(openDirection, unfolding).normalize()
        : site.direction.clone().lerp(up, (1 - opening) * .78).normalize();
      const origin = site.cotyledon ? sprout.point : site.origin;
      const length = site.length * (site.cotyledon ? .32 + .68 * unfolding : 1);
      const petiole = length * .19 * scale;
      object.quaternion.setFromUnitVectors(up, direction);
      object.rotateY(site.twist * (site.cotyledon ? unfolding * .6 : 1));
      object.position.copy(origin).addScaledVector(direction, petiole);
      object.scale.set(length * scale * (.12 + .88 * opening) * (site.cotyledon ? 1.85 : 1), length * scale, length * scale);
      object.updateMatrix(); leaf.setMatrixAt(index, object.matrix);
      if (!site.cotyledon) rachises?.setMatrixAt(index, object.matrix);
      color.set(site.cotyledon ? 0xf5f8c4 : 0xffffff).multiplyScalar(site.tint)
        .lerp(youngColor, (1 - opening) * .4);
      leaf.setColorAt(index, color);
      object.position.copy(origin).addScaledVector(direction, petiole * .5);
      object.scale.set(scale, petiole, scale);
      object.updateMatrix(); stalks.setMatrixAt(i, object.matrix);
      if (site.cotyledon) {
        cotyledonWind.setXYZ(index, origin.x, origin.y, origin.z);
        stalkWind.setXYZ(i, origin.x, origin.y, origin.z);
      }
    });
    const budOrigin = time <= .14 ? sprout.point : stems[0].curve.getPointAt(trunkFrontier(time));
    const budOpening = THREE.MathUtils.smoothstep(time, .085, .23)
      * (1 - THREE.MathUtils.smoothstep(time, .33, .44));
    seedSites.forEach((site, i) => {
      const direction = new THREE.Vector3(i === 0 ? -.34 : .34, 1, (i === 0 ? -1 : 1) * .09).normalize();
      const size = settings.leafSize * .55 * budOpening;
      object.quaternion.setFromUnitVectors(up, direction);
      object.position.copy(budOrigin);
      object.scale.set(size * .65, size, size);
      object.updateMatrix(); bud.setMatrixAt(i, object.matrix);
      color.set(i === 0 ? 0xdaf275 : 0xbde85c).multiplyScalar(site.tint);
      bud.setColorAt(i, color);
      budWind.setXYZ(i, budOrigin.x, budOrigin.y, budOrigin.z);
    });
    cotyledonWind.needsUpdate = stalkWind.needsUpdate = budWind.needsUpdate = true;
    meshes.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return true;
  };
  update(0, { point: stems[0].curve.getPointAt(0), tangent: stems[0].curve.getTangentAt(0), hook: 0 });
  return { group, update, count: sites.length, dispose: () => {
    meshes.forEach(mesh => mesh.dispose());
    surface.dispose(); cotyledonSurface.dispose(); stalkMaterial.dispose();
  } };
}
