import * as THREE from "three";

// All dimensions are in metres; the toe points along local +Z.
export const SHOE_LENGTH = 0.32;
export const SHOE_WIDTH = 0.135;
export const ANKLE = new THREE.Vector3(0, 0.155, -0.073);

type Section = [z: number, width: number, height: number];
const UPPER: Section[] = [
  [-0.142, 0.006, 0.075], [-0.13, 0.038, 0.105], [-0.105, 0.048, 0.145],
  [-0.07, 0.05, 0.151], [-0.028, 0.051, 0.132], [0.018, 0.057, 0.113],
  [0.065, 0.063, 0.091], [0.115, 0.06, 0.077], [0.154, 0.045, 0.06],
  [0.176, 0.005, 0.044],
];

function profile(z: number) {
  for (let i = 1; i < UPPER.length; i++) {
    if (z <= UPPER[i][0]) {
      const a = UPPER[i - 1], b = UPPER[i];
      const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
      const before = UPPER[Math.max(0, i - 2)], after = UPPER[Math.min(UPPER.length - 1, i + 1)];
      const interpolate = (key: 1 | 2) => {
        const span = b[0] - a[0];
        const m0 = (b[key] - before[key]) / (b[0] - before[0]) * span;
        const m1 = (after[key] - a[key]) / (after[0] - a[0]) * span;
        return (2*t*t*t - 3*t*t + 1)*a[key] + (t*t*t - 2*t*t + t)*m0
          + (-2*t*t*t + 3*t*t)*b[key] + (t*t*t - t*t)*m1;
      };
      return { width: Math.max(0.004, interpolate(1)), height: interpolate(2) };
    }
  }
  return { width: UPPER[UPPER.length - 1][1], height: UPPER[UPPER.length - 1][2] };
}

function upperPoint(z: number, angle: number, lift = 0) {
  const { width, height } = profile(z);
  const crown = Math.pow(Math.max(0, (Math.cos(angle) + 1) / 2), 0.6);
  return new THREE.Vector3(
    Math.sin(angle) * (width + lift) + Math.sin((z + 0.14) * 9) * 0.003,
    0.036 + crown * (height - 0.036) + lift,
    z,
  );
}

