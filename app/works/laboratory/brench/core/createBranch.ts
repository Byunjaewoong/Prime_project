import * as THREE from "three";
import { BARK_TILE_LENGTH, BARK_TILE_WIDTH, type BarkSurface } from "./barkSurface";

export type BranchSettings = {
  seed: number;
  curvature: number;
  spread: number;
  texture: number;
};

type Stem = {
  curve: THREE.CatmullRomCurve3;
  radius: number;
  tip: number;
  length: number;
  growthStart: number;
  growthEnd: number;
};

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function tube(stem: Stem, random: () => number, bark: BarkSurface, detail: number) {
  const segments = Math.max(18, Math.ceil(stem.length * (stem.radius > .08 ? 64 : 32)));
  const sides = stem.radius > .22 ? 96 : stem.radius > .08 ? 64 : 24;
  const stride = sides + 1, vertices = (segments + 1) * stride;
  const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2), repeats = new Float32Array(vertices);
  const colors = new Float32Array(vertices * 3), indices: number[] = [];
  const phase = random() * Math.PI * 2;
  const offsetU = random(), offsetV = random();
  const centers = Array.from({ length: segments + 1 }, (_, i) => stem.curve.getPointAt(i / segments));
  const frames = centers.map((_, i) => {
    const tangent = stem.curve.getTangentAt(i / segments).normalize();
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    return { normal, binormal: new THREE.Vector3().crossVectors(tangent, normal).normalize(), tangent };
  });
  const angles = Array.from({ length: stride }, (_, j) => {
    const a = (j % sides) / sides * Math.PI * 2 - Math.PI / 2;
    return { cos: Math.cos(a), sin: Math.sin(a), a };
  });
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= sides; j++) {
      const vertex = i * stride + j;
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
    const fraction = THREE.MathUtils.clamp((progress - stem.growthStart) / (stem.growthEnd - stem.growthStart), 0, 1);
    const frontier = fraction * segments;
    const visible = Math.ceil(frontier);
    geometry.setDrawRange(0, visible * 6 * sides);
    if (!visible) {
      flakeGeometry.setDrawRange(0, 0);
      return !wasHidden;
    }
    // The growing apex moves continuously between rings; it never exposes a cut end.
    tipCenter.copy(centers[Math.floor(frontier)]).lerp(centers[Math.min(segments, Math.ceil(frontier))], frontier % 1);
    for (let i = 0; i <= visible; i++) {
      const t = Math.min(i / segments, fraction);
      const center = i === visible ? tipCenter : centers[i];
      const frame = frames[i];
      const birth = stem.growthStart + (stem.growthEnd - stem.growthStart) * t;
      const age = THREE.MathUtils.clamp((progress - birth) / Math.max(.001, 1 - birth), 0, 1);
      ringAge[i] = age;
      const matureRadius = stem.radius * (stem.tip + (1 - stem.tip) * Math.pow(1 - t, .78));
      // Primary elongation precedes secondary growth. Every ring has its own age.
      const shootRadius = Math.min(.009, matureRadius * .13);
      const thickness = shootRadius + (matureRadius - shootRadius) * Math.pow(age, 1.4);
      const tipDistance = (fraction - t) * stem.length;
      const tipTaper = THREE.MathUtils.smoothstep(tipDistance, 0, .12);
      const collar = stem.growthStart > 0 ? .14 * Math.exp(-(((t - .055) / .06) ** 2)) : 0;
      const swell = 1 + collar + .055 * Math.sin(t * 19 + phase) + .018 * Math.sin(t * 43 + phase * 1.7);
      const radius = thickness * tipTaper * swell;
      const repeat = Math.PI * 2 * radius / BARK_TILE_WIDTH;
      const v = t * stem.length / BARK_TILE_LENGTH + offsetV;
      for (let j = 0; j <= sides; j++) {
        const { cos, sin, a } = angles[j];
        const relief = bark.reliefAt(j / sides, v, repeat, offsetU) - .5;
        // Bound displacement on young shoots while retaining full-resolution PBR detail.
        const r = radius * (1 + .045 * Math.sin(a * 5 + t * 3 + phase))
          + Math.min(radius * (.1 + detail * .18), .035 + detail * .025) * relief;
        const vertex = i * stride + j, k = vertex * 3;
        positions[k] = center.x + r * (frame.normal.x * cos + frame.binormal.x * sin);
        positions[k + 1] = center.y + r * (frame.normal.y * cos + frame.binormal.y * sin);
        positions[k + 2] = center.z + r * (frame.normal.z * cos + frame.binormal.z * sin);
        uvs[vertex * 2] = j / sides;
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
          const tangent = frames[i].tangent;
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
      const source = sources[i], ring = Math.floor(source / stride), center = centers[ring];
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
  flakeGeometry.computeBoundingSphere();
  update(0);
  return { geometry, flakeGeometry, offsetU, update };
}

export function createBranch(settings: BranchSettings, bark: BarkSurface) {
  const random = randomSource(settings.seed);
  const vary = (amount: number) => (random() - .5) * 2 * amount;
  const materials: THREE.MeshStandardMaterial[] = [];
  const group = new THREE.Group();
  const stems: Stem[] = [];
  const growthMeshes: ReturnType<typeof tube>[] = [];
  const makeStem = (points: THREE.Vector3[], radius: number, tip = .08, growthStart = 0, growthEnd = 1) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const stem = { curve, radius, tip, length: curve.getLength(), growthStart, growthEnd };
    stems.push(stem);
    const growth = tube(stem, random, bark, settings.texture);
    const { geometry, flakeGeometry } = growth;
    const material = bark.material(settings.texture, growth.offsetU);
    materials.push(material);
    growthMeshes.push(growth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const flakeMesh = new THREE.Mesh(flakeGeometry, material);
    flakeMesh.castShadow = true;
    flakeMesh.receiveShadow = true;
    group.add(flakeMesh);
    return stem;
  };
  const point = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const trunkPoints = [
    [-1.65, -5.2], [-1.18, -4.65], [-.42, -4.0], [.12, -3.3], [.35, -2.52],
    [.19, -1.71], [.43, -.96], [.24, -.2], [-.17, .51], [-.51, 1.27],
    [-.61, 2.09], [-.43, 2.88], [-.48, 3.62], [-.29, 4.38],
  ].map(([x, y], i) => point(x + vary((i === 0 ? .035 : .13) * settings.curvature), y + vary(.07 * settings.curvature), vary(.13)));
  const guideCurve = new THREE.CatmullRomCurve3(trunkPoints, false, "centripetal");
  const trunkGuide: Stem = {
    curve: guideCurve, radius: .31, tip: .08, length: guideCurve.getLength(),
    growthStart: .09, growthEnd: .68,
  };
  // Extend the main mesh below the frame while retaining the original attachment positions.
  makeStem([
    point(-2.42, -6.43, trunkPoints[0].z - .08),
    point(-1.97, -5.63, trunkPoints[0].z - .02),
    ...trunkPoints,
  ], .33, .08, 0, .68);

  // Large limbs are deliberately sparse. Random perturbations change each silhouette
  // while keeping the broad, asymmetric branching rhythm of the reference.
  const limbs: { parent: Stem; at: number; offsets: [number, number, number?][]; radius: number }[] = [
    { parent: trunkGuide, at: .30, radius: .165, offsets: [[-.7, .10], [-1.55, .5], [-2.34, 1.08], [-3.10, 1.34], [-3.58, 1.25], [-3.65, 1.72], [-3.52, 2.47], [-3.72, 3.01], [-4.04, 3.14]] },
    { parent: trunkGuide, at: .24, radius: .17, offsets: [[.52, .55], [1.13, 1.29], [1.54, 2.11], [1.69, 2.95], [2.15, 3.73], [2.49, 4.55], [2.62, 5.40], [2.87, 6.12]] },
    { parent: trunkGuide, at: .65, radius: .125, offsets: [[-.58, .53], [-1.30, 1.02], [-2.02, 1.57], [-2.57, 2.05], [-2.85, 2.12]] },
    { parent: trunkGuide, at: .55, radius: .12, offsets: [[.42, .7], [1.00, 1.39], [1.35, 2.09], [1.47, 2.86], [1.66, 3.59], [1.95, 4.21]] },
  ];

  const grown: Stem[] = [];
  for (const limb of limbs) {
    const start = limb.parent.curve.getPointAt(limb.at);
    const points = [start];
    for (let i = 0; i < limb.offsets.length; i++) {
      const [dx, dy, dz = 0] = limb.offsets[i];
      const variation = i === 0 ? .035 : .16 * settings.curvature;
      points.push(point(start.x + dx * settings.spread + vary(variation), start.y + dy + vary(variation), start.z + dz + vary(.22)));
    }
    const birth = limb.parent.growthStart + (limb.parent.growthEnd - limb.parent.growthStart) * limb.at;
    const reach = new THREE.CatmullRomCurve3(points, false, "centripetal").getLength();
    const finish = Math.min(.94, birth + .17 + reach * .055);
    grown.push(makeStem(points, limb.radius * (.9 + random() * .22), .075, birth, finish));
  }

  const addTwig = (parent: Stem, at: number, side: number, length: number, radius: number, hook = false) => {
    const start = parent.curve.getPointAt(at);
    const tangent = parent.curve.getTangentAt(at).normalize();
    const outward = new THREE.Vector3(-tangent.y * side, tangent.x * side, vary(.38)).normalize();
    const direction = tangent.clone().multiplyScalar(.35).addScaledVector(outward, .9).normalize();
    const first = start.clone().addScaledVector(direction, length * .32);
    const middle = start.clone().addScaledVector(direction, length * .69).add(point(vary(.13) * settings.curvature, vary(.13) * settings.curvature, vary(.12)));
    const end = start.clone().addScaledVector(direction, length).add(point(
      hook ? -direction.x * length * .25 : vary(.22) * settings.curvature,
      hook ? -length * .18 : vary(.18) * settings.curvature,
      vary(.17),
    ));
    const birth = parent.growthStart + (parent.growthEnd - parent.growthStart) * at;
    return makeStem([start, first, middle, end], radius, .035, birth, Math.min(.94, birth + .10 + length * .09));
  };

  const [left, right, upperLeft, upperRight] = grown;
  addTwig(left, .62, 1, .55, .045, true);
  addTwig(left, .83, -1, .42, .032, true);
  addTwig(right, .46, -1, .82, .055);
  addTwig(right, .67, 1, .59, .042);
  addTwig(right, .84, -1, .66, .037, true);
  addTwig(upperLeft, .58, -1, .94, .043);
  addTwig(upperLeft, .87, 1, .42, .026);
  addTwig(upperRight, .53, -1, .62, .045);
  addTwig(upperRight, .79, 1, .57, .035);
  addTwig(trunkGuide, .81, 1, .82, .046);
  addTwig(trunkGuide, .96, -1, .44, .025);
  for (const parent of grown) {
    const count = 1 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      addTwig(parent, .2 + random() * .65, random() < .5 ? -1 : 1, .25 + random() * .4, .022 + random() * .018);
    }
  }

  return {
    group,
    setGrowth: (progress: number) => {
      let changed = false;
      for (const growth of growthMeshes) {
        changed = growth.update(progress) || changed;
      }
      return changed;
    },
    dispose: () => {
      group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      materials.forEach(material => material.dispose());
    },
    count: stems.length,
  };
}
