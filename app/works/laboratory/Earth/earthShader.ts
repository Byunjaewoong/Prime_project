import { cloudNoiseGLSL } from "../Cloud/cloudShader";

export const noiseFragment = `#version 300 es
precision highp float;
uniform float uSlice;
out vec4 result;
${cloudNoiseGLSL}
void main() {
  vec3 uv = vec3(gl_FragCoord.xy / 64.0, uSlice);
  vec3 p = uv * 8.0;
  result = vec4(shape(p / 0.36), worley(p * 4.0, 32.0),
    valueNoise(p * 0.5, 4.0), valueNoise(p, 8.0));
}`;

// Appended to Bruneton's atmosphere shader; all distances are kilometres.
export const earthFragment = `
uniform sampler3D uNoise;
uniform vec2 uResolution;
uniform vec3 uCamera, uForward, uRight, uUp, uSun;
uniform float uCoverage, uDensity, uExposure, uTime, uTanFov;
uniform int uSteps;
out vec4 color;
const float EARTH = 6360.0;
const float CLOUD_BASE = 6361.8;
const float CLOUD_TOP = 6367.5;

vec2 sphereInterval(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float d = b*b - dot(ro,ro) + radius*radius;
  if (d < 0.0) return vec2(-1.0);
  return vec2(-b - sqrt(d), -b + sqrt(d));
}
float cloudDensity(vec3 p) {
  float h = (length(p) - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
  if (h <= 0.0 || h >= 1.0 || uCoverage <= 0.001) return 0.0;
  vec3 wind = vec3(uTime * 0.7 + 73.0, uTime * 0.2 + 141.0, 97.0);
  float footprint = length(p-uCamera) * 2.0 * uTanFov / uResolution.y;
  vec4 base = textureLod(uNoise, (p + wind) / 48.0, max(0.0,log2(footprint*64.0/48.0)));
  float weather = textureLod(uNoise, (p + wind * 0.4) / 3200.0 + vec3(0.31,0.47,0.13), max(0.0,log2(footprint*64.0/3200.0))).b;
  float detail = textureLod(uNoise, (p + wind) / 12.0, max(0.0,log2(footprint*64.0/12.0))).g;
  float cloudHeight = mix(0.42,1.0,smoothstep(0.3,0.65,base.r));
  float profile = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(cloudHeight-0.2,cloudHeight,h));
  float weatherMask = smoothstep(0.42,0.66,weather + uCoverage - 0.5);
  return max(0.0, base.r - 0.32 - (1.0 - detail) * 0.065) * weatherMask * profile * uDensity * 9.0;
}
// Shell intervals skip the empty space between ground and the cloud base.
vec2 cloudInterval(vec3 ro, vec3 rd, float limit) {
  vec2 outer = sphereInterval(ro, rd, CLOUD_TOP);
  if (outer.y <= 0.0) return vec2(0.0);
  float enter = max(0.0, outer.x), leave = min(limit, outer.y);
  vec2 inner = sphereInterval(ro, rd, CLOUD_BASE);
  if (length(ro) < CLOUD_BASE) enter = max(enter, inner.y);
  else if (inner.x > enter) leave = min(leave, inner.x);
  return vec2(enter, max(enter, leave));
}
float cloudShadow(vec3 p) {
  if (uCoverage <= 0.001) return 1.0;
  vec2 interval = cloudInterval(p, uSun, 240.0);
  float stepLength = min(8.0, (interval.y - interval.x) / 6.0);
  float optical = 0.0;
  for (int i = 0; i < 6; i++) {
    optical += cloudDensity(p + uSun * (interval.x + (float(i)+0.5)*stepLength)) * stepLength;
  }
  return exp(-optical * 0.85);
}
float phaseHG(float cosine, float g) {
  return (1.0 - g*g) / (4.0 * PI * pow(max(0.001, 1.0 + g*g - 2.0*g*cosine), 1.5));
}
void main() {
  vec2 screen = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 rd = normalize(uForward + (uRight * screen.x + uUp * screen.y) * uTanFov);
  vec3 ro = uCamera;
  vec2 ground = sphereInterval(ro, rd, EARTH);
  float distanceToGround = ground.x > 0.0 ? ground.x : 1e7;
  vec3 transmittance;
  vec3 background = GetSkyRadiance(ro,rd,0.0,uSun,transmittance);
  if (dot(rd,uSun) > cos(0.004675)) background += transmittance * GetSolarRadiance();
  float discriminant = EARTH*EARTH - (dot(ro,ro)-dot(ro,rd)*dot(ro,rd));
  float groundEdgeWidth = max(fwidth(discriminant),0.0001);
  if (distanceToGround < 1e6) {
    vec3 p = ro + rd * distanceToGround;
    vec3 skyLight;
    vec3 sunlight = GetSunAndSkyIrradiance(p, normalize(p), uSun, skyLight);
    vec3 surface = vec3(0.0,0.0,0.04) / PI * (sunlight * cloudShadow(p + normalize(p)*0.01) + skyLight);
    vec3 air = GetSkyRadianceToPoint(ro,p,0.0,uSun,transmittance);
    background = mix(background,surface * transmittance + air,smoothstep(0.0,groundEdgeWidth*1.5,discriminant));
  }
  vec2 interval = cloudInterval(ro,rd,distanceToGround);
  vec3 cloudLight = vec3(0.0);
  float visibility = 1.0, weightedDepth = 0.0, weightSum = 0.0;
  if (interval.y > interval.x && uCoverage > 0.001) {
    float stepLength = (interval.y - interval.x) / float(uSteps);
    float jitter = mix(0.5,fract(52.9829189 * fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715)))),0.6);
    float phase = 0.85 * phaseHG(dot(rd,uSun),0.72) + 0.15 * phaseHG(dot(rd,uSun),-0.25);
    for (int i = 0; i < 64; i++) {
      if (i >= uSteps || visibility < 0.008) break;
      float t = interval.x + (float(i)+jitter) * stepLength;
      vec3 p = ro + rd*t;
      float density = cloudDensity(p);
      if (density < 0.001) continue;
      float shadow = cloudShadow(p);
      float r = length(p);
      vec3 direct = ATMOSPHERE.solar_irradiance * GetTransmittanceToSun(ATMOSPHERE, transmittance_texture, r, dot(p,uSun)/r);
      vec3 ambient;
      GetSunAndSkyIrradiance(p,normalize(p),uSun,ambient);
      // Two attenuated scattering orders approximate cloud multiple scattering.
      float multiple = 0.3 * pow(shadow,0.5) + 0.12 * pow(shadow,0.25);
      vec3 source = direct * (phase * shadow + multiple / (4.0*PI)) + ambient * (0.35 / PI);
      float alpha = 1.0 - exp(-density * stepLength * 0.85);
      float weight = visibility * alpha;
      cloudLight += weight * source;
      weightedDepth += weight * t;
      weightSum += weight;
      visibility *= 1.0 - alpha;
    }
  }
  vec3 radiance = background;
  if (weightSum > 0.0001) {
    // Representative-depth aerial perspective saves a LUT integration per step.
    vec3 p = ro + rd * (weightedDepth/weightSum);
    vec3 air = GetSkyRadianceToPoint(ro,p,0.0,uSun,transmittance);
    radiance = background * visibility + cloudLight * transmittance + air * (1.0-visibility);
  }
  color = vec4(pow(1.0-exp(-max(radiance,vec3(0.0))*uExposure),vec3(1.0/2.2)),1.0);
}`;
