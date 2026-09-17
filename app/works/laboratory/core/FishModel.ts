import * as THREE from "three";

const FISH_COUNT = 480;
const COLORS = [0x1bc6d7, 0x19bda5, 0xd62290, 0xe33166, 0x28a9cd];

type FishSeed = {
  angle: number;
  radiusX: number;
  radiusY: number;
  speed: number;
  phase: number;
  size: number;
  centerX: number;
  centerY: number;
};

function random(seed: number) {
  const value = Math.sin(seed * 127.1 + 31.7) * 43758.5453;
  return value - Math.floor(value);
}

function bodyGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, 0);
  shape.bezierCurveTo(-0.25, 0.14, 0.02, 0.27, 0.29, 0.21);
  shape.bezierCurveTo(0.48, 0.16, 0.59, 0.06, 0.6, 0);
  shape.bezierCurveTo(0.59, -0.06, 0.48, -0.16, 0.29, -0.21);
  shape.bezierCurveTo(0.02, -0.27, -0.25, -0.14, -0.42, 0);
  return new THREE.ShapeGeometry(shape, 10);
}

function tailGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-0.2, 0.085);
  shape.quadraticCurveTo(-0.4, 0.18, -0.66, 0.34);
  shape.lineTo(-0.53, 0.08);
  shape.lineTo(-0.43, 0);
  shape.lineTo(-0.53, -0.08);
  shape.lineTo(-0.66, -0.34);
  shape.quadraticCurveTo(-0.4, -0.18, -0.2, -0.085);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 8);
}

function finGeometry() {
  const upper = new THREE.Shape();
  upper.moveTo(0.05, 0.16);
  upper.lineTo(-0.18, 0.34);
  upper.quadraticCurveTo(-0.13, 0.2, -0.07, 0.12);
  upper.closePath();
  const lower = new THREE.Shape();
  lower.moveTo(0.05, -0.16);
  lower.lineTo(-0.18, -0.34);
  lower.quadraticCurveTo(-0.13, -0.2, -0.07, -0.12);
  lower.closePath();
  return new THREE.ShapeGeometry([upper, lower], 6);
}

export class FishModel {
  readonly group = new THREE.Group();
  private fish: FishSeed[] = [];
  private body: THREE.InstancedMesh;
  private tail: THREE.InstancedMesh;
  private fins: THREE.InstancedMesh;
  private eye: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor() {
    this.body = new THREE.InstancedMesh(bodyGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), FISH_COUNT);
    this.tail = new THREE.InstancedMesh(tailGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }), FISH_COUNT);
    this.fins = new THREE.InstancedMesh(finGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }), FISH_COUNT);
    this.eye = new THREE.InstancedMesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshBasicMaterial({ color: 0x111319 }), FISH_COUNT);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eye.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.tail, this.fins, this.body, this.eye);

    for (let i = 0; i < FISH_COUNT; i++) {
      const spread = Math.sqrt(random(i * 5 + 2));
      const seed: FishSeed = {
        angle: random(i * 7 + 1) * Math.PI * 2,
        radiusX: 0.25 + spread * 6.2,
        radiusY: 0.2 + spread * 4.15,
        speed: (i % 13 === 0 ? -1 : 1) * (0.14 + random(i * 7 + 3) * 0.13),
        phase: random(i * 7 + 4) * Math.PI * 2,
        size: 0.15 + random(i * 7 + 5) * 0.09,
        centerX: (random(i * 7 + 6) - 0.5) * 0.35,
        centerY: (random(i * 7 + 7) - 0.5) * 0.25,
      };
      this.fish.push(seed);
      const color = new THREE.Color(COLORS[Math.floor(random(i * 11 + 9) * COLORS.length)]);
      this.body.setColorAt(i, color);
      this.tail.setColorAt(i, color);
      this.fins.setColorAt(i, color);
    }
    this.update(0);
  }

  update(time: number) {
    for (let i = 0; i < this.fish.length; i++) {
      const fish = this.fish[i];
      const orbit = fish.angle + time * fish.speed;
      const x = fish.centerX + Math.cos(orbit) * fish.radiusX;
      const y = fish.centerY + Math.sin(orbit) * fish.radiusY;
      const heading = Math.atan2(Math.cos(orbit) * fish.radiusY, -Math.sin(orbit) * fish.radiusX) + (fish.speed < 0 ? Math.PI : 0);
      const wave = Math.sin(time * 8.5 + fish.phase);
      const bodyHeading = heading + wave * 0.065;
      this.dummy.position.set(x, y, 0);
      this.dummy.rotation.set(0, 0, bodyHeading);
      this.dummy.scale.setScalar(fish.size);
      this.dummy.updateMatrix();
      this.body.setMatrixAt(i, this.dummy.matrix);
      this.fins.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x + Math.cos(bodyHeading) * 0.37 * fish.size, y + Math.sin(bodyHeading) * 0.37 * fish.size, 0.01);
      this.dummy.scale.setScalar(fish.size);
      this.dummy.updateMatrix();
      this.eye.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(x - Math.cos(bodyHeading) * 0.42 * fish.size, y - Math.sin(bodyHeading) * 0.42 * fish.size, -0.01);
      this.dummy.rotation.set(0, 0, bodyHeading + wave * 0.52);
      this.dummy.updateMatrix();
      this.tail.setMatrixAt(i, this.dummy.matrix);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.fins.instanceMatrix.needsUpdate = true;
    this.eye.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const mesh of [this.body, this.tail, this.fins, this.eye]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
