/*
 * Browser adaptation of the tileable Perlin/Worley cloud-noise approach in
 * Sébastien Hillaire's TileableVolumeNoise (MIT), with weirdfoo.
 * The Worley cell method is credited there to Marc-André Loyer.
 * The ray marcher and presentation are original to this Laboratory study.
 */
export const cloudFragment = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCoverage;
uniform float uDensity;
uniform float uSun;
uniform float uYaw;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float valueNoise(vec3 p, float period) {
  vec3 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float v = 0.0;
  for (int z = 0; z < 2; z++) for (int y = 0; y < 2; y++) for (int x = 0; x < 2; x++) {
    vec3 corner = vec3(float(x), float(y), float(z));
    vec3 w = mix(1.0 - f, f, corner);
    v += hash31(mod(cell + corner, period)) * w.x * w.y * w.z;
  }
  return v;
}
// Same periodic nearest-feature-cell construction as TileableVolumeNoise::Cells.
float worley(vec3 p, float period) {
  vec3 cell = floor(p), f = fract(p);
  float nearest = 2.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 offset = vec3(float(x), float(y), float(z));
    vec3 id = mod(cell + offset, period);
    vec3 feature = vec3(hash31(id), hash31(id + 19.1), hash31(id + 47.7));
    vec3 delta = offset + feature - f;
    nearest = min(nearest, dot(delta, delta));
  }
  return clamp(1.0 - sqrt(nearest), 0.0, 1.0);
}
float shape(vec3 p) {
  vec3 q = p * 0.36;
  float base = valueNoise(q, 8.0) * 0.56 + valueNoise(q * 2.0, 16.0) * 0.28 + valueNoise(q * 4.0, 32.0) * 0.16;
  float cells = worley(q * 1.5, 12.0);
  return mix(base, cells, 0.28);
}
float densityAt(vec3 p) {
  float h = (p.y - 1.3) / 2.6;
  float vertical = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.64, 1.0, h));
  float broad = shape(p + vec3(uTime * 0.035, 0.0, uTime * 0.013));
  float detail = valueNoise(p * 1.6, 32.0);
  return max(0.0, broad - (0.68 - uCoverage * 0.34) - (1.0 - detail) * 0.08) * vertical * uDensity * 5.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 ro = vec3(0.0, 0.35, -4.0);
  vec3 rd = normalize(vec3(uv.x * 0.9, uv.y * 0.78 + 0.23, 1.6));
  float cs = cos(uYaw), sn = sin(uYaw);
  rd.xz = mat2(cs, -sn, sn, cs) * rd.xz;
  vec3 sunDir = normalize(vec3(cos(uSun), 0.38 + sin(uSun) * 0.42, 0.35));
  float skyT = clamp(rd.y * 0.7 + 0.38, 0.0, 1.0);
  vec3 sky = mix(vec3(0.87, 0.79, 0.69), vec3(0.20, 0.43, 0.71), pow(skyT, 0.8));
  sky += vec3(1.0, 0.72, 0.45) * pow(max(dot(rd, sunDir), 0.0), 42.0) * 0.32;
  sky += vec3(1.0, 0.82, 0.58) * pow(max(dot(rd, sunDir), 0.0), 800.0) * 0.8;
  float t0 = max(0.0, (1.3 - ro.y) / max(rd.y, 0.001));
  float t1 = min(30.0, (3.9 - ro.y) / max(rd.y, 0.001));
  vec3 light = vec3(0.0);
  float trans = 1.0;
  if (rd.y > 0.01 && t0 < t1) {
    float stepLen = (t1 - t0) / 56.0;
    float jitter = hash31(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) * stepLen;
    for (int i = 0; i < 56; i++) {
      float t = t0 + float(i) * stepLen + jitter;
      vec3 p = ro + rd * t;
      float d = densityAt(p);
      if (d > 0.001) {
        float shadow = 0.0;
        for (int s = 1; s <= 4; s++) shadow += densityAt(p + sunDir * float(s) * 0.46);
        float sunLight = exp(-shadow * 0.32);
        vec3 lit = mix(vec3(0.38, 0.49, 0.61), vec3(1.0, 0.88, 0.73), sunLight);
        float alpha = 1.0 - exp(-d * stepLen * 1.35);
        light += trans * alpha * lit;
        trans *= 1.0 - alpha;
      }
      if (trans < 0.015) break;
    }
  }
  vec3 color = sky * trans + light;
  color = pow(color, vec3(0.92));
  fragColor = vec4(color, 1.0);
}`;
