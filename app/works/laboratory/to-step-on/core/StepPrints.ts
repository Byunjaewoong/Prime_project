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
};

function createPrintTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 420; canvas.height = 1000;
  const context = canvas.getContext("2d")!;
  context.clip(new Path2D(SOLE_OUTLINE));
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
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export class StepPrints {
  readonly group = new THREE.Group();
  private readonly texture = createPrintTexture();
  private readonly geometry = new THREE.PlaneGeometry(SHOE_WIDTH / 0.85, SHOE_LENGTH);
  private readonly material = new THREE.MeshBasicMaterial({ color: "#585855", map: this.texture, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  stamp(contact: StepContact) {
    const pivot = new THREE.Group(); pivot.position.copy(contact.position); pivot.position.y = 0.0015;
    pivot.rotation.y = contact.heading;
    const print = new THREE.Mesh(this.geometry, this.material);
    print.rotation.set(-Math.PI / 2, 0, Math.PI); print.position.z = 0.017;
    pivot.add(print); this.group.add(pivot);
    // Shared geometries/materials make retained prints inexpensive and bounded.
    if (this.group.children.length > 64) this.group.remove(this.group.children[0]);
  }

  clear() { this.group.clear(); }
  dispose() { this.clear(); this.geometry.dispose(); this.material.dispose(); this.texture.dispose(); }
}
