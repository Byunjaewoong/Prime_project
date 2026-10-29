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
uniform int uRealTime;
uniform sampler2D uStars;
uniform mat3 uLocalToEquatorial;
uniform vec3 uMoon, uMoonSun;
uniform float uMoonRadius, uSunRadius, uSolarScale, uConstellations;
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
// Rotate each scale independently so the repeating volume's axes do not line up.
const mat3 CLOUD_ROTATION = mat3(0.36,0.48,-0.8, -0.8,0.6,0.0, 0.48,0.64,0.6);
vec4 cloudNoise(vec3 p, float scale, float footprint) {
  return textureLod(uNoise,p/scale,max(0.0,log2(max(0.001,footprint)*64.0/scale)));
}
float cloudDensity(vec3 p) {
  float h = (length(p) - CLOUD_BASE) / (CLOUD_TOP - CLOUD_BASE);
  if (h <= 0.0 || h >= 1.0 || uCoverage <= 0.001) return 0.0;
  vec3 wind = vec3(uTime * 0.7 + 73.0, uTime * 0.2 + 141.0, 97.0);
  float footprint = length(p-uCamera) * 2.0 * uTanFov / uResolution.y;
  vec3 region = CLOUD_ROTATION * (p + wind * 0.4) + vec3(837.0,1519.0,421.0);
  vec3 warp = cloudNoise(region,7300.0,footprint).abr - vec3(0.5,0.5,0.45);
  region += warp * 1850.0;
  float weather = cloudNoise(region,4100.0,footprint).b * 0.52
    + cloudNoise(CLOUD_ROTATION*region+913.0,1373.0,footprint).a * 0.30
    + cloudNoise(CLOUD_ROTATION*region.yzx-571.0,467.0,footprint).a * 0.18;
  weather = 0.5 + (weather-0.5)*1.6;
  float weatherMask = smoothstep(0.34,0.61,weather + uCoverage - 0.5);
  if (weatherMask < 0.001) return 0.0;
  // Different periods and a slowly warped coordinate remove the 48 km grid.
  vec3 local = p + wind + warp * 190.0;
  float base = cloudNoise(local,48.0,footprint).r * 0.62
    + cloudNoise(CLOUD_ROTATION*local+37.0,83.7,footprint).r * 0.38;
  float clusters = cloudNoise(CLOUD_ROTATION*local-183.0,613.0,footprint).a;
  base = mix(base, clusters, 0.35);
  float detail = cloudNoise(CLOUD_ROTATION*local.zxy,17.3,footprint).g;
  float cloudHeight = mix(0.42,1.0,smoothstep(0.3,0.65,base));
  float profile = smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(cloudHeight-0.2,cloudHeight,h));
  return max(0.0, base - 0.32 - (1.0 - detail) * 0.065) * weatherMask * profile * uDensity * 9.0;
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
vec4 celestialRadiance(vec3 rd, vec3 sky) {
  if (uRealTime == 0) return vec4(0.0);
  vec3 eq = normalize(uLocalToEquatorial * rd);
  vec2 uv = vec2(fract(atan(eq.y,eq.x)/(2.0*PI)),acos(clamp(eq.z,-1.0,1.0))/PI);
  vec4 stars = texture(uStars,uv);
  float night = 1.0-smoothstep(-0.20,0.02,uSun.z);
  float skyBrightness = dot(max(sky,vec3(0.0)),vec3(0.2126,0.7152,0.0722));
  vec3 light = (stars.rgb*0.06 + vec3(0.12,0.26,0.4)*stars.a*uConstellations*0.004)
    * night / (1.0+skyBrightness*500.0) / uSolarScale;
  // Resolve the small lunar sphere in angular coordinates to avoid cancellation
  // at its actual 350,000–410,000 km distance. Its surface normal sets the phase.
  float facing = dot(rd,uMoon);
  vec3 tangent = (rd-uMoon*facing)/sin(uMoonRadius);
  float radius = length(tangent);
  float edge = max(fwidth(radius),0.001);
  float mask = facing > 0.0 ? 1.0-smoothstep(1.0-edge,1.0+edge,radius) : 0.0;
  if (mask > 0.0) {
    vec3 normal = normalize(tangent-uMoon*sqrt(max(0.0,1.0-radius*radius)));
    float lighting = max(0.0,dot(normal,uMoonSun));
    float maria = 0.8 + 0.12*sin(normal.x*19.0+sin(normal.y*13.0))*sin(normal.z*23.0);
    light = mix(light,vec3(0.16,0.155,0.145)*lighting*maria,mask);
  }
  return vec4(light,mask);
}
void main() {
  vec2 screen = (gl_FragCoord.xy * 2.0 - uResolution) / uResolution.y;
  vec3 rd = normalize(uForward + (uRight * screen.x + uUp * screen.y) * uTanFov);
  vec3 ro = uCamera;
  vec2 ground = sphereInterval(ro, rd, EARTH);
  float distanceToGround = ground.x > 0.0 ? ground.x : 1e7;
  vec3 transmittance;
  vec3 background = GetSkyRadiance(ro,rd,0.0,uSun,transmittance);
  vec4 celestial = celestialRadiance(rd,background);
  background += transmittance*celestial.rgb;
  if (dot(rd,uSun) > cos(uSunRadius)) background += transmittance * GetSolarRadiance()*(1.0-celestial.a)*pow(0.004675/uSunRadius,2.0);
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
  color = vec4(pow(1.0-exp(-max(radiance,vec3(0.0))*uExposure*uSolarScale),vec3(1.0/2.2)),1.0);
}`;
