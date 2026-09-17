import * as THREE from "three";

const RINGS = 14;
const SIDES = 56;
const TENTACLE_POINTS = 48;

export class JellyfishModel {
  readonly group = new THREE.Group();
  private bellGeometry = new THREE.BufferGeometry();
  private bellPositions = new Float32Array((RINGS + 1) * (SIDES + 1) * 3);
  private tentacles: { geometry: THREE.BufferGeometry; positions: Float32Array; angle: number; length: number; phase: number; radius: number }[] = [];
  private ribbons: { geometry: THREE.BufferGeometry; positions: Float32Array; angle: number; phase: number }[] = [];
  private materials: THREE.Material[] = [];
  private moteGeometry: THREE.BufferGeometry | null = null;

  constructor() {
    const indices: number[] = [];
    for (let ring = 0; ring < RINGS; ring++) {
      for (let side = 0; side < SIDES; side++) {
        const a = ring * (SIDES + 1) + side;
        const b = a + SIDES + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.bellGeometry.setAttribute("position", new THREE.BufferAttribute(this.bellPositions, 3));
    this.bellGeometry.setIndex(indices);
    const bellMaterial = new THREE.MeshPhongMaterial({
      color: 0x1a2028,
      specular: 0xa8b4c0,
      shininess: 78,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(bellMaterial);
    this.group.add(new THREE.Mesh(this.bellGeometry, bellMaterial));

    const innerMaterial = new THREE.MeshPhongMaterial({
      color: 0x3a4149,
      specular: 0xbac6d1,
      shininess: 90,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(innerMaterial);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), innerMaterial);
    inner.rotation.x = Math.PI;
    inner.position.y = 0.55;
    inner.scale.set(1, 0.5, 0.7);
    this.group.add(inner);

    for (let i = 0; i < 18; i++) {
      const positions = new Float32Array(TENTACLE_POINTS * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: i % 5 === 0 ? 0x191e25 : 0x414a54,
        transparent: true,
        opacity: i % 5 === 0 ? 0.68 : 0.38,
        depthWrite: false,
      });
      this.materials.push(material);
      this.group.add(new THREE.Line(geometry, material));
      this.tentacles.push({
        geometry,
        positions,
        angle: i * Math.PI * 2 / 18,
        length: 2.9 + (i * 7 % 9) * 0.22,
        phase: i * 1.83,
        radius: i % 3 === 0 ? 0.28 : 1.12,
      });
    }

    for (let i = 0; i < 5; i++) {
      const positions = new Float32Array(TENTACLE_POINTS * 2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const ribbonIndices: number[] = [];
      for (let j = 0; j < TENTACLE_POINTS - 1; j++) {
        const a = j * 2;
        ribbonIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      geometry.setIndex(ribbonIndices);
      const material = new THREE.MeshBasicMaterial({
        color: 0x343c45,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.materials.push(material);
      this.group.add(new THREE.Mesh(geometry, material));
      this.ribbons.push({ geometry, positions, angle: i * Math.PI * 2 / 5, phase: i * 2.1 });
    }

    const motePositions = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      const n = i * 3;
      motePositions[n] = Math.sin(i * 78.233) * 4.5;
      motePositions[n + 1] = Math.sin(i * 19.317) * 4.2 - 0.6;
      motePositions[n + 2] = -1.5 - (i % 5) * 0.3;
    }
    this.moteGeometry = new THREE.BufferGeometry();
    this.moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
    const moteMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false });
    this.materials.push(moteMaterial);
    this.group.add(new THREE.Points(this.moteGeometry, moteMaterial));
    this.update(0);
  }

  update(time: number) {
    const pulse = Math.sin(time * 2.25);
    const bellRadius = 1.42 * (1 + pulse * 0.12);
    const bellHeight = 0.92 * (1 - pulse * 0.12);
    for (let ring = 0; ring <= RINGS; ring++) {
      const u = ring / RINGS;
      const theta = u * Math.PI / 2;
      for (let side = 0; side <= SIDES; side++) {
        const angle = side / SIDES * Math.PI * 2;
        const ripple = 1 + Math.pow(u, 5) * 0.035 * Math.sin(angle * 8 + time * 2.25);
        const radius = Math.sin(theta) * bellRadius * ripple;
        const k = (ring * (SIDES + 1) + side) * 3;
        this.bellPositions[k] = Math.cos(angle) * radius;
        this.bellPositions[k + 1] = 0.48 + Math.cos(theta) * bellHeight;
        this.bellPositions[k + 2] = Math.sin(angle) * radius * 0.67;
      }
    }
    this.bellGeometry.attributes.position.needsUpdate = true;
    this.bellGeometry.computeVertexNormals();

    for (const line of this.tentacles) {
      for (let j = 0; j < TENTACLE_POINTS; j++) {
        const u = j / (TENTACLE_POINTS - 1);
        const sway = Math.sin(time * 1.25 - u * 4.3 + line.phase) * u * u * 0.45;
        const k = j * 3;
        line.positions[k] = Math.cos(line.angle) * line.radius * (1 - u * 0.18) + sway;
        line.positions[k + 1] = 0.48 - line.length * u + 0.12 * Math.sin(time * 1.8 - u * 5 + line.phase) * u;
        line.positions[k + 2] = Math.sin(line.angle) * line.radius * 0.67 + Math.cos(time * 1.1 - u * 3 + line.phase) * u * 0.28;
      }
      line.geometry.attributes.position.needsUpdate = true;
    }

    for (const ribbon of this.ribbons) {
      for (let j = 0; j < TENTACLE_POINTS; j++) {
        const u = j / (TENTACLE_POINTS - 1);
        const wave = Math.sin(u * 13 - time * 1.7 + ribbon.phase);
        const baseX = Math.cos(ribbon.angle) * 0.24 + u * 0.4 * Math.sin(time * 0.8 + ribbon.phase);
        const baseZ = Math.sin(ribbon.angle) * 0.18;
        const width = (0.10 + u * 0.28) * Math.sin(Math.PI * u) * (0.7 + 0.3 * wave);
        for (let edge = 0; edge < 2; edge++) {
          const k = (j * 2 + edge) * 3;
          ribbon.positions[k] = baseX + (edge ? 1 : -1) * width + wave * u * 0.12;
          ribbon.positions[k + 1] = 0.4 - u * 3.65;
          ribbon.positions[k + 2] = baseZ + Math.cos(u * 17 - time * 1.5 + ribbon.phase) * u * 0.18;
        }
      }
      ribbon.geometry.attributes.position.needsUpdate = true;
      ribbon.geometry.computeVertexNormals();
    }

    this.group.position.set(Math.sin(time * 0.32) * 0.28, Math.sin(time * 2.25 + 0.5) * 0.13, Math.sin(time * 0.46) * 0.08);
    this.group.rotation.z = Math.sin(time * 0.48) * 0.09;
    this.group.rotation.y = Math.sin(time * 0.28) * 0.18;
  }

  dispose() {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
        object.geometry.dispose();
      }
    });
    for (const material of this.materials) material.dispose();
  }
}