function sheet(rows: number, columns: number, point: (u: number, v: number) => THREE.Vector3) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, v = row / rows;
      positions.push(...point(u, v).toArray()); uv.push(u, v);
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function fabricTexture() {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#888"; context.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
    context.fillStyle = (x + y) % 4 ? "#a0a0a0" : "#666";
    context.fillRect(x, y, 1, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(5, 7);
  return texture;
}

export class StepModel {
  readonly shoe = new THREE.Group();
  readonly trouser: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly fabric: THREE.MeshStandardMaterial;
  private readonly rings = 42;
  private readonly segments = 32;
  private readonly center = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly radial = new THREE.Vector3();

  constructor() {
    const weave = fabricTexture();
    const upper = new THREE.MeshStandardMaterial({ color: "#26282b", roughness: 0.79, bumpMap: weave, bumpScale: 0.00065, side: THREE.DoubleSide });
    const leather = new THREE.MeshStandardMaterial({ color: "#141619", roughness: 0.5, side: THREE.DoubleSide });
    const rubber = new THREE.MeshStandardMaterial({ color: "#25262a", roughness: 0.92, side: THREE.DoubleSide });
    const midsole = new THREE.MeshStandardMaterial({ color: "#555650", roughness: 0.94, side: THREE.DoubleSide });
    const lace = new THREE.MeshStandardMaterial({ color: "#5a5b56", roughness: 0.94 });
    const seam = new THREE.MeshStandardMaterial({ color: "#55575a", roughness: 0.9 });
    this.fabric = new THREE.MeshStandardMaterial({ color: "#101114", roughness: 1, bumpMap: weave, bumpScale: 0.001, side: THREE.DoubleSide });

    const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true;
      this.shoe.add(mesh); return mesh;
    };
    const cord = (points: THREE.Vector3[], radius: number, material: THREE.Material) =>
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(12, points.length * 3), radius, 5, false), material);

    // Rounded rubber outsole and a separate sculpted midsole, rather than a flat decal.
    for (const [bottom, top, material] of [[0.006, 0.023, rubber], [0.022, 0.044, midsole]] as const) {
      add(sheet(62, 40, (u, v) => {
        const z = -0.146 + v * 0.327;
        const p = profile(THREE.MathUtils.clamp(z, -0.142, 0.176));
        const a = u * Math.PI * 2;
        const cap = THREE.MathUtils.smoothstep(v, 0, 0.022) * THREE.MathUtils.smoothstep(1 - v, 0, 0.022);
        const toeLift = Math.pow(Math.max(0, (z - 0.11) / 0.071), 2) * 0.012;
        return new THREE.Vector3(Math.sin(a) * (p.width + 0.003) * cap, (bottom + top) / 2 + Math.cos(a) * (top - bottom) / 2 * cap + toeLift, z);
      }), material);
    }
    add(sheet(76, 48, (u, v) => upperPoint(-0.142 + v * 0.318, u * Math.PI * 2)), upper);

    // Toe guard, heel counter and quarters have their own physical surface layers.
    for (const [start, end, a0, a1] of [[0.115, 0.175, -2.1, 2.1], [-0.139, -0.087, -2.4, 2.4], [-0.08, 0.065, 0.82, 2.45], [-0.08, 0.065, -2.45, -0.82]]) {
      add(sheet(22, 18, (u, v) => upperPoint(THREE.MathUtils.lerp(start, end, v), THREE.MathUtils.lerp(a0, a1, u), 0.0014)), leather);
    }
    for (const z of [-0.086, 0.116]) {
      cord(Array.from({ length: 26 }, (_, i) => upperPoint(z, -1.85 + i / 25 * 3.7, 0.0021)), 0.0007, seam);
    }
    for (const sign of [-1, 1]) {
      cord(Array.from({ length: 20 }, (_, i) => upperPoint(-0.09 + i / 19 * 0.21, sign * 1.65, 0.0025)), 0.0007, seam);
      // Small sole grooves expose the rubber under the light midsole.
      for (let i = 0; i < 18; i++) {
        const z = -0.125 + i * 0.016;
        const groove = add(new THREE.BoxGeometry(0.0016, 0.009, 0.003), rubber);
        groove.position.set(sign * (profile(z).width + 0.002), 0.032, z);
      }
    }
    // Padded tongue and seven crossed laces with metal eyelets.
    add(sheet(20, 16, (u, v) => upperPoint(-0.082 + v * 0.155, (u - 0.5) * 0.9, 0.003)), leather);
    for (let i = 0; i < 7; i++) {
      const z = -0.055 + i * 0.018;
      for (const sign of [-1, 1]) {
        const eyelet = add(new THREE.TorusGeometry(0.0032, 0.0008, 6, 12), seam);
        eyelet.rotation.x = -Math.PI / 2; eyelet.position.copy(upperPoint(z, sign * 0.48, 0.003));
        cord([upperPoint(z, sign * 0.45, 0.005), upperPoint(z + 0.009, 0, 0.007), upperPoint(z + 0.016, -sign * 0.45, 0.005)], 0.0015, lace);
      }
    }
    cord([new THREE.Vector3(0, 0.158, -0.049), new THREE.Vector3(-0.029, 0.164, -0.055), new THREE.Vector3(-0.033, 0.155, -0.034), new THREE.Vector3(0.002, 0.158, -0.049), new THREE.Vector3(0.03, 0.163, -0.054), new THREE.Vector3(0.034, 0.15, -0.03), new THREE.Vector3(0, 0.158, -0.049)], 0.0016, lace);
    const sock = add(new THREE.CylinderGeometry(0.031, 0.032, 0.088, 24), rubber);
    sock.position.copy(ANKLE).add(new THREE.Vector3(0, 0.005, 0));
    const collar = add(new THREE.TorusGeometry(0.035, 0.009, 10, 32), leather);
    collar.rotation.x = -Math.PI / 2; collar.scale.y = 1.27; collar.position.set(0, 0.129, -0.079);
    const pullTab = add(new THREE.BoxGeometry(0.019, 0.039, 0.006), leather);
    pullTab.position.set(0, 0.124, -0.132); pullTab.rotation.x = -0.15;
    const tag = add(new THREE.BoxGeometry(0.012, 0.008, 0.001), new THREE.MeshStandardMaterial({ color: "#75504d", roughness: 0.8 }));
    tag.position.set(0, 0.133, -0.1355);

    const geometry = sheet(this.rings, this.segments, () => new THREE.Vector3());
    (geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.trouser = new THREE.Mesh(geometry, this.fabric);
    this.trouser.frustumCulled = false; this.trouser.castShadow = true; this.trouser.receiveShadow = true;
  }

  poseLeg(ankle: THREE.Vector3, knee: THREE.Vector3, hip: THREE.Vector3, forward: THREE.Vector3, load: number) {
    const curve = new THREE.CatmullRomCurve3([ankle, knee, hip]);
    const side = new THREE.Vector3(forward.z, 0, -forward.x);
    const positions = this.trouser.geometry.getAttribute("position");
    for (let row = 0; row <= this.rings; row++) {
      const t = row / this.rings;
      curve.getPoint(t, this.center); curve.getTangent(t, this.tangent);
      this.radial.crossVectors(side, this.tangent).normalize();
      const radius = THREE.MathUtils.lerp(0.042, 0.112, Math.pow(t, 0.76));
      const cuff = Math.exp(-t * 18), kneeFold = Math.exp(-Math.pow((t - 0.47) * 7, 2));
      for (let col = 0; col <= this.segments; col++) {
        const a = col / this.segments * Math.PI * 2;
        const fold = Math.sin(t * 47 + Math.sin(a * 1.5 + t * 8) * 3.4) * (0.0006 + cuff * 0.0035 + kneeFold * 0.0025 * load)
          + Math.cos(a * 7 + t * 5) * 0.001 + Math.cos(a * 3 - t * 6) * 0.0015;
        const r = radius + fold;
        const p = this.center.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(this.radial, Math.sin(a) * r * 0.9);
        positions.setXYZ(row * (this.segments + 1) + col, p.x, p.y, p.z);
      }
    }
    positions.needsUpdate = true; this.trouser.geometry.computeVertexNormals();
  }
}

// A close, curved trouser surface crosses the lens. It lives in camera space so
// its projected coverage is consistent in portrait and landscape viewports.
export function createForegroundCloth(material: THREE.Material) {
  const geometry = sheet(72, 44, (u, v) => {
    const x = (u - 0.5) * 2, y = (v - 0.5) * 2;
    const edge = 0.92 + 0.065 * Math.cos(y * 2.8) + 0.018 * Math.sin(y * 6);
    const bulge = Math.sqrt(Math.max(0, 1 - x * x)) * 0.075;
    const crease = Math.sin(x * 33 + y * 4) * 0.0025 + Math.sin(y * 16 - x * 3) * 0.0015;
    return new THREE.Vector3(x * edge, y, bulge + crease);
  });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  return mesh;
}
