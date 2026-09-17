import * as THREE from "three";
import { VeilFins } from "./VeilFins";

const BODY_LENGTH = 1.85;
const SECTIONS = 42;
const ACROSS = 12;

function headPath(time: number) {
  // Incommensurate, gently modulated curves avoid a constant circular orbit.
  // The resulting changes of heading and speed also drive the veil's drag.
  const angle = time * 0.46 + 0.5 * Math.sin(time * 0.23) + 0.19 * Math.sin(time * 0.79);
  const radius = 1.16 + 0.16 * Math.sin(time * 0.37 + 0.6);
  return new THREE.Vector2(
    radius * Math.cos(angle) + 0.11 * Math.sin(time * 0.57 + 0.4),
    0.9 * radius * Math.sin(angle) + 0.13 * Math.sin(time * 0.71 + 1.4),
  );
}

export type FishStyle = "classic" | "veil";

function bodyWidth(u: number) {
  return 0.025 + 0.3 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.72) * (1 - u * 0.3);
}

function finGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.04, 0.16, -0.18, 0.36, -0.42, 0.46);
  shape.bezierCurveTo(-0.33, 0.27, -0.34, 0.06, -0.31, -0.11);
  shape.quadraticCurveTo(-0.16, -0.035, 0, 0);
  return new THREE.ShapeGeometry(shape, 16);
}

function tailGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.22, 0.05, -0.46, 0.29, -0.69, 0.39);
  shape.quadraticCurveTo(-0.55, 0.16, -0.43, 0);
  shape.quadraticCurveTo(-0.55, -0.16, -0.69, -0.39);
  shape.bezierCurveTo(-0.46, -0.29, -0.22, -0.05, 0, 0);
  return new THREE.ShapeGeometry(shape, 16);
}

export class FishModel {
  readonly group = new THREE.Group();
  private history: THREE.Vector2[] = [];
  private lastTime = 0;
  private bodyGeometry = new THREE.BufferGeometry();
  private bodyPositions = new Float32Array((SECTIONS + 1) * (ACROSS + 1) * 3);
  private edgeGeometries: THREE.BufferGeometry[] = [];
  private edgePositions: Float32Array[] = [];
  private edgeMaterials: THREE.LineBasicMaterial[] = [];
  private leftFin = new THREE.Mesh(finGeometry());
  private rightFin = new THREE.Mesh(finGeometry());
  private tail = new THREE.Mesh(tailGeometry());
  private veil = new VeilFins();
  private bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x20c7c1, side: THREE.DoubleSide });
  private materials: THREE.Material[] = [];

  constructor() {
    const indices: number[] = [];
    for (let section = 0; section < SECTIONS; section++) {
      for (let across = 0; across < ACROSS; across++) {
        const a = section * (ACROSS + 1) + across;
        const b = a + ACROSS + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.bodyGeometry.setAttribute("position", new THREE.BufferAttribute(this.bodyPositions, 3));
    this.bodyGeometry.setIndex(indices);
    this.materials.push(this.bodyMaterial);
    this.group.add(new THREE.Mesh(this.bodyGeometry, this.bodyMaterial));

    for (let side = 0; side < 2; side++) {
      const positions = new Float32Array((SECTIONS + 1) * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: side === 0 ? 0x4ff6e2 : 0x288bc7, transparent: true, opacity: 0.86 });
      this.materials.push(material);
      this.edgeMaterials.push(material);
      this.edgeGeometries.push(geometry);
      this.edgePositions.push(positions);
      this.group.add(new THREE.Line(geometry, material));
    }

    const finMaterial = new THREE.MeshBasicMaterial({ color: 0x1caaa7, side: THREE.DoubleSide });
    this.materials.push(finMaterial);
    this.leftFin.material = finMaterial;
    this.rightFin.material = finMaterial;
    this.leftFin.scale.y = -1;
    this.group.add(this.leftFin, this.rightFin);

    const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xd83c94, side: THREE.DoubleSide });
    this.materials.push(tailMaterial);
    this.tail.material = tailMaterial;
    this.group.add(this.tail);
    this.veil.group.visible = false;
    this.group.add(this.veil.group);

    this.rebuildHistory(0);
    this.update(0);
  }

  setStyle(style: FishStyle) {
    const veil = style === "veil";
    this.leftFin.visible = !veil;
    this.rightFin.visible = !veil;
    this.tail.visible = !veil;
    this.veil.group.visible = veil;
    this.bodyMaterial.color.setHex(veil ? 0x21548e : 0x20c7c1);
    this.edgeMaterials[0].color.setHex(veil ? 0x4c94b8 : 0x4ff6e2);
    this.edgeMaterials[1].color.setHex(veil ? 0x174275 : 0x288bc7);
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
        this.bodyPositions[k + 2] = 0;
      }
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const positions = this.edgePositions[side];
        positions[section * 3] = spine[section].x + normal[section].x * width * sign;
        positions[section * 3 + 1] = spine[section].y + normal[section].y * width * sign;
        positions[section * 3 + 2] = 0.01;
      }
    }
    this.bodyGeometry.attributes.position.needsUpdate = true;
    for (const geometry of this.edgeGeometries) geometry.attributes.position.needsUpdate = true;

    if (this.veil.group.visible) {
      const speed = headPath(time + 0.025).distanceTo(headPath(time - 0.025)) / 0.05;
      this.veil.update(time, spine, tangent, normal, bodyWidth, speed);
    }

    const finSection = 12;
    const finWidth = bodyWidth(finSection / SECTIONS);
    const headAngle = Math.atan2(tangent[0].y, tangent[0].x);
    const finAngle = Math.atan2(tangent[finSection].y, tangent[finSection].x);
    const turn = Math.atan2(Math.sin(headAngle - finAngle), Math.cos(headAngle - finAngle));
    for (const [side, fin] of [[-1, this.leftFin], [1, this.rightFin]] as const) {
      const root = spine[finSection].clone().addScaledVector(normal[finSection], side * finWidth * 0.9);
      fin.position.set(root.x, root.y, -0.01);
      fin.rotation.z = finAngle + side * Math.max(-0.22, Math.min(0.22, turn * 0.4));
    }

    const root = spine[SECTIONS];
    this.tail.position.set(root.x, root.y, -0.01);
    this.tail.rotation.z = Math.atan2(tangent[SECTIONS].y, tangent[SECTIONS].x);
  }

  dispose() {
    this.bodyGeometry.dispose();
    this.leftFin.geometry.dispose();
    this.rightFin.geometry.dispose();
    this.tail.geometry.dispose();
    for (const geometry of this.edgeGeometries) geometry.dispose();
    this.veil.dispose();
    for (const material of this.materials) material.dispose();
  }
}
