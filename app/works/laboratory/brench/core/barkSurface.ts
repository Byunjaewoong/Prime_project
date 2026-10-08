import * as THREE from "three";

const WIDTH = 1024;
const HEIGHT = 2048;
const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (n: number, size: number) => ((n % size) + size) % size;

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x ^ seed, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

// Periodic noise keeps every material channel continuous at both texture seams.
function noiseField(columns: number, rows: number, seed: number) {
  const cells = Float32Array.from({ length: columns * rows }, (_, i) => hash(i % columns, Math.floor(i / columns), seed));
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * columns, y = (v - Math.floor(v)) * rows;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const nx = (ix + 1) % columns, ny = (iy + 1) % rows;
    const a = cells[iy * columns + ix] * (1 - sx) + cells[iy * columns + nx] * sx;
    const b = cells[ny * columns + ix] * (1 - sx) + cells[ny * columns + nx] * sx;
    return a * (1 - sy) + b * sy;
  };
}

export type BarkSurface = ReturnType<typeof createBarkSurface>;

/** One reusable, unlit PBR surface. Large fissures, flaking plates and fine wood
 * fibres share the same height field, so their colour and relief stay aligned. */
export function createBarkSurface(anisotropy: number) {
  const heights = new Float32Array(WIDTH * HEIGHT);
  const albedo = new Uint8Array(WIDTH * HEIGHT * 4);
  const normal = new Uint8Array(WIDTH * HEIGHT * 4);
  // Red = cavity occlusion, green = roughness. Both maps use this one texture.
  const surface = new Uint8Array(WIDTH * HEIGHT * 4);
  const macro = noiseField(8, 12, 41);
  const warpNoise = noiseField(16, 20, 73);
  const chips = noiseField(96, 176, 125);
  const fibreNoise = noiseField(256, 96, 239);
  const fineNoise = noiseField(512, 512, 587);
  const laneCount = 22;
  const lanes = Array.from({ length: laneCount }, (_, i) => ({
    phase: hash(i, 1, 52) * TAU,
    width: .018 + hash(i, 2, 52) * .030,
    rows: 5 + Math.floor(hash(i, 3, 52) * 7),
    offset: hash(i, 4, 52),
  }));
  const laneWidths = lanes.map((_, i) => .55 + hash(i, 9, 319) * 1.15);
  const totalWidth = laneWidths.reduce((sum, width) => sum + width, 0);
  const boundaries = [0];
  laneWidths.forEach(width => boundaries.push(boundaries[boundaries.length - 1] + width / totalWidth));
  boundaries[laneCount] = 1;
  const knots = [
    { u: .22, v: .27, rx: .035, ry: .059 },
    { u: .71, v: .73, rx: .028, ry: .075 },
    { u: .46, v: .91, rx: .023, ry: .045 },
  ];

  for (let y = 0; y < HEIGHT; y++) {
    const v = y / HEIGHT;
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH;
      const weather = macro(u, v);
      const warpValue = warpNoise(u, v);
      let grainU = u + (warpValue - .5) * .045 + Math.sin(v * TAU * 2) * .009;
      let knotCavity = 0, knotRim = 0;
      for (const knot of knots) {
        const du = u - knot.u - Math.round(u - knot.u);
        const dv = v - knot.v - Math.round(v - knot.v);
        if (Math.abs(du) > knot.rx * 3 || Math.abs(dv) > knot.ry * 2.5) continue;
        const distance = Math.sqrt((du / knot.rx) ** 2 + (dv / knot.ry) ** 2);
        // Bend the longitudinal grain around a recessed old bud scar.
        grainU += du * Math.exp(-distance * distance * .65) * 1.25;
        knotCavity = Math.max(knotCavity, 1 - smooth(.25, .88, distance));
        knotRim = Math.max(knotRim, Math.exp(-(((distance - 1) * 5) ** 2)));
      }
      const wrappedU = grainU - Math.floor(grainU);
      let laneIndex = Math.min(laneCount - 1, Math.floor(wrappedU * laneCount));
      while (laneIndex > 0 && wrappedU < boundaries[laneIndex]) laneIndex--;
      while (laneIndex < laneCount - 1 && wrappedU >= boundaries[laneIndex + 1]) laneIndex++;
      const lane = lanes[laneIndex];
      const q = (wrappedU - boundaries[laneIndex]) / (boundaries[laneIndex + 1] - boundaries[laneIndex]);
      const edge = Math.min(q, 1 - q);
      const brokenWidth = lane.width * (.72 + chips(u, v) * .65);
      const fissure = 1 - smooth(brokenWidth * .35, brokenWidth * 2.3, edge);
      const lip = Math.exp(-(((edge - brokenWidth * 2.7) / .035) ** 2));
      const row = v * lane.rows + lane.offset + Math.sin(q * 4 + lane.phase) * .07;
      const rowFraction = row - Math.floor(row);
      const rowEdge = Math.min(rowFraction, 1 - rowFraction);
      const split = (1 - smooth(.006, .033, rowEdge)) * smooth(.015, .13, edge);
      const plateVariation = hash(wrap(laneIndex, laneCount), wrap(Math.floor(row), lane.rows), 811);
      const forkPath = .22 + rowFraction * .48 + Math.sin(rowFraction * 11 + lane.phase) * .065;
      const fork = (1 - smooth(.012, .047, Math.abs(q - forkPath)))
        * smooth(.15, .3, rowFraction) * (1 - smooth(.78, .95, rowFraction)) * smooth(.25, .65, plateVariation);
      const peel = smooth(.56, .96, rowFraction) * smooth(.035, .19, edge) * (.35 + plateVariation * .65);
      const flake = smooth(.43, .8, chips(grainU, v)) * (.3 + plateVariation * .7);
      const fibre = fibreNoise(grainU + .002 * Math.sin(v * TAU * 7), v);
      const fine = fineNoise(u, v);
      const strands = Math.pow(.5 + .5 * Math.sin(grainU * TAU * 170 + (warpValue - .5) * 5), 7);
      const plate = Math.pow(Math.max(0, Math.sin(q * Math.PI)), .42);
      const h = clamp(.37 + plate * .25 + (weather - .5) * .1 + (plateVariation - .5) * .1
        + lip * .085 + flake * .07 + peel * .13 + (fibre - .5) * .09 + (fine - .5) * .033
        - fissure * .40 - split * .19 - fork * .2 - strands * .045 - knotCavity * .46 + knotRim * .12);
      const index = y * WIDTH + x;
      heights[index] = h;
      const cavity = clamp(fissure * .77 + split * .38 + fork * .5 + knotCavity * .9);
      const silver = smooth(.38, .8, weather) * (1 - fissure) * (.6 + flake * .4);
      const worn = lip * 12 + flake * 13 + silver * 30 + peel * 16;
      const variation = (plateVariation - .5) * 35 + (fibre - .5) * 16 + (fine - .5) * 12 - strands * 8;
      const i = index * 4;
      albedo[i] = Math.max(20, 117 + worn + variation - cavity * 72);
      albedo[i + 1] = Math.max(17, 104 + worn * .99 + variation * .94 - cavity * 65);
      albedo[i + 2] = Math.max(14, 88 + worn * .96 + variation * .86 - cavity * 52);
      albedo[i + 3] = 255;
      surface[i] = Math.round(255 * (1 - cavity * .72));
      surface[i + 1] = Math.round(255 * clamp(.88 + fine * .1 - silver * .15 - lip * .07));
      surface[i + 2] = 0;
      surface[i + 3] = 255;
    }
  }

  // Tangent-space normals from the relief, with physical UV aspect accounted for.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = (heights[y * WIDTH + (x + 1) % WIDTH] - heights[y * WIDTH + wrap(x - 1, WIDTH)]) * WIDTH * .018;
      const dy = (heights[((y + 1) % HEIGHT) * WIDTH + x] - heights[wrap(y - 1, HEIGHT) * WIDTH + x]) * HEIGHT * .009;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * WIDTH + x) * 4;
      normal[i] = Math.round((.5 - dx / length * .5) * 255);
      normal[i + 1] = Math.round((.5 - dy / length * .5) * 255);
      normal[i + 2] = Math.round((.5 + 1 / length * .5) * 255);
      normal[i + 3] = 255;
    }
  }
  const makeTexture = (pixels: Uint8Array, color = false) => {
    const texture = new THREE.DataTexture(pixels, WIDTH, HEIGHT, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(8, anisotropy);
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };
  const map = makeTexture(albedo, true);
  const normalMap = makeTexture(normal);
  const surfaceMap = makeTexture(surface);
  const heightAt = (u: number, v: number) => {
    const x = (u - Math.floor(u)) * WIDTH, y = (v - Math.floor(v)) * HEIGHT;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const nx = (ix + 1) % WIDTH, ny = (iy + 1) % HEIGHT;
    return (heights[iy * WIDTH + ix] * (1 - fx) + heights[iy * WIDTH + nx] * fx) * (1 - fy)
      + (heights[ny * WIDTH + ix] * (1 - fx) + heights[ny * WIDTH + nx] * fx) * fy;
  };
  return {
    heightAt,
    material: (detail: number, maturity: number) => new THREE.MeshStandardMaterial({
      map, normalMap, roughnessMap: surfaceMap, aoMap: surfaceMap,
      normalScale: new THREE.Vector2(1, 1).multiplyScalar((.45 + detail * .7) * maturity),
      aoMapIntensity: .7,
      roughness: 1,
      vertexColors: true,
    }),
    dispose: () => { map.dispose(); normalMap.dispose(); surfaceMap.dispose(); },
  };
}
