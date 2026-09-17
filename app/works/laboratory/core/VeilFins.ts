import * as THREE from "three";

const LENGTH_STEPS = 28;
const WIDTH_STEPS = 12;

type FinKind = "left" | "right" | "tail";
type FinPoint = (u: number, v: number) => THREE.Vector2;

function smoothstep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** A flat, translucent fin with ribs that follow the same moving surface. */
class VeilFin {
  readonly group = new THREE.Group();
  private geometry = new THREE.BufferGeometry();
  private positions = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 3);
  private ribs: Array<{ geometry: THREE.BufferGeometry; positions: Float32Array }> = [];
  private materials: THREE.Material[] = [];

  constructor(private kind: FinKind) {
    const colors = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 4);
    const indices: number[] = [];
    for (let i = 0; i <= LENGTH_STEPS; i++) {
      const u = i / LENGTH_STEPS;
      for (let j = 0; j <= WIDTH_STEPS; j++) {
        const v = j / WIDTH_STEPS;
        const edge = kind === "tail" ? Math.abs(v * 2 - 1) : v;
        const fade = (1 - 0.86 * smoothstep((u - 0.5) / 0.5)) * (1 - 0.82 * Math.pow(edge, 2.1));
        const k = (i * (WIDTH_STEPS + 1) + j) * 4;
        colors[k] = 0.12 + u * 0.54;
        colors[k + 1] = 0.42 + u * 0.4;
        colors[k + 2] = 0.73 + u * 0.21;
        colors[k + 3] = Math.max(0.025, 0.72 * fade);
        if (i < LENGTH_STEPS && j < WIDTH_STEPS) {
          const a = i * (WIDTH_STEPS + 1) + j;
          const b = a + WIDTH_STEPS + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    this.geometry.setIndex(indices);
    const fabric = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(fabric);
    const mesh = new THREE.Mesh(this.geometry, fabric);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.group.add(mesh);

    const ribCount = kind === "tail" ? 9 : 7;
    for (let i = 0; i < ribCount; i++) {
      const positions = new Float32Array((LENGTH_STEPS + 1) * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: i % 2 ? 0x27649f : 0x4b91b4,
        transparent: true,
        opacity: kind === "tail" ? 0.36 : 0.31,
        depthWrite: false,
      });
      this.materials.push(material);
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 2;
      this.group.add(line);
      this.ribs.push({ geometry, positions });
    }
  }

  update(point: FinPoint) {
    for (let i = 0; i <= LENGTH_STEPS; i++) {
      const u = i / LENGTH_STEPS;
      for (let j = 0; j <= WIDTH_STEPS; j++) {
        const p = point(u, this.kind === "tail" ? j / WIDTH_STEPS * 2 - 1 : j / WIDTH_STEPS);
        const k = (i * (WIDTH_STEPS + 1) + j) * 3;
        this.positions[k] = p.x;
        this.positions[k + 1] = p.y;
        this.positions[k + 2] = -0.025;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    for (let rib = 0; rib < this.ribs.length; rib++) {
      const { geometry, positions } = this.ribs[rib];
      const v = this.kind === "tail" ? rib / (this.ribs.length - 1) * 2 - 1 : rib / (this.ribs.length - 1);
      for (let i = 0; i <= LENGTH_STEPS; i++) {
        const p = point(i / LENGTH_STEPS, v);
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = -0.015;
      }
      geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    this.geometry.dispose();
    for (const rib of this.ribs) rib.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

export class VeilFins {
  readonly group = new THREE.Group();
  private left = new VeilFin("left");
  private right = new VeilFin("right");
  private tail = new VeilFin("tail");
  private spread = 0.9;
  private lastTime = 0;

  constructor() {
    this.group.add(this.left.group, this.right.group, this.tail.group);
  }

  update(
    time: number,
    spine: THREE.Vector2[],
    tangent: THREE.Vector2[],
    normal: THREE.Vector2[],
    widthAt: (u: number) => number,
    speed: number,
  ) {
    const dt = Math.max(0, Math.min(0.08, time - this.lastTime));
    this.lastTime = time;
    const speedFactor = smoothstep((speed - 0.17) / 0.66);
    const targetSpread = 1.08 - speedFactor * 0.64;
    // Closing is quick; opening back into the water is deliberately slow.
    const response = targetSpread < this.spread ? 0.24 : 1.25;
    this.spread += (targetSpread - this.spread) * (1 - Math.exp(-dt / response));

    for (const [side, fin] of [[-1, this.left], [1, this.right]] as const) {
      fin.update((u, v) => {
        const section = Math.min(42, 12 + u * 21);
        const before = Math.floor(section);
        const after = Math.min(42, before + 1);
        const mix = section - before;
        const center = spine[before].clone().lerp(spine[after], mix);
        const direction = tangent[before].clone().lerp(tangent[after], mix).normalize();
        const sideways = normal[before].clone().lerp(normal[after], mix).normalize();
        const opened = Math.pow(Math.sin(Math.PI * u), 0.9) * 0.83 * this.spread * v;
        const flutter = Math.sin(time * 1.65 - u * 4.7 + v * 2.1 + side) * u * u * v * 0.13;
        return center
          .addScaledVector(direction, -u * (0.25 + 0.4 * speedFactor + 0.07 * Math.sin(time * 0.9 + u * 7 + v * 3)))
          .addScaledVector(sideways, side * (widthAt(section / 42) * (1 - u * 0.24) + opened + flutter));
      });
    }

    this.tail.update((u, v) => {
      const fan = Math.pow(Math.sin(Math.PI * u * 0.5), 0.9) * 0.82 * this.spread;
      const trailing = u * (1.12 + speedFactor * 0.38 + 0.2 * (1 - v * v) + 0.08 * Math.sin(v * 8 + time * 0.7) * u);
      const flutter = Math.sin(time * 1.34 - u * 5 + v * 2.8) * u * u * 0.14;
      return spine[42].clone()
        .addScaledVector(tangent[42], -trailing)
        .addScaledVector(normal[42], v * fan + flutter);
    });
  }

  dispose() {
    this.left.dispose();
    this.right.dispose();
    this.tail.dispose();
  }
}
