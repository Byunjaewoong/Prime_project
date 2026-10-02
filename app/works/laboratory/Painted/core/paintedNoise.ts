// Shared gradient Perlin function used by Painted's surface and Foot print's indent texture.
export const PAINTED_PERLIN_GLSL = `
float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

vec2 gradient(vec2 lattice, float seed) {
  vec2 offset = vec2(seed * 13.17, seed * 7.31);
  vec2 direction = vec2(
    hash21(lattice + offset),
    hash21(lattice + offset + vec2(37.19, 91.73))
  ) * 2.0 - 1.0;
  return normalize(direction + vec2(0.0001));
}

float perlinSeeded(vec2 p, float seed) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  float lower = mix(
    dot(gradient(cell, seed), local),
    dot(gradient(cell + vec2(1.0, 0.0), seed), local - vec2(1.0, 0.0)),
    fade.x
  );
  float upper = mix(
    dot(gradient(cell + vec2(0.0, 1.0), seed), local - vec2(0.0, 1.0)),
    dot(gradient(cell + vec2(1.0, 1.0), seed), local - vec2(1.0, 1.0)),
    fade.x
  );
  return mix(lower, upper, fade.y);
}

float perlin(vec2 p) {
  return perlinSeeded(p, uSeed);
}
`;
