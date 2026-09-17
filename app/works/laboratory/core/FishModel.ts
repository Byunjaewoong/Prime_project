import * as THREE from "three";

const SECTIONS = 52;
const ACROSS = 16;
const TAIL_X = -2.05;
const HEAD_X = 1.85;

function bodyWidth(u: number) {
  return (0.09 + 0.72 * Math.pow(Math.sin(Math.PI * u), 0.88)) * (0.8 + u * 0.23);
}

function bodyWave(x: number, time: number) {
  const strength = Math.pow(Math.max(0, (HEAD_X - x) / (HEAD_X - TAIL_X)), 1.7);
  return Math.sin(time * 3.8 + x * 1.75) * strength * 0.24;
}

function finShape(points: [number, number][]) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 12);
}

export class FishModel {
  readonly group = new THREE.Group();
  private bodyGeometry = new THREE.BufferGeometry();
  private bodyPositions = new Float32Array((SECTIONS + 1) * (ACROSS + 1) * 3);
  private tail = new THREE.Group();
  private leftFin = new THREE.Group();
  private rightFin = new THREE.Group();
  private materials: THREE.Material[] = [];
  private shadowTexture: THREE.CanvasTexture | null = null;

  constructor() {
    const indices: number[] = [];
    const colors = new Float32Array(this.bodyPositions.length);
    for (let section = 0; section <= SECTIONS; section++) {
      const u = section / SECTIONS;
      for (let across = 0; across <= ACROSS; across++) {
        const v = across / ACROSS * 2 - 1;
        const k = (section * (ACROSS + 1) + across) * 3;
        const irregular = Math.sin(u * 54 + v * 8) * 0.15 + Math.sin(u * 108 - v * 15) * 0.07;
        const headPatch = u > 0.69 + irregular * 0.18 && Math.abs(v) < 0.88;
        const shoulderPatch = u > 0.40 + irregular * 0.12 && u < 0.58 + irregular * 0.12 && Math.abs(v) < 0.76;
        const tailPatch = u < 0.19 + irregular * 0.12;
        const dark = headPatch || shoulderPatch || tailPatch;
        const edge = Math.abs(v);
        const ink = dark ? 0.10 + edge * 0.10 + Math.max(0, irregular) * 0.13 : 0.81 - edge * 0.17 + irregular * 0.11;
        colors[k] = ink;
        colors[k + 1] = ink + (dark ? 0.01 : 0.005);
        colors[k + 2] = ink + (dark ? 0.025 : 0.015);
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
    const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
    this.materials.push(bodyMaterial);
    this.group.add(new THREE.Mesh(this.bodyGeometry, bodyMaterial));

    const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x1d2227, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
    const paleFinMaterial = new THREE.MeshBasicMaterial({ color: 0x777e82, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false });
    this.materials.push(edgeMaterial, paleFinMaterial);

    const tailUpper = finShape([[0, 0], [-0.38, 0.13], [-0.87, 0.68], [-0.55, 0.51], [-0.25, 0.28]]);
    const tailLower = finShape([[0, 0], [-0.38, -0.13], [-0.85, -0.64], [-0.55, -0.48], [-0.25, -0.26]]);
    this.tail.add(new THREE.Mesh(tailUpper, edgeMaterial), new THREE.Mesh(tailLower, paleFinMaterial));
    this.tail.position.set(TAIL_X, 0, 0.03);
    this.group.add(this.tail);

    const finPoints: [number, number][] = [[0, 0], [-0.25, 0.20], [-0.78, 0.87], [-0.50, 0.72], [-0.10, 0.43]];
    this.leftFin.add(new THREE.Mesh(finShape(finPoints), paleFinMaterial));
    this.leftFin.position.set(0.55, 0.48, 0.08);
    this.group.add(this.leftFin);
    this.rightFin.add(new THREE.Mesh(finShape(finPoints), edgeMaterial));
    this.rightFin.position.set(0.55, -0.48, 0.08);
    this.rightFin.scale.y = -1;
    this.group.add(this.rightFin);

    const dorsal = finShape([[-0.80, 0], [-1.02, 0.14], [-0.76, 0.30], [-0.20, 0.11], [0.05, 0]]);
    const dorsalMesh = new THREE.Mesh(dorsal, edgeMaterial);
    dorsalMesh.position.z = 0.22;
    this.group.add(dorsalMesh);

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x111417 });
    const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xe9e9e6 });
    this.materials.push(eyeMaterial, glintMaterial);
    for (const sign of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), eyeMaterial);
      eye.position.set(1.35, sign * 0.28, 0.27);
      this.group.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), glintMaterial);
      glint.position.set(1.36, sign * 0.28 + 0.015, 0.34);
      this.group.add(glint);
    }

    const mouthMaterial = new THREE.LineBasicMaterial({ color: 0x20262a, transparent: true, opacity: 0.55 });
    this.materials.push(mouthMaterial);
    const mouth = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(1.70, -0.15, 0.12),
      new THREE.Vector3(1.80, 0, 0.14),
      new THREE.Vector3(1.70, 0.15, 0.12),
    ]);
    this.group.add(new THREE.Line(mouth, mouthMaterial));

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext("2d");
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(32, 32, 5, 32, 32, 32);
      gradient.addColorStop(0, "rgba(52,61,64,0.38)");
      gradient.addColorStop(1, "rgba(52,61,64,0)");
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 64, 64);
    }
    this.shadowTexture = new THREE.CanvasTexture(shadowCanvas);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 1.8),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    shadow.position.set(-0.17, -0.18, -0.15);
    this.group.add(shadow);
    this.materials.push(shadow.material);
    this.update(0);
  }

  update(time: number) {
    for (let section = 0; section <= SECTIONS; section++) {
      const u = section / SECTIONS;
      const x = TAIL_X + u * (HEAD_X - TAIL_X);
      const width = bodyWidth(u);
      const wave = bodyWave(x, time);
      for (let across = 0; across <= ACROSS; across++) {
        const v = across / ACROSS * 2 - 1;
        const k = (section * (ACROSS + 1) + across) * 3;
        this.bodyPositions[k] = x;
        this.bodyPositions[k + 1] = v * width + wave;
        this.bodyPositions[k + 2] = 0.05 + (1 - v * v) * 0.23 * Math.sin(Math.PI * u);
      }
    }
    this.bodyGeometry.attributes.position.needsUpdate = true;
    this.bodyGeometry.computeVertexNormals();
    this.tail.position.y = bodyWave(TAIL_X, time);
    this.tail.rotation.z = Math.sin(time * 3.8 + TAIL_X * 1.75) * 0.33;
    this.leftFin.rotation.z = Math.sin(time * 4.1) * 0.14;
    this.rightFin.rotation.z = Math.sin(time * 4.1 + Math.PI) * 0.14;
    this.group.position.set(Math.sin(time * 0.28) * 0.37, Math.sin(time * 0.42) * 0.3, 0);
    this.group.rotation.z = 0.66 + Math.sin(time * 0.32) * 0.16;
  }

  dispose() {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
    this.shadowTexture?.dispose();
  }
}
