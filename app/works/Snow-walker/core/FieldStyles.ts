import * as THREE from "three";

export const FIELD_STYLES = [
  { name: "Snow", ground: 0xffffff, background: 0xffffff, fog: 0.035, ambient: 1, sun: 0xffffff, intensity: 1.2, sunHeight: 13, footprint: 0x555555, grass: 0, bump: 0.08 },
  { name: "Green grass", ground: 0x4d923b, background: 0x4d923b, fog: 0.012, ambient: 0.7, sun: 0xfff5db, intensity: 1.8, sunHeight: 10, footprint: 0x243615, grass: 1, bump: 0.035 },
  { name: "Golden grass", ground: 0xe0b44b, background: 0xe0b44b, fog: 0.012, ambient: 0.65, sun: 0xffe5b0, intensity: 2, sunHeight: 8, footprint: 0x67441c, grass: 1, bump: 0.035 },
] as const;

/** Code-generated grass grain: short blades over broad, uneven patches. */
export function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#b5b5b5";
  ctx.fillRect(0, 0, 1024, 1024);
  // Seeded texture keeps the field stable across reloads and style changes.
  let seed = 71429;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 140; i++) {
    const x = random() * 1024, y = random() * 1024, radius = 30 + random() * 100;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, i % 2 ? "#ffffff22" : "#00000022");
    gradient.addColorStop(1, "#00000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 18000; i++) {
    const x = random() * 1024, y = random() * 1024;
    const length = 4 + random() * 11, lean = (random() - 0.5) * 5;
    const shade = Math.floor(70 + random() * 150);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 0.7 + random() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean, y - length); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}
