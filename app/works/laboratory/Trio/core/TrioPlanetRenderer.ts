import type { Body, Vec3 } from "./TrioSimulation";
import { rotatingSurfaceDistance, surfaceRotation } from "@/app/lib/rotatingPlanetSurface";

const light: Vec3 = (() => {
  const length = Math.hypot(-0.46, -0.38, 0.8);
  return { x: -0.46 / length, y: -0.38 / length, z: 0.8 / length };
})();

function channelFromDistance(distance: number, coefficient: number) {
  const value = coefficient > 0
    ? (distance / coefficient) * 255
    : 255 + (distance / coefficient) * 255;
  return Math.max(0, Math.min(255, value));
}

export class TrioPlanetRenderer {
  private sprites = Array.from({ length: 3 }, () => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas is unavailable");
    return { canvas, context };
  });

  draw(context: CanvasRenderingContext2D, body: Body, index: number, x: number, y: number, radius: number, ratio: number) {
    const sprite = this.sprites[index];
    const pixelRadius = Math.max(1, Math.round(radius * ratio));
    const size = pixelRadius * 2 + 2;
    if (sprite.canvas.width !== size || sprite.canvas.height !== size) {
      sprite.canvas.width = size;
      sprite.canvas.height = size;
    }
    const image = sprite.context.createImageData(size, size);
    const pixels = image.data;
    const center = size * 0.5;
    const axis = body.appearance.axis;
    const palette = body.appearance.palette;
    const rotation = surfaceRotation(axis.x, axis.y, axis.z, body.spinAngle);

    // Planet's physical-pixel sphere shading, sampled in a rotating local frame.
    for (let py = 0; py < size; py += 1) {
      const ny = (py + 0.5 - center) / pixelRadius;
      for (let px = 0; px < size; px += 1) {
        const nx = (px + 0.5 - center) / pixelRadius;
        const surfaceSquared = nx * nx + ny * ny;
        if (surfaceSquared > 1 + 1 / pixelRadius) continue;
        const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, surfaceSquared)));
        const distance = rotatingSurfaceDistance(nx, ny, nz, 1, rotation, body.appearance.detailSeed);
        const lambert = Math.max(0, nx * light.x + ny * light.y + nz * light.z);
        const lightLevel = 0.055 + Math.pow(lambert, 1.18) * 0.945;
        const rim = Math.pow(Math.max(0, 1 - nz), 2.4) * 0.14;
        const illumination = Math.min(1, lightLevel + rim);
        const edgeDistance = pixelRadius - Math.hypot(px + 0.5 - center, py + 0.5 - center);
        const coverage = Math.max(0, Math.min(1, edgeDistance + 0.5));
        const offset = (py * size + px) * 4;
        pixels[offset] = Math.round(channelFromDistance(distance, palette.red) * illumination);
        pixels[offset + 1] = Math.round(channelFromDistance(distance, palette.green) * illumination);
        pixels[offset + 2] = Math.round(channelFromDistance(distance, palette.blue) * illumination);
        pixels[offset + 3] = Math.round(coverage * 255);
      }
    }
    sprite.context.putImageData(image, 0, 0);
    const displayRadius = pixelRadius / ratio;
    context.drawImage(sprite.canvas, x - displayRadius - 1 / ratio, y - displayRadius - 1 / ratio, size / ratio, size / ratio);
  }
}
