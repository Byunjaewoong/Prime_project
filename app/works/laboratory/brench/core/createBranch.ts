import * as THREE from "three";
import { BARK_TILE_LENGTH, BARK_TILE_WIDTH, type BarkSurface } from "./barkSurface";

import { createBranchSkeleton, randomSource, type BranchSettings, type Stem } from "./branchSkeleton";
import { createTreeFoliage, growthTime } from "./treeFoliage";
import { createStemSections } from "./stemSections";
import { sproutPoint, sproutPose, trunkFrontier, trunkTimeAt } from "./sproutGrowth";
import { createSeedbed } from "./seedbed";
import { createSproutCap } from "./sproutCap";
import { createTreeWind } from "./treeWind";
export type { BranchSettings } from "./branchSkeleton";

const SPROUT_SCALE = 1 / 3;
const MATURE_SCALE = 10;

export function treeScale(time: number) {
  return SPROUT_SCALE + (MATURE_SCALE - SPROUT_SCALE) * THREE.MathUtils.smoothstep(time, .08, .95);
}

function tube(stem: Stem, random: () => number, bark: BarkSurface, detail: number, irregularity: number) {
  const segments = Math.max(18, Math.ceil(stem.length * (stem.radius > .08 ? 64 : 32)));
  const sides = stem.radius > .22 ? 96 : stem.radius > .08 ? 64 : 24;
  const stride = sides + 1, vertices = (segments + 1) * stride;
  const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2), repeats = new Float32Array(vertices), stemV = new Float32Array(vertices);
  const colors = new Float32Array(vertices * 3), indices: number[] = [];
  const phase = random() * Math.PI * 2;
  const offsetU = random(), offsetV = random();
  const sections = createStemSections(stem.length, stem.radius, segments, sides, Math.floor(phase * 1e8), irregularity);
  const centers = Array.from({ length: segments + 1 }, (_, i) => stem.curve.getPointAt(i / segments));
  // Parallel transport avoids frame flips on branches pointing along the depth axis.
  const transported = stem.curve.computeFrenetFrames(segments, false);
  const frames = centers.map((_, i) => ({
    normal: transported.normals[i], binormal: transported.binormals[i], tangent: transported.tangents[i],
  }));
  const angles = Array.from({ length: stride }, (_, j) => {
    const a = (j % sides) / sides * Math.PI * 2 - Math.PI / 2;
    return { cos: Math.cos(a), sin: Math.sin(a), a };
  });
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= sides; j++) {
      const vertex = i * stride + j;
      stemV[vertex] = i / segments;
      const weather = .92 + .06 * Math.sin(i / segments * 9 + angles[j].a * 3 + phase);
      colors.set([weather, weather * .99, weather * .96], vertex * 3);
      if (i < segments && j < sides) {
        indices.push(vertex, vertex + 1, vertex + stride, vertex + 1, vertex + stride + 1, vertex + stride);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", dynamic(positions, 3));
  geometry.setAttribute("normal", dynamic(normals, 3));
  geometry.setAttribute("uv", dynamic(uvs, 2));
  geometry.setAttribute("barkRepeat", dynamic(repeats, 1));
  geometry.setAttribute("stemV", new THREE.BufferAttribute(stemV, 1));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const flakeRandom = randomSource(Math.floor(phase * 1e7) + 241);
  const flakes = stem.radius > .08 ? Array.from({ length: Math.ceil(stem.length * stem.radius * 38) }, () => {
    const start = Math.floor((.04 + flakeRandom() * .78) * segments);
    return { start, end: Math.min(segments - 1, start + 5 + Math.floor(flakeRandom() * 14)), side: Math.floor(flakeRandom() * (sides - 3)), lift: .025 + flakeRandom() * .07 };
  }).sort((a, b) => a.end - b.end) : [];
  const sources: number[] = [], lifts: number[] = [], flakeIndices: number[] = [];
  for (const flake of flakes) {
    const base = sources.length;
    for (let row = 0; row < 4; row++) {
      const ring = Math.round(flake.start + (flake.end - flake.start) * row / 3);
      for (let column = 0; column < 3; column++) {
        sources.push(ring * stride + flake.side + column);
        lifts.push((row / 3) ** 2 * flake.lift * (column === 1 ? 1 : .75));
        if (row < 3 && column < 2) {
          const k = base + row * 3 + column;
          flakeIndices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3);
        }
      }
    }
  }
  const flakeGeometry = new THREE.BufferGeometry();
  flakeGeometry.setAttribute("position", dynamic(new Float32Array(sources.length * 3), 3));
  flakeGeometry.setAttribute("uv", dynamic(new Float32Array(sources.length * 2), 2));
  flakeGeometry.setAttribute("barkRepeat", dynamic(new Float32Array(sources.length), 1));
  flakeGeometry.setAttribute("stemV", new THREE.Float32BufferAttribute(sources.map(source => stemV[source]), 1));
  flakeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(sources.flatMap(() => [.97, .955, .925]), 3));
  flakeGeometry.setIndex(flakeIndices);
  const ringAge = new Float32Array(segments + 1);
  const tipCenter = new THREE.Vector3();
  let previous = -1;
  const update = (time: number) => {
    const progress = THREE.MathUtils.clamp(time, 0, 1);
    if (progress === previous) return false;
    const wasHidden = previous <= stem.growthStart;
    previous = progress;
    const fraction = stem.parent === null ? trunkFrontier(progress)
      : THREE.MathUtils.clamp((progress - stem.growthStart) / (stem.growthEnd - stem.growthStart), 0, 1);
    const frontier = fraction * segments;
    const visible = Math.ceil(frontier);
    geometry.setDrawRange(0, visible * 6 * sides);
    if (!visible) {
      flakeGeometry.setDrawRange(0, 0);
      return !wasHidden;
    }
    // The growing apex moves continuously between rings; it never exposes a cut end.
    const hooking = stem.parent === null && progress < .14;
    const centerAt = (t: number) => hooking ? sproutPoint(stem, progress, t, fraction) : stem.curve.getPointAt(t);
    tipCenter.copy(centerAt(fraction));
    const activeFrames = hooking ? Array.from({ length: visible + 1 }, (_, i) => {
      const t = Math.min(i / segments, fraction);
      const lower = centerAt(Math.max(0, t - 1 / segments));
      const upper = centerAt(Math.min(fraction, t + 1 / segments));
      const tangent = upper.sub(lower).normalize();
      const rotation = new THREE.Quaternion().setFromUnitVectors(frames[i].tangent, tangent);
      return { tangent, normal: frames[i].normal.clone().applyQuaternion(rotation),
        binormal: frames[i].binormal.clone().applyQuaternion(rotation) };
    }) : null;
    for (let i = 0; i <= visible; i++) {
      const t = Math.min(i / segments, fraction);
      const center = i === visible ? tipCenter : hooking ? centerAt(t) : centers[i];
      const frame = activeFrames?.[i] ?? frames[i];
      const birth = stem.parent === null ? trunkTimeAt(t)
        : stem.growthStart + (stem.growthEnd - stem.growthStart) * t;
      const age = THREE.MathUtils.clamp((progress - birth) / Math.max(.001, 1 - birth), 0, 1);
      ringAge[i] = age;
      const matureRadius = stem.radius * (stem.tip + (1 - stem.tip) * Math.pow(1 - t, .78));
      // Primary elongation precedes secondary growth. Every ring has its own age.
      const shootRadius = Math.min(stem.parent === null ? .028 : .009, matureRadius * .13);
      const secondaryGrowth = stem.parent === null ? THREE.MathUtils.smoothstep(progress, .24, .82) : 1;
      const thickness = shootRadius + (matureRadius - shootRadius) * Math.pow(age, 1.4) * secondaryGrowth;
      const tipDistance = (fraction - t) * stem.length;
      // Short arrested shoots finish with a compact, irregular cap rather than
      // inheriting the long needle-like taper of a live extending shoot.
      const capLength = stem.kind === "stub" ? Math.min(.035, stem.length * .08) : .12;
      const tipTaper = THREE.MathUtils.smoothstep(tipDistance, 0, capLength);
      const collar = stem.growthStart > 0 ? .14 * Math.exp(-(((t - .055) / .06) ** 2)) : 0;
      const rootFlare = stem.parent === null ? .65 * Math.exp(-t / .035) : 0;
      const swell = (1 + collar + rootFlare) * sections.girth[i];
      const radius = thickness * tipTaper * swell;
      const repeat = sections.perimeter[i] * radius / BARK_TILE_WIDTH;
      const v = t * stem.length / BARK_TILE_LENGTH + offsetV;
      for (let j = 0; j <= sides; j++) {
        const { cos, sin, a } = angles[j];
        const vertex = i * stride + j, k = vertex * 3;
        const u = sections.u[vertex];
        const relief = bark.reliefAt(u, v, repeat, offsetU) - .5;
        // Bound displacement on young shoots while retaining full-resolution PBR detail.
        const displacement = Math.min(radius * (.1 + detail * .18), .035 + detail * .025) * relief;
        const rx = radius * sections.x[vertex] + displacement * cos;
        const ry = radius * sections.y[vertex] + displacement * sin;
        positions[k] = center.x + frame.normal.x * rx + frame.binormal.x * ry;
        positions[k + 1] = center.y + frame.normal.y * rx + frame.binormal.y * ry;
        positions[k + 2] = center.z + frame.normal.z * rx + frame.binormal.z * ry;
        if (stem.kind === "stub") {
          const cap = THREE.MathUtils.smoothstep(t, .72, .91) * (1 - THREE.MathUtils.smoothstep(t, .96, 1));
          const splinter = Math.sin(a * 3 + phase) * Math.min(.035, stem.radius * .45) * cap * age;
          positions[k] += frame.tangent.x * splinter;
          positions[k + 1] += frame.tangent.y * splinter;
          positions[k + 2] += frame.tangent.z * splinter;
        }
        uvs[vertex * 2] = u;
        uvs[vertex * 2 + 1] = v;
        repeats[vertex] = repeat;
      }
    }
    // Finite differences only over visible rings, with periodic angular neighbours.
    for (let i = 0; i <= visible; i++) {
      for (let j = 0; j < sides; j++) {
        const k = (i * stride + j) * 3;
        const left = (i * stride + (j + sides - 1) % sides) * 3;
        const right = (i * stride + (j + 1) % sides) * 3;
        const below = (Math.max(0, i - 1) * stride + j) * 3;
        const above = (Math.min(visible, i + 1) * stride + j) * 3;
        const ax = positions[right] - positions[left], ay = positions[right + 1] - positions[left + 1], az = positions[right + 2] - positions[left + 2];
        const bx = positions[above] - positions[below], by = positions[above + 1] - positions[below + 1], bz = positions[above + 2] - positions[below + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        let length = Math.hypot(nx, ny, nz);
        if (length < 1e-12) {
          const tangent = activeFrames?.[i].tangent ?? frames[i].tangent;
          nx = tangent.x; ny = tangent.y; nz = tangent.z; length = 1;
        }
        normals[k] = nx / length; normals[k + 1] = ny / length; normals[k + 2] = nz / length;
      }
      normals.copyWithin((i * stride + sides) * 3, i * stride * 3, i * stride * 3 + 3);
    }
    for (const name of ["position", "normal", "uv", "barkRepeat"]) geometry.getAttribute(name).needsUpdate = true;
    const flakeCount = flakes.filter(flake => flake.end + 3 <= visible).length;
    const fp = flakeGeometry.getAttribute("position") as THREE.BufferAttribute;
    const fu = flakeGeometry.getAttribute("uv") as THREE.BufferAttribute;
    const fr = flakeGeometry.getAttribute("barkRepeat") as THREE.BufferAttribute;
    for (let i = 0; i < flakeCount * 12; i++) {
      const source = sources[i], ring = Math.floor(source / stride);
      const center = hooking ? centerAt(ring / segments) : centers[ring];
      const k = source * 3;
      // Peeling develops with age; chips always stay attached to the growing surface.
      const lift = lifts[i] * ringAge[ring];
      fp.setXYZ(i, positions[k] + (positions[k] - center.x) * lift,
        positions[k + 1] + (positions[k + 1] - center.y) * lift,
        positions[k + 2] + (positions[k + 2] - center.z) * lift);
      fu.setXY(i, uvs[source * 2], uvs[source * 2 + 1]);
      fr.setX(i, repeats[source]);
    }
    fp.needsUpdate = fu.needsUpdate = fr.needsUpdate = true;
    flakeGeometry.setDrawRange(0, flakeCount * 36);
    flakeGeometry.computeVertexNormals();
    return true;
  };
  // Bounds must encompass every age, including when initialized at the seed stage.
  update(1);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  flakeGeometry.computeBoundingSphere();
  update(0);
  return { geometry, flakeGeometry, offsetU, update };
}

