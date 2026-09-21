import * as THREE from "three";

const LENGTH_STEPS = 36;
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
  private colors = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 4);
  private targets = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 2);
  private velocities = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 2);
  private smoothed = new Float32Array((LENGTH_STEPS + 1) * (WIDTH_STEPS + 1) * 3);
  private initialized = false;
  private ribs: Array<{ geometry: THREE.BufferGeometry; positions: Float32Array }> = [];
  private ribMaterials: THREE.LineBasicMaterial[] = [];
  private materials: THREE.Material[] = [];

  constructor(private kind: FinKind) {
    const indices: number[] = [];
    for (let i = 0; i <= LENGTH_STEPS; i++) {
      const u = i / LENGTH_STEPS;
      for (let j = 0; j <= WIDTH_STEPS; j++) {
        const v = j / WIDTH_STEPS;
        const edge = kind === "tail" ? Math.abs(v * 2 - 1) : v;
        const fade = (1 - 0.86 * smoothstep((u - 0.5) / 0.5)) * (1 - 0.82 * Math.pow(edge, 2.1));
        const k = (i * (WIDTH_STEPS + 1) + j) * 4;
        this.colors[k] = 0.12 + u * 0.54;
        this.colors[k + 1] = 0.42 + u * 0.4;
        this.colors[k + 2] = 0.73 + u * 0.21;
        this.colors[k + 3] = Math.max(0.025, 0.72 * fade);
        if (i < LENGTH_STEPS && j < WIDTH_STEPS) {
          const a = i * (WIDTH_STEPS + 1) + j;
          const b = a + WIDTH_STEPS + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
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
      this.ribMaterials.push(material);
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.renderOrder = 2;
      this.group.add(line);
      this.ribs.push({ geometry, positions });
    }
  }

  setStyle(style: number) {
    const palettes = [
      { root: 0x244b74, tip: 0x8db1c7, alpha: 0.58, rib: 0x527fa1 },
      { root: 0x145b82, tip: 0x4ee2ee, alpha: 0.18, rib: 0x56d8ec },
      { root: 0x304b61, tip: 0xb2c8d2, alpha: 0.5, rib: 0x809cad },
      { root: 0x19747d, tip: 0xa5f6ed, alpha: 0.3, rib: 0x6ce4df },
      { root: 0x273bad, tip: 0xa080ec, alpha: 0.62, rib: 0x9684ee },
      { root: 0x123967, tip: 0xf4f1e9, alpha: 0.48, rib: 0xff6457 },
    ];
    const palette = palettes[style] ?? palettes[1];
    const root = new THREE.Color(palette.root);
    const tip = new THREE.Color(palette.tip);
    const color = new THREE.Color();
    for (let i = 0; i <= LENGTH_STEPS; i++) {
      const u = i / LENGTH_STEPS;
      color.copy(root).lerp(tip, Math.pow(u, 0.78));
      for (let j = 0; j <= WIDTH_STEPS; j++) {
        const v = j / WIDTH_STEPS;
        const edge = this.kind === "tail" ? Math.abs(v * 2 - 1) : v;
        const fade = (1 - 0.86 * smoothstep((u - 0.5) / 0.5)) * (1 - 0.82 * Math.pow(edge, 2.1));
        const k = (i * (WIDTH_STEPS + 1) + j) * 4;
        const coral = style === 5 && ((this.kind === "tail" && v > 0.58) || (this.kind !== "tail" && v > 0.72));
        const vertexColor = coral ? new THREE.Color(0xff5b4e) : color;
        this.colors[k] = vertexColor.r;
        this.colors[k + 1] = vertexColor.g;
        this.colors[k + 2] = vertexColor.b;
        this.colors[k + 3] = Math.max(0.018, palette.alpha * fade);
      }
    }
    this.geometry.attributes.color.needsUpdate = true;
    for (let rib = 0; rib < this.ribMaterials.length; rib++) {
      const material = this.ribMaterials[rib];
      material.color.setHex(style === 5 && rib > this.ribMaterials.length / 2 ? 0xff6457 : palette.rib);
      material.opacity = style === 1 ? 0.78 : style === 3 ? 0.46 : 0.36;
    }
  }

  update(point: FinPoint, dt = 0) {
    for (let i = 0; i <= LENGTH_STEPS; i++) {
      const u = i / LENGTH_STEPS;
      for (let j = 0; j <= WIDTH_STEPS; j++) {
        const p = point(u, this.kind === "tail" ? j / WIDTH_STEPS * 2 - 1 : j / WIDTH_STEPS);
        const vertex = i * (WIDTH_STEPS + 1) + j;
        this.targets[vertex * 2] = p.x;
        this.targets[vertex * 2 + 1] = p.y;
      }
    }

    if (!this.initialized || this.kind !== "tail") {
      for (let vertex = 0; vertex < this.targets.length / 2; vertex++) {
        this.positions[vertex * 3] = this.targets[vertex * 2];
        this.positions[vertex * 3 + 1] = this.targets[vertex * 2 + 1];
        this.positions[vertex * 3 + 2] = -0.025;
      }
      this.initialized = true;
    } else {
      // The root is fixed to the fish. Each following strip is a softer spring,
      // so a turn travels down the fabric instead of rotating the whole tail.
      const stepTime = Math.min(1 / 30, Math.max(1 / 240, dt / 2));
      for (let substep = 0; substep < 2; substep++) {
        for (let i = 0; i <= LENGTH_STEPS; i++) {
          const u = i / LENGTH_STEPS;
          for (let j = 0; j <= WIDTH_STEPS; j++) {
            const vertex = i * (WIDTH_STEPS + 1) + j;
            const pk = vertex * 3;
            const tk = vertex * 2;
            if (i === 0) {
              this.positions[pk] = this.targets[tk];
              this.positions[pk + 1] = this.targets[tk + 1];
              this.velocities[tk] = 0;
              this.velocities[tk + 1] = 0;
              continue;
            }

            const previous = vertex - (WIDTH_STEPS + 1);
            const previousPosition = previous * 3;
            const previousTarget = previous * 2;
            const carriedX = this.positions[previousPosition] + this.targets[tk] - this.targets[previousTarget];
            const carriedY = this.positions[previousPosition + 1] + this.targets[tk + 1] - this.targets[previousTarget + 1];
            const propagation = 32 - u * 21;
            const tether = 4.8 - u * 3.2;
            const accelerationX = (carriedX - this.positions[pk]) * propagation + (this.targets[tk] - this.positions[pk]) * tether;
            const accelerationY = (carriedY - this.positions[pk + 1]) * propagation + (this.targets[tk + 1] - this.positions[pk + 1]) * tether;
            const damping = Math.exp(-(5.4 - u * 2.1) * stepTime);
            this.velocities[tk] = (this.velocities[tk] + accelerationX * stepTime) * damping;
            this.velocities[tk + 1] = (this.velocities[tk + 1] + accelerationY * stepTime) * damping;
            this.positions[pk] += this.velocities[tk] * stepTime;
            this.positions[pk + 1] += this.velocities[tk + 1] * stepTime;
            this.positions[pk + 2] = -0.025;
          }
        }
      }
      this.smoothed.set(this.positions);
      for (let i = 1; i < LENGTH_STEPS; i++) {
        for (let j = 0; j <= WIDTH_STEPS; j++) {
          const pk = (i * (WIDTH_STEPS + 1) + j) * 3;
          const before = pk - (WIDTH_STEPS + 1) * 3;
          const after = pk + (WIDTH_STEPS + 1) * 3;
          this.smoothed[pk] = this.positions[pk] * 0.62 + (this.positions[before] + this.positions[after]) * 0.19;
          this.smoothed[pk + 1] = this.positions[pk + 1] * 0.62 + (this.positions[before + 1] + this.positions[after + 1]) * 0.19;
        }
      }
      for (let i = 1; i < LENGTH_STEPS; i++) {
        for (let j = 0; j <= WIDTH_STEPS; j++) {
          const pk = (i * (WIDTH_STEPS + 1) + j) * 3;
          this.positions[pk] = this.smoothed[pk];
          this.positions[pk + 1] = this.smoothed[pk + 1];
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    for (let rib = 0; rib < this.ribs.length; rib++) {
      const { geometry, positions } = this.ribs[rib];
      const across = rib / (this.ribs.length - 1) * WIDTH_STEPS;
      const left = Math.floor(across);
      const right = Math.min(WIDTH_STEPS, left + 1);
      const mix = across - left;
      for (let i = 0; i <= LENGTH_STEPS; i++) {
        const leftVertex = (i * (WIDTH_STEPS + 1) + left) * 3;
        const rightVertex = (i * (WIDTH_STEPS + 1) + right) * 3;
        positions[i * 3] = this.positions[leftVertex] * (1 - mix) + this.positions[rightVertex] * mix;
        positions[i * 3 + 1] = this.positions[leftVertex + 1] * (1 - mix) + this.positions[rightVertex + 1] * mix;
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
    this.setStyle(1);
  }

  setStyle(style: number) {
    this.left.setStyle(style);
    this.right.setStyle(style);
    this.tail.setStyle(style);
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
      }, dt);
    }

    this.tail.update((u, v) => {
      const edge = Math.abs(v);
      const fork = 0.68 + 0.4 * smoothstep((edge - 0.08) / 0.92);
      const fan = Math.pow(Math.sin(Math.PI * u * 0.5), 0.82) * 1.22 * this.spread;
      const trailing = u * (1.22 + speedFactor * 0.38) * fork;
      const flutter = Math.sin(time * 1.17 - u * 5.3 + v * 3.4) * u * u * (0.08 + edge * 0.1);
      return spine[42].clone()
        .addScaledVector(tangent[42], -trailing)
        .addScaledVector(normal[42], v * fan * (0.82 + edge * 0.18) + flutter);
    }, dt);
  }

  dispose() {
    this.left.dispose();
    this.right.dispose();
    this.tail.dispose();
  }
}
