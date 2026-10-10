import * as THREE from "three";
import { bladePoint, leaflets, type LeafSurfaceType } from "./leafShapes";

export function createLeafGeometry(type: LeafSurfaceType, detail: "specimen" | "canopy" = "specimen") {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const blades = leaflets(type);
  for (const [b, blade] of blades.entries()) {
    // Canopy leaflets occupy far fewer pixels than the isolated specimen. Share the
    // full-resolution PBR maps while spending fewer triangles on interior curvature.
    const rows = detail === "specimen" || type === "lobed" ? 96 : 48;
    const cols = detail === "specimen" ? 6 : blades.length > 1 ? 2 : 4;
    const offset = positions.length / 3;
    const sin = Math.sin(blade.angle), cos = Math.cos(blade.angle);
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
      const v = row / rows, across = col / cols * 2 - 1;
      const [px, py] = bladePoint(blade.shape, v, across);
      const x = px * blade.width * blade.length, y = py * blade.length;
      // A raised midrib, drooping blade margins, a curled tip and slight asymmetry.
      const z = blade.length * (.10 * Math.sin(v * Math.PI) - .095 * across * across * Math.sin(v * Math.PI)
        + .042 * Math.sin(v * 9 + b) * across * across * Math.sin(v * Math.PI) + .055 * Math.pow(v, 5));
      positions.push(blade.x + x * cos - y * sin, blade.y + x * sin + y * cos, z + .016 * b * v);
      // Planar UVs keep veins the same width across the blade, including the pointed tip.
      uvs.push(px + .5, v);
      if (row < rows && col < cols) {
        const k = offset + row * (cols + 1) + col;
        indices.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

/** Separate woody-green petiolules connect every compound leaflet to its rachis. */
export function createLeafRachis(type: LeafSurfaceType) {
  const blades = leaflets(type);
  if (blades.length === 1) return null;
  const end = type === "pinnate" ? .94 : .27;
  const geometry = new THREE.CylinderGeometry(.004, .008, end, 6);
  geometry.translate(0, end / 2, 0);
  return geometry;
}

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let u = fract(x), v = fract(y); u *= u * (3 - 2 * u); v *= v * (3 - 2 * v);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u),
    THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}

function createMaps(type: LeafSurfaceType) {
  const width = type === "cotyledon" ? 256 : 512, height = width * 2;
  const albedo = new Uint8Array(width * height * 4), normals = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const heights = new Float32Array(width * height);
  const autumn = type === "oval" || type === "pinnate" || type === "round";
  const glossy = type === "lance" || type === "palmate" || type === "variegated";
  const base = type === "oval" ? [151, 57, 23] : type === "round" ? [157, 112, 37] : type === "pinnate" ? [128, 86, 41]
    : type === "cotyledon" ? [179, 207, 55] : glossy ? [33, 77, 25] : [69, 111, 30];
  const veinBases = [.055, .145, .245, .34, .445, .55, .65, .74, .825, .9];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1) - .5, v = y / (height - 1), side = u < 0 ? -1 : 1;
    const ax = Math.abs(u), patch = noise(u * 9 + 4, v * 12), fine = noise(u * 53 + 9, v * 82);
    const midline = u - .006 * Math.sin(v * 11) * Math.sin(v * Math.PI);
    const rib = Math.exp(-Math.pow(midline / (.0045 + (1 - v) * .004), 2));
    const lateralRib = type === "lobed" ? Math.exp(-Math.pow((v - .10 - ax * .76) / .006, 2))
      * THREE.MathUtils.smoothstep(ax, .015, .09) : 0;
    let distance = 1;
    for (let i = 0; i < veinBases.length; i++) {
      const path = veinBases[i] + (side === 1 ? .018 : 0) + ax * (.52 + i * .035) + ax * ax * .38;
      distance = Math.min(distance, Math.abs(v - path));
    }
    const secondary = Math.exp(-Math.pow(distance / .0034, 2)) * (1 - THREE.MathUtils.smoothstep(ax, .32, .5));
    // Fine branching veinlets follow the primary veins, with an irregular cellular network.
    const cell = Math.abs(Math.sin((v - ax * .68) * 171 + noise(u * 28, v * 32) * 3.5)
      * Math.sin(u * 237 + v * 51 + fine * 2));
    const veinlet = Math.pow(Math.max(0, 1 - cell * 8), 3) * .22;
    const pores = hash(x + 71, y + 39);
    const vein = rib * .78 + lateralRib * .65 + secondary * .42 + veinlet;
    const pigment = (patch - .5) * 37 + (fine - .5) * 13 + (pores - .5) * 5;
    const fleck = autumn ? THREE.MathUtils.smoothstep(noise(u * 75 + 3, v * 103), .76, .93) * (.25 + patch * .75) : 0;
    const yellow = type === "variegated" ? 1 - THREE.MathUtils.smoothstep(ax + (patch - .5) * .15 + (fine - .5) * .055, .045, .12) : 0;
    const edgeWear = autumn ? THREE.MathUtils.smoothstep(ax, .24, .48) * patch * .24 : 0;
    const i = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      const green = base[channel] + pigment + vein * (channel === 2 ? 15 : 35);
      albedo[i + channel] = THREE.MathUtils.clamp(THREE.MathUtils.lerp(green, [191, 177, 62][channel] + pigment, yellow)
        * (1 - fleck * .38 - edgeWear), 0, 255);
    }
    albedo[i + 3] = 255;
    heights[y * width + x] = rib * .72 + lateralRib * .55 + secondary * .30 + veinlet * .14 + (fine - .5) * .035 + (pores - .5) * .022;
    const r = THREE.MathUtils.clamp((glossy ? 135 : 192) + patch * 24 - vein * 16 + fleck * 22, 0, 255);
    roughness.set([r, r, r, 255], i);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = (heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)]) * 2.6;
    const dy = (heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x]) * 2.6;
    const length = Math.hypot(dx, dy, 1), i = (y * width + x) * 4;
    normals.set([(-dx / length * .5 + .5) * 255, (-dy / length * .5 + .5) * 255, (1 / length * .5 + .5) * 255, 255], i);
  }
  const texture = (data: Uint8Array, color = false) => {
    const map = new THREE.DataTexture(data, width, height);
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
    return map;
  };
  return { map: texture(albedo, true), normalMap: texture(normals), roughnessMap: texture(roughness), glossy };
}

// Keep textures alive across geometry-only adjustments. Release them when the last tree/preview goes away.
const cache = new Map<LeafSurfaceType, { maps: ReturnType<typeof createMaps>; users: number }>();
export function createLeafSurface(type: LeafSurfaceType) {
  let entry = cache.get(type);
  if (!entry) { entry = { maps: createMaps(type), users: 0 }; cache.set(type, entry); }
  entry.users++;
  const { map, normalMap, roughnessMap, glossy } = entry.maps;
  const material = new THREE.MeshPhysicalMaterial({ map, normalMap, roughnessMap,
    normalScale: new THREE.Vector2(.6, .6), side: THREE.DoubleSide, roughness: 1,
    clearcoat: glossy ? .24 : .055, clearcoatRoughness: .4,
    // Very weak transmitted colour prevents paper-black backsides under canopy shade.
    emissiveMap: map, emissive: new THREE.Color(0xffffff), emissiveIntensity: .055,
  });
  return { material, dispose: () => {
    material.dispose();
    if (--entry.users === 0) {
      map.dispose(); normalMap.dispose(); roughnessMap.dispose(); cache.delete(type);
    }
  } };
}