export function createBranch(settings: BranchSettings, bark: BarkSurface) {
  const random = randomSource(settings.seed ^ 0x6a09e667);
  const materials: THREE.MeshStandardMaterial[] = [];
  const shootUniforms: { wood: { value: number }; front: { value: number };
    base: { value: THREE.Color }; tip: { value: THREE.Color } }[] = [];
  const stems = createBranchSkeleton(settings);
  const group = new THREE.Group();
  const base = stems[0].curve.getPointAt(0);
  const scalePivot = new THREE.Group();
  const content = new THREE.Group();
  scalePivot.position.copy(base);
  content.position.copy(base).multiplyScalar(-1);
  scalePivot.add(content);
  group.add(scalePivot);
  const growthMeshes: ReturnType<typeof tube>[] = [];
  for (const stem of stems) {
    const growth = tube(stem, random, bark, settings.texture, settings.irregularity);
    const { geometry, flakeGeometry } = growth;
    const material = bark.material(settings.texture, growth.offsetU);
    const shoot = { wood: { value: 0 }, front: { value: 1 },
      base: { value: new THREE.Color(0xe6dcaa) }, tip: { value: new THREE.Color(0xd5e84d) } };
    const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, {
        shootWood: shoot.wood, shootFront: shoot.front, shootBase: shoot.base, shootTip: shoot.tip,
      });
      shader.vertexShader = `attribute float stemV; varying float vStemV;\n${shader.vertexShader}`
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvStemV = stemV;");
      shader.fragmentShader = `uniform float shootWood; uniform float shootFront;
        uniform vec3 shootBase; uniform vec3 shootTip; varying float vStemV;\n${shader.fragmentShader}`
        .replace("#include <color_fragment>", `#include <color_fragment>
          float shootTipBlend = smoothstep(.06, .95, vStemV / max(.015, shootFront));
          diffuseColor.rgb = mix(mix(shootBase, shootTip, shootTipBlend), diffuseColor.rgb, shootWood);`);
    };
    material.customProgramCacheKey = () => `${previousKey}:sprout-wood-v1`;
    shootUniforms.push(shoot);
    materials.push(material);
    growthMeshes.push(growth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    content.add(mesh);
    const flakeMesh = new THREE.Mesh(flakeGeometry, material);
    flakeMesh.castShadow = true;
    flakeMesh.receiveShadow = true;
    content.add(flakeMesh);
  }

  scalePivot.scale.setScalar(MATURE_SCALE);
  const bounds = new THREE.Box3().setFromObject(group).expandByScalar(settings.leafSize * MATURE_SCALE);
  const seedbed = createSeedbed(base, settings.seed);
  content.add(seedbed.group);
  const sproutCap = createSproutCap(stems[0], settings.leafSize, settings.leafDensity > 0);
  content.add(sproutCap.mesh);
  const foliage = createTreeFoliage(stems, settings);
  content.add(foliage.group);
  const wind = createTreeWind(group, settings.height, base.y, settings.thickness);
  const paleBase = new THREE.Color(0xe6dcaa), greenBase = new THREE.Color(0x71ab4e);
  const limeTip = new THREE.Color(0xd5e84d), greenTip = new THREE.Color(0x469d35);
  let lastProgress = -1;
  return {
    group, bounds, updateWind: wind.update,
    setGrowth: (progress: number) => {
      const p = THREE.MathUtils.clamp(progress, 0, 1);
      if (p === lastProgress) return false;
      lastProgress = p;
      const time = growthTime(p);
      scalePivot.scale.setScalar(treeScale(time));
      seedbed.update(time);
      sproutCap.update(time);
      let changed = foliage.update(time, sproutPose(stems[0], time));
      growthMeshes.forEach((growth, i) => {
        changed = growth.update(time) || changed;
        const green = THREE.MathUtils.smoothstep(time, .055, .3);
        shootUniforms[i].base.value.copy(paleBase).lerp(greenBase, green);
        shootUniforms[i].tip.value.copy(limeTip).lerp(greenTip, green);
        shootUniforms[i].front.value = stems[i].parent === null ? Math.max(.001, trunkFrontier(time))
          : THREE.MathUtils.clamp((time - stems[i].growthStart)
            / Math.max(.001, stems[i].growthEnd - stems[i].growthStart), .001, 1);
        shootUniforms[i].wood.value = THREE.MathUtils.smoothstep(time,
          Math.max(.3, stems[i].growthStart + .1), Math.max(.72, stems[i].growthStart + .34));
      });
      return changed;
    },
    dispose: () => {
      group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(material => material.dispose());
      foliage.dispose();
      seedbed.dispose();
      sproutCap.dispose();
      wind.dispose();
    },
    count: stems.length,
  };
}
