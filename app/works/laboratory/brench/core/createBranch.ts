import * as THREE from "three";

export type BranchSettings = {
  seed: number;
  curvature: number;
  spread: number;
  texture: number;
};

type Stem = { curve: THREE.CatmullRomCurve3; radius: number; tip: number; length: number };

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function barkTextures(detail: number) {
  const width = 256;
  const height = 512;
  const color = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(width * height * 4);
  const fract = (value: number) => value - Math.floor(value);
  const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
    const b = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
    return a * (1 - sy) + b * sy;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const broad = noise(x / 38, y / 105);
      const ridges = noise(x / 9, y / 64);
      const fibers = noise(x / 2.8, y / 23);
      const fleck = noise(x / 3.5, y / 3.5);
      const warpedX = x + (broad - .5) * 22 + (ridges - .5) * 9;
      const seam = Math.pow(Math.max(0, Math.cos(warpedX * .16)), 9);
      const pit = Math.max(0, .36 - fleck) * 2.2;
      const grain = (broad - .5) * 44 + (ridges - .5) * 43 + (fibers - .5) * 23 - seam * 62 - pit * 49;
      const contrast = .55 + detail * .85;
      const warmth = noise(x / 73 + 8, y / 112) * 15;
      const i = (y * width + x) * 4;
      color[i] = Math.max(0, Math.min(255, 106 + grain * contrast + warmth));
      color[i + 1] = Math.max(0, Math.min(255, 91 + grain * contrast * .89 + warmth * .7));
      color[i + 2] = Math.max(0, Math.min(255, 73 + grain * contrast * .76 + warmth * .45));
      color[i + 3] = 255;
      const bump = Math.max(0, Math.min(255, 125 + grain * 1.7));
      relief[i] = bump;
      relief[i + 1] = bump;
      relief[i + 2] = bump;
      relief[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(color, width, height, THREE.RGBAFormat);
  const bumpMap = new THREE.DataTexture(relief, width, height, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, bumpMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  return { map, bumpMap };
}

function tube(stem: Stem, random: () => number) {
  const segments = Math.max(14, Math.ceil(stem.length * 20));
  const sides = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const phase = random() * Math.PI * 2;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = stem.curve.getPointAt(t);
    const tangent = stem.curve.getTangentAt(t).normalize();
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const taper = Math.pow(1 - t, .78);
    const radius = stem.radius * (stem.tip + (1 - stem.tip) * taper);
    const swell = 1 + .105 * Math.sin(t * 27 + phase) + .04 * Math.sin(t * 67 + phase * 1.7);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const ridged = 1 + .11 * Math.sin(a * 5 + t * 12 + phase) + .045 * Math.sin(a * 9 - t * 19);
      const r = radius * swell * ridged;
      positions.push(
        center.x + r * (normal.x * Math.cos(a) + binormal.x * Math.sin(a)),
        center.y + r * (normal.y * Math.cos(a) + binormal.y * Math.sin(a)),
        center.z + r * (normal.z * Math.cos(a) + binormal.z * Math.sin(a)),
      );
      uvs.push(j / sides, t * stem.length * 1.2);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createBranch(settings: BranchSettings) {
  const random = randomSource(settings.seed);
  const vary = (amount: number) => (random() - .5) * 2 * amount;
  const textures = barkTextures(settings.texture);
  const material = new THREE.MeshStandardMaterial({
    map: textures.map,
    bumpMap: textures.bumpMap,
    bumpScale: .025 + settings.texture * .065,
    roughness: .94,
    side: THREE.FrontSide,
  });
  const group = new THREE.Group();
  const stems: Stem[] = [];
  const makeStem = (points: THREE.Vector3[], radius: number, tip = .08) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const stem = { curve, radius, tip, length: curve.getLength() };
    stems.push(stem);
    const mesh = new THREE.Mesh(tube(stem, random), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return stem;
  };
  const point = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const trunkPoints = [
    [-1.65, -5.2], [-1.18, -4.65], [-.42, -4.0], [.12, -3.3], [.35, -2.52],
    [.19, -1.71], [.43, -.96], [.24, -.2], [-.17, .51], [-.51, 1.27],
    [-.61, 2.09], [-.43, 2.88], [-.48, 3.62], [-.29, 4.38],
  ].map(([x, y], i) => point(x + vary((i === 0 ? .035 : .13) * settings.curvature), y + vary(.07 * settings.curvature), vary(.13)));
  const guideCurve = new THREE.CatmullRomCurve3(trunkPoints, false, "centripetal");
  const trunkGuide: Stem = { curve: guideCurve, radius: .31, tip: .08, length: guideCurve.getLength() };
  // Extend the main mesh below the frame while retaining the original attachment positions.
  makeStem([
    point(-2.42, -6.43, trunkPoints[0].z - .08),
    point(-1.97, -5.63, trunkPoints[0].z - .02),
    ...trunkPoints,
  ], .33, .08);

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
    grown.push(makeStem(points, limb.radius * (.9 + random() * .22), .075));
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
    return makeStem([start, first, middle, end], radius, .035);
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
    dispose: () => {
      group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      material.dispose();
      textures.map.dispose();
      textures.bumpMap.dispose();
    },
    count: stems.length,
  };
}
