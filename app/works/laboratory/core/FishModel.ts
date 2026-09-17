import * as THREE from "three";

const BODY_LENGTH = 2.25;
const SECTIONS = 42;
const ACROSS = 12;

function headPath(time: number) {
  const angle = time * 0.52 + 1.0;
  return new THREE.Vector2(
    1.45 * Math.cos(angle) + 0.12 * Math.cos(angle * 3 + 0.5),
    1.45 * Math.sin(angle) + 0.10 * Math.sin(angle * 2),
  );
}

function bodyWidth(u: number) {
  return 0.035 + 0.38 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.72) * (1 - u * 0.32);
}

function triangleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

export class FishModel {
  readonly group = new THREE.Group();
  private history: THREE.Vector2[] = [];
  private lastTime = 0;
  private bodyGeometry = new THREE.BufferGeometry();
  private bodyPositions = new Float32Array((SECTIONS + 1) * (ACROSS + 1) * 3);
  private edgeGeometries: THREE.BufferGeometry[] = [];
  private edgePositions: Float32Array[] = [];
  private leftFin = triangleGeometry();
  private rightFin = triangleGeometry();
  private tail = new THREE.BufferGeometry();
  private tailPositions = new Float32Array(12);
  private materials: THREE.Material[] = [];

  constructor() {
    const colors = new Float32Array(this.bodyPositions.length);
    const indices: number[] = [];
    const center = new THREE.Color(0x3be4da);
    const edge = new THREE.Color(0x126391);
    for (let section = 0; section <= SECTIONS; section++) {
      const u = section / SECTIONS;
      for (let across = 0; across <= ACROSS; across++) {
        const v = Math.abs(across / ACROSS * 2 - 1);
        const color = center.clone().lerp(edge, Math.pow(v, 1.5) * 0.82 + u * 0.09);
        const k = (section * (ACROSS + 1) + across) * 3;
        colors[k] = color.r;
        colors[k + 1] = color.g;
        colors[k + 2] = color.b;
      }
    }
    for (let section = 0; section < SECTIONS; section++) {
      for (let across = 0; across < ACROSS; across++) {
        const a = section * (ACROSS + 1) + across;
        const b = a + ACROSS + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.bodyGeometry.setAttribute("position", new THREE.BufferAttribute(this.bodyPositions, 3));
    this.bodyGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.bodyGeometry.setIndex(indices);
    const bodyMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.materials.push(bodyMaterial);
    this.group.add(new THREE.Mesh(this.bodyGeometry, bodyMaterial));

    for (let side = 0; side < 2; side++) {
      const positions = new Float32Array((SECTIONS + 1) * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: side === 0 ? 0x4ff6e2 : 0x288bc7, transparent: true, opacity: 0.86 });
      this.materials.push(material);
      this.edgeGeometries.push(geometry);
      this.edgePositions.push(positions);
      this.group.add(new THREE.Line(geometry, material));
    }

    const finMaterial = new THREE.MeshBasicMaterial({ color: 0x20b1ae, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(finMaterial);
    this.group.add(new THREE.Mesh(this.leftFin, finMaterial), new THREE.Mesh(this.rightFin, finMaterial));

    this.tail.setAttribute("position", new THREE.BufferAttribute(this.tailPositions, 3));
    this.tail.setIndex([0, 1, 2, 0, 2, 3]);
    const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xd83c94, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(tailMaterial);
    this.group.add(new THREE.Mesh(this.tail, tailMaterial));

    this.rebuildHistory(0);
    this.update(0);
  }

  private rebuildHistory(time: number) {
    this.history = [];
    for (let t = time - 10; t < time; t += 1 / 60) this.history.push(headPath(t));
    this.history.push(headPath(time));
    this.lastTime = time;
  }

  private sampleTrace(distance: number) {
    let remaining = distance;
    for (let i = this.history.length - 1; i > 0; i--) {
      const recent = this.history[i];
      const older = this.history[i - 1];
      const segment = recent.distanceTo(older);
      if (remaining <= segment && segment > 0) return recent.clone().lerp(older, remaining / segment);
      remaining -= segment;
    }
    return this.history[0].clone();
  }

  private setTriangle(geometry: THREE.BufferGeometry, points: THREE.Vector2[]) {
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 3; i++) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = 0.08;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  update(time: number) {
    if (time - this.lastTime > 1 || time < this.lastTime) this.rebuildHistory(time);
    else if (time > this.lastTime) {
      for (let t = this.lastTime + 1 / 60; t < time; t += 1 / 60) this.history.push(headPath(t));
      this.history.push(headPath(time));
      if (this.history.length > 1200) this.history.splice(0, this.history.length - 1000);
      this.lastTime = time;
    }

    const spine: THREE.Vector2[] = [];
    const tangent: THREE.Vector2[] = [];
    const normal: THREE.Vector2[] = [];
    for (let section = 0; section <= SECTIONS; section++) {
      spine.push(this.sampleTrace(section / SECTIONS * BODY_LENGTH));
    }
    for (let section = 0; section <= SECTIONS; section++) {
      const front = spine[Math.max(0, section - 1)];
      const back = spine[Math.min(SECTIONS, section + 1)];
      const direction = front.clone().sub(back).normalize();
      tangent.push(direction);
      normal.push(new THREE.Vector2(-direction.y, direction.x));
    }

    for (let section = 0; section <= SECTIONS; section++) {
      const u = section / SECTIONS;
      const width = bodyWidth(u);
      for (let across = 0; across <= ACROSS; across++) {
        const v = across / ACROSS * 2 - 1;
        const k = (section * (ACROSS + 1) + across) * 3;
        this.bodyPositions[k] = spine[section].x + normal[section].x * width * v;
        this.bodyPositions[k + 1] = spine[section].y + normal[section].y * width * v;
        this.bodyPositions[k + 2] = 0.02 + (1 - v * v) * 0.07;
      }
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const positions = this.edgePositions[side];
        positions[section * 3] = spine[section].x + normal[section].x * width * sign;
        positions[section * 3 + 1] = spine[section].y + normal[section].y * width * sign;
        positions[section * 3 + 2] = 0.095;
      }
    }
    this.bodyGeometry.attributes.position.needsUpdate = true;
    for (const geometry of this.edgeGeometries) geometry.attributes.position.needsUpdate = true;

    const finSection = 12;
    const finWidth = bodyWidth(finSection / SECTIONS);
    const finFlutter = Math.sin(time * 6.4) * 0.07;
    for (const [side, geometry] of [[-1, this.leftFin], [1, this.rightFin]] as const) {
      const root = spine[finSection].clone().addScaledVector(normal[finSection], side * finWidth * 0.9);
      const tip = root.clone().addScaledVector(normal[finSection], side * (0.38 + finFlutter)).addScaledVector(tangent[finSection], -0.24);
      const back = root.clone().addScaledVector(tangent[finSection], -0.34).addScaledVector(normal[finSection], side * 0.1);
      this.setTriangle(geometry, [root, tip, back]);
    }

    const root = spine[SECTIONS];
    const back = tangent[SECTIONS].clone().multiplyScalar(-1);
    const side = normal[SECTIONS];
    const spread = 0.38 + Math.sin(time * 7.5) * 0.045;
    const tailPoints = [
      root,
      root.clone().addScaledVector(back, 0.66).addScaledVector(side, spread),
      root.clone().addScaledVector(back, 0.27),
      root.clone().addScaledVector(back, 0.66).addScaledVector(side, -spread),
    ];
    for (let i = 0; i < 4; i++) {
      this.tailPositions[i * 3] = tailPoints[i].x;
      this.tailPositions[i * 3 + 1] = tailPoints[i].y;
      this.tailPositions[i * 3 + 2] = 0.04;
    }
    this.tail.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.bodyGeometry.dispose();
    this.leftFin.dispose();
    this.rightFin.dispose();
    this.tail.dispose();
    for (const geometry of this.edgeGeometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
