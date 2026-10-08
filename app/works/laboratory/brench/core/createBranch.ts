import * as THREE from "three";
import type { BarkSurface } from "./barkSurface";

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
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const phase = random() * Math.PI * 2;
  const offsetU = random(), offsetV = random();
  const tileLength = Math.max(.55, stem.radius * Math.PI * 4);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = stem.curve.getPointAt(t);
    const tangent = stem.curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const taper = Math.pow(1 - t, .78);
    const radius = stem.radius * (stem.tip + (1 - stem.tip) * taper);
    const collar = stem.growthStart > 0 ? .14 * Math.exp(-(((t - .055) / .06) ** 2)) : 0;
    const swell = 1 + collar + .055 * Math.sin(t * 19 + phase) + .018 * Math.sin(t * 43 + phase * 1.7);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2 - Math.PI / 2;
      const u = j / sides + offsetU;
      const v = t * stem.length / tileLength + offsetV;
      const relief = bark.heightAt(u, v) - .5;
      const ridged = 1 + .045 * Math.sin(a * 5 + t * 3 + phase) + relief * (.1 + detail * .18);
      const r = radius * swell * ridged;
      positions.push(
        center.x + r * (normal.x * Math.cos(a) + binormal.x * Math.sin(a)),
        center.y + r * (normal.y * Math.cos(a) + binormal.y * Math.sin(a)),
        center.z + r * (normal.z * Math.cos(a) + binormal.z * Math.sin(a)),
      );
      uvs.push(u, v);
      const weather = .92 + .06 * Math.sin(t * 9 + a * 3 + phase);
      colors.push(weather, weather * .99, weather * .96);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The seam has duplicated UV vertices; average their normals to keep lighting smooth.
  const normals = geometry.getAttribute("normal");
  for (let i = 0; i <= segments; i++) {
    const first = i * (sides + 1), last = first + sides;
    const n = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, n.x, n.y, n.z);
    normals.setXYZ(last, n.x, n.y, n.z);
  }
  // A few raised strips make chipped bark catch light and cast real shadows.
  // Their UVs continue the underlying surface, rather than floating unrelated marks.
  const flakeRandom = randomSource(Math.floor(phase * 1e7) + 241);
  const flakes = stem.radius > .08 ? Array.from({ length: Math.ceil(stem.length * stem.radius * 38) }, () => {
    const start = Math.floor((.04 + flakeRandom() * .78) * segments);
    return { start, end: Math.min(segments - 1, start + 5 + Math.floor(flakeRandom() * 14)), side: Math.floor(flakeRandom() * (sides - 3)), lift: .025 + flakeRandom() * .07 };
  }).sort((a, b) => a.end - b.end) : [];
  const flakePositions: number[] = [], flakeUvs: number[] = [], flakeColors: number[] = [], flakeIndices: number[] = [];
  for (const flake of flakes) {
    const base = flakePositions.length / 3;
    for (let row = 0; row < 4; row++) {
      const ring = Math.round(flake.start + (flake.end - flake.start) * row / 3);
      const center = stem.curve.getPointAt(ring / segments);
      for (let column = 0; column < 3; column++) {
        const vertex = ring * (sides + 1) + flake.side + column;
        const p = new THREE.Vector3(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
        const radial = p.clone().sub(center);
        const lift = (row / 3) ** 2 * flake.lift * (column === 1 ? 1 : .75);
        p.addScaledVector(radial, lift);
        flakePositions.push(p.x, p.y, p.z);
        flakeUvs.push(uvs[vertex * 2], uvs[vertex * 2 + 1]);
        flakeColors.push(.97, .955, .925);
        if (row < 3 && column < 2) {
          const k = base + row * 3 + column;
          flakeIndices.push(k, k + 1, k + 3, k + 1, k + 4, k + 3);
        }
      }
    }
  }
  const flakeGeometry = new THREE.BufferGeometry();
  flakeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(flakePositions, 3));
  flakeGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(flakeUvs, 2));
  flakeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(flakeColors, 3));
  flakeGeometry.setIndex(flakeIndices);
  flakeGeometry.computeVertexNormals();
  flakeGeometry.setDrawRange(0, 0);
  return { geometry, segments, sides, flakeGeometry, flakeEnds: flakes.map(flake => flake.end + 3) };
}

