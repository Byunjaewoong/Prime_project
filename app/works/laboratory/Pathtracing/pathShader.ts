/*
 * A compact Cornell-box path tracing study following the progressive sampling
 * approach of Erich Loftis' THREE.js-PathTracing-Renderer (CC0-1.0), itself
 * originating from Kevin Beason's smallPT. This shader is a new adaptation.
 */
export const pathFragment = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uResolution;
uniform sampler2D uPrevious;
uniform int uSample;
uniform float uYaw;
uniform float uPitch;
uniform float uZoom;

uint seed;
float random() { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return float(seed) * (1.0 / 4294967296.0); }
struct Hit { float t; vec3 n; vec3 color; int material; };
void offer(inout Hit hit, float t, vec3 n, vec3 color, int material) {
  if (t > 0.001 && t < hit.t) { hit.t = t; hit.n = n; hit.color = color; hit.material = material; }
}
void sphere(inout Hit h, vec3 ro, vec3 rd, vec3 center, float radius, vec3 color, int material) {
  vec3 oc = ro - center;
  float b = dot(oc, rd), c = dot(oc, oc) - radius * radius;
  float d = b * b - c;
  if (d < 0.0) return;
  float t = -b - sqrt(d);
  if (t < 0.001) t = -b + sqrt(d);
  if (t > 0.001) offer(h, t, normalize(ro + rd * t - center), color, material);
}
Hit scene(vec3 ro, vec3 rd) {
  Hit h = Hit(1e6, vec3(0.0), vec3(0.0), 0);
  float t;
  vec3 p;
  if (rd.x < -0.0001) { t = (-2.0 - ro.x) / rd.x; p = ro + rd * t; if (abs(p.y) < 1.5 && p.z > 0.0 && p.z < 4.0) offer(h,t,vec3(1,0,0),vec3(0.78,0.12,0.10),0); }
  if (rd.x > 0.0001) { t = (2.0 - ro.x) / rd.x; p = ro + rd * t; if (abs(p.y) < 1.5 && p.z > 0.0 && p.z < 4.0) offer(h,t,vec3(-1,0,0),vec3(0.11,0.50,0.22),0); }
  if (rd.y < -0.0001) { t = (-1.5 - ro.y) / rd.y; p = ro + rd * t; if (abs(p.x) < 2.0 && p.z > 0.0 && p.z < 4.0) offer(h,t,vec3(0,1,0),vec3(0.76),0); }
  if (rd.y > 0.0001) { t = (1.5 - ro.y) / rd.y; p = ro + rd * t; if (abs(p.x) < 2.0 && p.z > 0.0 && p.z < 4.0) offer(h,t,vec3(0,-1,0),vec3(0.72),0); }
  if (rd.z > 0.0001) { t = (4.0 - ro.z) / rd.z; p = ro + rd * t; if (abs(p.x) < 2.0 && abs(p.y) < 1.5) offer(h,t,vec3(0,0,-1),vec3(0.72),0); }
  sphere(h,ro,rd,vec3(-0.8,-0.72,2.5),0.78,vec3(0.92,0.83,0.65),1);
  sphere(h,ro,rd,vec3(0.85,-0.94,1.8),0.56,vec3(0.83,0.80,0.74),0);
  return h;
}
vec3 cosineHemisphere(vec3 n) {
  float a = 6.2831853 * random(), r = sqrt(random());
  vec3 tangent = normalize(cross(abs(n.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0), n));
  vec3 bitangent = cross(n, tangent);
  return normalize(tangent * (r * cos(a)) + bitangent * (r * sin(a)) + n * sqrt(max(0.0, 1.0 - r*r)));
}
vec3 radiance(vec3 ro, vec3 rd) {
  vec3 result = vec3(0.0), throughput = vec3(1.0);
  for (int bounce = 0; bounce < 5; bounce++) {
    Hit h = scene(ro,rd);
    if (h.t > 1e5) { result += throughput * vec3(0.012,0.016,0.022); break; }
    vec3 p = ro + rd * h.t;
    // The ceiling rectangle emits into the box.
    if (h.n.y < -0.5 && abs(p.x) < 0.63 && p.z > 1.35 && p.z < 2.65) {
      result += throughput * vec3(13.0,11.5,9.5);
      break;
    }
    vec3 n = faceforward(h.n, rd, h.n);
    if (h.material == 0) {
      vec3 lightPoint = vec3((random()-0.5)*1.26,1.48,1.35+random()*1.3);
      vec3 toLight = lightPoint - p;
      float dist2 = dot(toLight,toLight), dist = sqrt(dist2);
      vec3 l = toLight / dist;
      Hit blocker = scene(p + n * 0.003,l);
      if (blocker.t >= dist - 0.01) {
        float geometry = max(dot(n,l),0.0) * max(-l.y,0.0) / max(dist2,0.1);
        result += throughput * h.color * vec3(13.0,11.5,9.5) * geometry * (1.26*1.3/3.14159265);
      }
      throughput *= h.color;
      rd = cosineHemisphere(n);
    } else {
      throughput *= h.color;
      rd = normalize(reflect(rd,n) + cosineHemisphere(n) * 0.035);
    }
    ro = p + n * 0.003;
    if (bounce > 2) {
      float survival = clamp(max(max(throughput.x, throughput.y), throughput.z),0.15,0.95);
      if (random() > survival) break;
      throughput /= survival;
    }
  }
  return result;
}
void main() {
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  seed = pixel.x * 1973u + pixel.y * 9277u + uint(uSample + 1) * 26699u + 1u;
  vec2 uv = (gl_FragCoord.xy + vec2(random(),random()) - 0.5 * uResolution) / uResolution.y;
  vec3 ro = vec3(0.0,0.0,-uZoom);
  float framing = max(1.0, 0.95 * uResolution.y / uResolution.x);
  vec3 rd = normalize(vec3(uv * 1.8 * framing, 1.8));
  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
  rd.xz = mat2(cy,-sy,sy,cy) * rd.xz;
  rd.yz = mat2(cp,-sp,sp,cp) * rd.yz;
  vec3 sampleColor = radiance(ro,rd);
  vec3 previous = uSample == 0 ? vec3(0.0) : texture(uPrevious, gl_FragCoord.xy / uResolution).rgb;
  fragColor = vec4(mix(previous, sampleColor, 1.0 / float(uSample + 1)),1.0);
}`;

export const displayFragment = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uResolution;
void main() {
  vec3 color = texture(uImage, gl_FragCoord.xy / uResolution).rgb;
  color = color / (color + vec3(1.0));
  color = pow(color, vec3(1.0/2.2));
  fragColor = vec4(color,1.0);
}`;
