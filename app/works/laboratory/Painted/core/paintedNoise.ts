// Shared gradient Perlin function used by Painted's surface and Foot print's indent texture.
export const PAINTED_PERLIN_GLSL = `
float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

vec2 gradient(vec2 lattice) {
  vec2 offset = vec2(uSeed * 13.17, uSeed * 7.31);
  vec2 direction = vec2(
    hash21(lattice + offset),
    hash21(lattice + offset + vec2(37.19, 91.73))
  ) * 2.0 - 1.0;
  return normalize(direction + vec2(0.0001));
}

float perlin(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  float lower = mix(
    dot(gradient(cell), local),
    dot(gradient(cell + vec2(1.0, 0.0)), local - vec2(1.0, 0.0)),
    fade.x
  );
  float upper = mix(
    dot(gradient(cell + vec2(0.0, 1.0)), local - vec2(0.0, 1.0)),
    dot(gradient(cell + vec2(1.0, 1.0)), local - vec2(1.0, 1.0)),
    fade.x
  );
  return mix(lower, upper, fade.y);
}
`;
