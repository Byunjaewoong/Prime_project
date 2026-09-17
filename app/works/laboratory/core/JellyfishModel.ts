import * as THREE from "three";

const POINTS = 64;
const CYAN = 0x15dce9;
const LIME = 0xd7f12e;
const VIOLET = 0x8a72ff;
const BLUE = 0x1653f0;

type Strand = {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  anchorY: number;
  length: number;
  phase: number;
  amplitude: number;
};

function lineMaterial(color: number, opacity: number) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function circle(cx: number, cy: number, radiusX: number, radiusY: number, segments = 16) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    points.push(new THREE.Vector3(cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY, 0.2));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

export class JellyfishModel {
  readonly group = new THREE.Group();
  private organism = new THREE.Group();
  private bell = new THREE.Group();
  private background = new THREE.Group();
  private strands: Strand[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.group.add(this.background, this.organism);
    this.organism.add(this.bell);

    const shell = new THREE.Shape();
    shell.moveTo(1.42, -1.12);
    shell.lineTo(1.42, 1.12);
    shell.bezierCurveTo(2.25, 1.28, 2.86, 0.86, 2.95, 0);
    shell.bezierCurveTo(2.89, -0.88, 2.26, -1.28, 1.42, -1.12);
    const fillMaterial = new THREE.MeshBasicMaterial({ color: 0x061535, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(fillMaterial);
    this.bell.add(new THREE.Mesh(new THREE.ShapeGeometry(shell, 36), fillMaterial));

    const outline = shell.getPoints(95).map(point => new THREE.Vector3(point.x, point.y, 0.05));
    const outerMaterial = lineMaterial(BLUE, 0.9);
    this.materials.push(outerMaterial);
    this.bell.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outline), outerMaterial));
    for (let copy = 0; copy < 3; copy++) {
      const points = shell.getPoints(75).map(point => new THREE.Vector3(point.x + 0.06 + copy * 0.035, point.y * (0.96 - copy * 0.035), -0.02 - copy * 0.01));
      const material = lineMaterial(copy === 0 ? 0x3a55ed : BLUE, 0.27 - copy * 0.05);
      this.materials.push(material);
      this.bell.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }

    const yellow = lineMaterial(0xe2f62b, 0.9);
    const yellowDim = lineMaterial(0xaec520, 0.5);
    this.materials.push(yellow, yellowDim);
    for (let i = 0; i < 74; i++) {
      const y = ((i * 29) % 74) / 74 * 1.98 - 0.99;
      const x = 1.52 + ((i * 19) % 17) / 17 * 0.34 + Math.sin(y * 11) * 0.04;
      const r = 0.037 + (i % 5) * 0.012;
      this.bell.add(new THREE.LineLoop(circle(x, y, r, r * (0.85 + i % 3 * 0.11)), i % 3 === 0 ? yellow : yellowDim));
    }

    for (let i = 0; i < 57; i++) {
      const positions = new Float32Array(POINTS * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const color = i % 11 < 6 ? CYAN : i % 11 < 8 ? LIME : i % 11 < 10 ? VIOLET : BLUE;
      const material = lineMaterial(color, 0.46 + (i % 5) * 0.095);
      this.materials.push(material);
      this.organism.add(new THREE.Line(geometry, material));
      this.strands.push({
        geometry,
        positions,
        anchorY: ((i * 23) % 57) / 57 * 2.08 - 1.04,
        length: 2.0 + ((i * 13) % 31) / 31 * 3.9,
        phase: i * 1.71,
        amplitude: 0.055 + (i % 7) * 0.021,
      });
    }

    const pink = lineMaterial(0xf25c94, 0.72);
    const pinkDim = lineMaterial(0xc1417b, 0.4);
    this.materials.push(pink, pinkDim);
    for (let i = 0; i < 13; i++) {
      const x = 0.65 + (i % 4) * 0.19;
      const y = ((i * 7) % 13) / 13 * 2.5 - 1.25;
      this.organism.add(new THREE.LineLoop(circle(x, y, 0.045 + i % 3 * 0.01, 0.035 + i % 4 * 0.008), i % 2 ? pink : pinkDim));
    }

    for (let i = 0; i < 10; i++) {
      const points: THREE.Vector3[] = [];
      const yBase = ((i * 7) % 10) / 10 * 7 - 3.6;
      for (let j = 0; j < 90; j++) {
        const x = -5.6 + j / 89 * 11.2;
        const y = yBase + Math.sin(x * (0.55 + i % 4 * 0.13) + i * 2.3) * (0.30 + i % 3 * 0.19);
        points.push(new THREE.Vector3(x, y, -2));
      }
      const material = lineMaterial(i % 5 === 0 ? LIME : i % 3 === 0 ? BLUE : 0x116d93, 0.1 + i % 4 * 0.06);
      this.materials.push(material);
      this.background.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    this.update(0);
  }

  update(time: number) {
    const pulse = Math.sin(time * 2.4);
    this.bell.scale.set(1 + pulse * 0.035, 1 - pulse * 0.075, 1);
    this.bell.position.x = pulse * 0.045;
    for (const strand of this.strands) {
      for (let j = 0; j < POINTS; j++) {
        const u = j / (POINTS - 1);
        const flow = Math.sin(time * 1.1 - u * 5.2 + strand.phase);
        const k = j * 3;
        strand.positions[k] = 1.45 - strand.length * u + Math.sin(time * 1.6 - u * 6 + strand.phase) * u * 0.12;
        strand.positions[k + 1] = strand.anchorY * (1 - u * 0.09) + flow * u * strand.amplitude + Math.sin(strand.phase * 0.7) * u * u * 0.22;
        strand.positions[k + 2] = 0.06 + Math.cos(time * 0.8 - u * 4 + strand.phase) * u * 0.06;
      }
      strand.geometry.attributes.position.needsUpdate = true;
    }
    this.organism.position.set(Math.sin(time * 0.35) * 0.17, Math.sin(time * 0.6) * 0.13, 0);
    this.organism.rotation.z = Math.sin(time * 0.27) * 0.035;
    this.background.position.y = Math.sin(time * 0.18) * 0.1;
  }

  dispose() {
    this.group.traverse(object => {
      if (object instanceof THREE.Line || object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
  }
}
