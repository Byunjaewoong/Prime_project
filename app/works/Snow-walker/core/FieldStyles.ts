import * as THREE from "three";

export const FIELD_STYLES = [
  { name: "Snow", ground: 0xffffff, background: 0xffffff, fog: 0.035, ambient: 1, sun: 0xffffff, intensity: 1.2, sunHeight: 13, footprint: 0x555555, grass: 0, bump: 0.08 },
  { name: "Green grass", ground: 0xd5f3bd, background: 0x6fa441, fog: 0.008, ambient: 1.1, sun: 0xffffff, intensity: 2, sunHeight: 14, footprint: 0x243615, grass: 1, bump: 0.055 },
  { name: "Golden grass", ground: 0xffebc9, background: 0xcfa14c, fog: 0.01, ambient: 0.8, sun: 0xffe5b0, intensity: 2, sunHeight: 8, footprint: 0x67441c, grass: 1, bump: 0.045 },
] as const;

/** Distinct, seamless vegetation tiles; large patches are generated in the shader. */
export function createGrassTexture(golden = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = golden ? "#a47e3c" : "#427c23";
  ctx.fillRect(0, 0, 1024, 1024);
  // Seeded texture keeps the field stable across reloads and style changes.
  let seed = golden ? 29173 : 71429;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const palette = golden ? ["#80602c", "#c09b52", "#e8c978", "#b18b45"] : ["#28551d", "#4b8625", "#78b93b", "#94c94b", "#396e28"];
  for (let i = 0; i < (golden ? 13000 : 27000); i++) {
    const x = random() * 1024, y = random() * 1024;
    const length = golden ? 12 + random() * 22 : 5 + random() * 12;
    const angle = golden ? -0.9 + random() * 0.45 : random() * Math.PI * 2;
    const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
    ctx.strokeStyle = palette[Math.floor(random() * palette.length)];
    ctx.lineWidth = golden ? 0.8 + random() : 1 + random() * 1.3;
    // Copy edge-crossing blades to opposite edges so filtering cannot reveal a seam.
    for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) {
      if (x + ox < -35 || x + ox > 1059 || y + oy < -35 || y + oy > 1059) continue;
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + dx * 0.45 - dy * 0.15, y + oy + dy * 0.45 + dx * 0.15, x + ox + dx, y + oy + dy);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

export const VEGETATION_SHADER = `
uniform sampler2D grassMap;
uniform sampler2D goldenMap;
uniform float grassMix;
uniform float goldenMix;
float fieldHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fieldNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fieldHash(i), fieldHash(i + vec2(1,0)), f.x),
    mix(fieldHash(i + vec2(0,1)), fieldHash(i + vec2(1,1)), f.x), f.y);
}
vec4 fieldSample(sampler2D tex, vec2 uv, float dry) {
  vec2 warp = vec2(fieldNoise(uv * 0.71), fieldNoise(uv * 0.71 + 31.7)) - 0.5;
  vec2 p = uv + warp * 0.8;
  // Overlap incommensurate scales/orientations with continuously varying weights.
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 a = texture2D(tex, p);
  vec4 b = texture2D(tex, rotation * p * 1.37 + vec2(0.31, 0.67));
  vec4 c = texture2D(tex, p * 0.73 + vec2(0.73, 0.19));
  float weight = smoothstep(0.15, 0.85, fieldNoise(uv * 0.47 + 17.0));
  vec4 grain = mix(mix(a, b, weight), c, 0.25);
  float patches = fieldNoise(uv * 0.83) * 0.65 + fieldNoise(uv * 2.31) * 0.35;
  grain.rgb *= mix(0.88, 1.13, patches);
  grain.rgb = mix(grain.rgb, grain.rgb * vec3(1.06, 1.02, 0.92), dry * patches * 0.4);
  return grain;
}
vec4 vegetation(vec2 uv) {
  if (goldenMix < 0.001) return fieldSample(grassMap, uv, 0.0);
  if (goldenMix > 0.999) return fieldSample(goldenMap, uv * 0.82, 1.0);
  return mix(fieldSample(grassMap, uv, 0.0), fieldSample(goldenMap, uv * 0.82, 1.0), goldenMix);
}
`;