export function createBranch(settings: BranchSettings, bark: BarkSurface) {
  const random = randomSource(settings.seed);
  const vary = (amount: number) => (random() - .5) * 2 * amount;
  const materials: THREE.MeshStandardMaterial[] = [];
  const group = new THREE.Group();
  const stems: Stem[] = [];
  const growthMeshes: {
    geometry: THREE.BufferGeometry;
    segments: number;
    sides: number;
    start: number;
    end: number;
    original: Float32Array;
    originalNormals: Float32Array;
    centers: THREE.Vector3[];
    flakeGeometry: THREE.BufferGeometry;
    flakeEnds: number[];
    lastVisible: number;
    mature: boolean;
  }[] = [];
  const makeStem = (points: THREE.Vector3[], radius: number, tip = .08, growthStart = 0, growthEnd = 1) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const stem = { curve, radius, tip, length: curve.getLength(), growthStart, growthEnd };
    stems.push(stem);
    const { geometry, segments, sides, flakeGeometry, flakeEnds } = tube(stem, random, bark, settings.texture);
    const material = bark.material(settings.texture, THREE.MathUtils.clamp(radius / .12, .3, 1));
    materials.push(material);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setUsage(THREE.DynamicDrawUsage);
    (geometry.getAttribute("normal") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    geometry.setDrawRange(0, 0);
    growthMeshes.push({
      geometry, segments, sides, start: growthStart, end: growthEnd,
      original: new Float32Array(positions.array as Float32Array),
      originalNormals: new Float32Array(geometry.getAttribute("normal").array as Float32Array),
      centers: Array.from({ length: segments + 1 }, (_, i) => curve.getPointAt(i / segments)),
      flakeGeometry, flakeEnds, lastVisible: -1, mature: false,
    });
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
    const finish = Math.min(1, birth + .17 + reach * .055);
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
    return makeStem([start, first, middle, end], radius, .035, birth, Math.min(1, birth + .10 + length * .09));
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
        const { geometry, segments, sides, start, end, original, originalNormals, centers, flakeGeometry, flakeEnds } = growth;
        const fraction = THREE.MathUtils.clamp((progress - start) / (end - start), 0, 1);
        const visible = Math.floor(fraction * segments);
        const mature = fraction >= 1;
        if (visible === growth.lastVisible && mature === growth.mature) continue;
        changed = true;
        growth.lastVisible = visible;
        growth.mature = mature;
        const position = geometry.getAttribute("position") as THREE.BufferAttribute;
        const current = position.array as Float32Array;
        current.set(original);
        const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
        (normal.array as Float32Array).set(originalNormals);
        if (visible > 0 && fraction < 1) {
          const tipRings = Math.min(12, visible);
          for (let ring = visible - tipRings; ring <= visible; ring++) {
            const center = centers[ring];
            const taper = .05 + .95 * (visible - ring) / tipRings;
            for (let side = 0; side <= sides; side++) {
              const offset = (ring * (sides + 1) + side) * 3;
              current[offset] = center.x + (original[offset] - center.x) * taper;
              current[offset + 1] = center.y + (original[offset + 1] - center.y) * taper;
              current[offset + 2] = center.z + (original[offset + 2] - center.z) * taper;
            }
          }
          // Rebuild only the growing cap's normals; the detailed mature surface
          // retains its original normals when scrubbing forwards or backwards.
          const tangent = centers[visible].clone().sub(centers[Math.max(0, visible - 1)]).normalize();
          for (let ring = visible - tipRings; ring <= visible; ring++) {
            const amount = (ring - (visible - tipRings)) / tipRings;
            for (let side = 0; side <= sides; side++) {
              const vertex = ring * (sides + 1) + side;
              const n = new THREE.Vector3().fromBufferAttribute(normal, vertex).addScaledVector(tangent, amount * 1.6).normalize();
              normal.setXYZ(vertex, n.x, n.y, n.z);
            }
          }
        }
        position.needsUpdate = true;
        normal.needsUpdate = true;
        geometry.setDrawRange(0, visible * 6 * sides);
        const flakeCount = fraction >= 1 ? flakeEnds.length : flakeEnds.filter(ring => ring <= visible).length;
        flakeGeometry.setDrawRange(0, flakeCount * 36);
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
