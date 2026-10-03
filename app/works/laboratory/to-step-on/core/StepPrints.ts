import * as THREE from "three";
import { generateSole, SOLE_OUTLINE } from "../../sole/core/generateSole";
import { SHOE_LENGTH, SHOE_WIDTH } from "./StepModel";

// Contact is independent of the presentation: a future snow height-field can
// subscribe to precisely the same world-space placement and loading event.
export type StepContact = {
  position: THREE.Vector3;
  heading: number;
  length: number;
  width: number;
  pressure: number;
  screen?: {
    x: number; y: number;
    sideX: number; sideY: number;
    heelX: number; heelY: number;
  };
};

const TEXTURE_WIDTH = 420;
const TEXTURE_HEIGHT = 1000;

function createPrintTexture(silhouette?: HTMLCanvasElement) {
  const canvas = document.createElement("canvas"); canvas.width = TEXTURE_WIDTH; canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d")!;
  if (silhouette) {
    context.globalAlpha = 0.15;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    context.globalAlpha = 1;
  } else context.clip(new Path2D(SOLE_OUTLINE));
  for (const mark of generateSole(24637, "trail")) {
    context.save();
    if (mark.transform) {
      const values = mark.transform.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (values?.length === 3) {
        context.translate(values[1], values[2]); context.rotate(values[0] * Math.PI / 180); context.translate(-values[1], -values[2]);
      }
    }
    context.globalCompositeOperation = mark.tone === "paper" ? "destination-out" : "source-over";
    context.globalAlpha = mark.tone === "gray" ? 0.18 : 1;
    context.fillStyle = context.strokeStyle = "#fff";
    const path = new Path2D(mark.d);
    if (mark.strokeWidth) {
      context.lineWidth = mark.strokeWidth; context.lineCap = context.lineJoin = "round"; context.stroke(path);
    } else context.fill(path);
    context.restore();
  }
  if (silhouette) {
    context.globalCompositeOperation = "destination-in";
    context.drawImage(silhouette, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class StepPrints {
  readonly group = new THREE.Group();
  private texture = createPrintTexture();
  private geometry = new THREE.PlaneGeometry(SHOE_WIDTH / 0.85, SHOE_LENGTH);
  private readonly material = new THREE.MeshBasicMaterial({ color: "#585855", map: this.texture, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private offset = 0.017;
  private width = SHOE_WIDTH;
  private length = SHOE_LENGTH;

  get dimensions() { return { width: this.width, length: this.length }; }
  get centerOffset() { return this.offset; }

  matchShoeSole(shoe: THREE.Group) {
    shoe.updateMatrixWorld(true);
    const sole: THREE.Mesh[] = [];
    shoe.traverse(object => {
      if (object instanceof THREE.Mesh && (
        Array.isArray(object.material) ? object.material.some(material => material.name === "insole") : object.material.name === "insole"
      )) sole.push(object);
    });
    if (!sole.length) return;

    const bounds = new THREE.Box3();
    for (const mesh of sole) bounds.expandByObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (size.x <= 0 || size.z <= 0) return;
    const mask = document.createElement("canvas");
    mask.width = TEXTURE_WIDTH; mask.height = TEXTURE_HEIGHT;
    const context = mask.getContext("2d")!;
    context.fillStyle = "#fff";
    context.strokeStyle = "#fff";
    context.lineWidth = 1.5;
    context.lineJoin = "round";
    const point = new THREE.Vector3();
    for (const mesh of sole) {
      const positions = mesh.geometry.getAttribute("position");
      const index = mesh.geometry.getIndex();
      const count = index?.count ?? positions.count;
      for (let i = 0; i + 2 < count; i += 3) {
        context.beginPath();
        for (let vertex = 0; vertex < 3; vertex++) {
          const positionIndex = index ? index.getX(i + vertex) : i + vertex;
          point.fromBufferAttribute(positions, positionIndex).applyMatrix4(mesh.matrixWorld);
          // The decal is rotated 180 degrees in its plane, so texture X runs
          // opposite to the shoe's local X. Account for that before stamping.
          const x = TEXTURE_WIDTH / 2 - (point.x - center.x) / size.x * TEXTURE_WIDTH;
          const y = TEXTURE_HEIGHT / 2 - (point.z - center.z) / size.z * TEXTURE_HEIGHT;
          if (vertex === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath(); context.fill(); context.stroke();
      }
    }

    const texture = createPrintTexture(mask);
    const geometry = new THREE.PlaneGeometry(size.x, size.z);
    this.group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry = geometry; });
    this.geometry.dispose(); this.texture.dispose();
    this.texture = texture; this.geometry = geometry; this.material.map = texture; this.material.needsUpdate = true;
    this.width = size.x; this.length = size.z; this.offset = center.z;
  }

  stamp(contact: StepContact) {
    const pivot = new THREE.Group(); pivot.position.copy(contact.position); pivot.position.y = 0.0015;
    pivot.rotation.y = contact.heading;
    const print = new THREE.Mesh(this.geometry, this.material);
    print.rotation.set(-Math.PI / 2, 0, Math.PI); print.position.z = this.offset;
    pivot.add(print); this.group.add(pivot);
    // Shared geometries/materials make retained prints inexpensive and bounded.
    if (this.group.children.length > 64) this.group.remove(this.group.children[0]);
  }

  clear() { this.group.clear(); }
  dispose() { this.clear(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose(); }
}
