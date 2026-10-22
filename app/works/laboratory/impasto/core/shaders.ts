export const vertex = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export const fragment = `
precision highp float;
uniform sampler2D uPaint;
uniform vec2 uView;
uniform float uTexel, uRelief, uTexture, uGloss;
uniform vec3 uLight;
uniform vec3 uCursor;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}
float height(vec2 uv) { return texture2D(uPaint, clamp(uv, .001, .999)).a * uRelief; }
void main() {
  vec2 uv = .5 + (vUv - .5) * uView;
  vec4 paint = texture2D(uPaint, uv);
  float h = paint.a * uRelief;
  vec2 dx = vec2(uTexel, 0.), dy = dx.yx;
  vec2 slope = vec2(height(uv+dx)-height(uv-dx),height(uv+dy)-height(uv-dy)) / (2000. * uTexel);
  // Sub-texel oil grain is band-limited to the display pixel footprint.
  vec2 grainUv = uv * 1200.;
  float grain = noise(grainUv) + .28 * noise(grainUv * 2.7);
  float attenuation = 1. - smoothstep(.6, 1.7, length(fwidth(grainUv)));
  vec2 micro = vec2(dFdx(grain), dFdy(grain)) * .14 * uTexture * attenuation;
  vec3 normal = normalize(vec3(-slope - micro, 1.));
  float visibility = 1.;
  // Trace the actual neighbouring paint heights toward a finite, low studio light.
  float lightXY = max(length(uLight.xy), .01);
  vec2 direction = uLight.xy / lightXY;
  for (int i = 1; i <= 24; i++) {
    float distance = float(i) * (1.0 + float(i) * .105);
    float blocker = height(uv + direction * distance / 1000.);
    float ray = h + distance * uLight.z / lightXY + .17;
    visibility = min(visibility, 1. - smoothstep(-.22, .65 + distance * .018, blocker - ray));
  }
  float cavity = 0.;
  for (int i = 1; i <= 3; i++) {
    vec2 d = vec2(float(i) * 2.7 / 1000., 0.);
    float neighbours = height(uv+d) + height(uv-d) + height(uv+d.yx) + height(uv-d.yx);
    cavity += max(0., neighbours * .25 - h) / float(i);
  }
  float ao = exp(-cavity * .12);
  float lambert = max(0., dot(normal, uLight));
  vec3 halfway = normalize(uLight + vec3(0,0,1));
  float specular = pow(max(0., dot(normal, halfway)), mix(22., 95., uGloss));
  float light = (.34 * ao + .89 * lambert * mix(.15, 1., visibility));
  vec3 color = paint.rgb * light + vec3(1., .98, .92) * specular * (.035 + uGloss * .36) * visibility;
  // A restrained brush outline appears only while the pointer is over the canvas.
  float radius = uCursor.z;
  float edge = abs(length((uv-uCursor.xy)*1000.) - radius);
  float cursor = (1. - smoothstep(.4, 1.15, edge)) * step(.1, radius);
  color = mix(color, vec3(.22), cursor * .3);
  gl_FragColor = vec4(color, 1.);
  #include <colorspace_fragment>
}
`;
