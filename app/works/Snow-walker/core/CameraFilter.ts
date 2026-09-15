import * as THREE from "three";

/** Vortex_GPU's film treatment applied to the rendered camera image. */
export function createCameraFilter() {
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      image: { value: null }, time: { value: 0 }, strength: { value: 0 },
      useHaze: { value: 0 }, useGrain: { value: 0 }, useVignette: { value: 0 }, useTone: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform sampler2D image;
      uniform float time;
      uniform float strength;
      uniform float useHaze;
      uniform float useGrain;
      uniform float useVignette;
      uniform float useTone;
      varying vec2 vUv;
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 original = linearToOutputTexel(texture2D(image, vUv)).rgb;
        vec3 c = original;
        float smoke = 0.012 + 0.008 * sin(vUv.y * 6.0 + time * 0.3);
        c += smoke * vec3(0.7, 0.75, 0.8) * useHaze;
        float grain = hash(vUv * 1000.0 + fract(time * 7.13)) - 0.5;
        c += grain * 0.06 * useGrain;
        vec2 vig = vUv * (1.0 - vUv);
        float v = pow(vig.x * vig.y * 16.0, 0.3);
        c *= mix(1.0, mix(0.45, 1.0, v), useVignette);
        c = clamp(c, 0.0, 1.0);
        if (useTone > 0.5) {
          c = c * c * (3.0 - 2.0 * c);
          c = mix(c, pow(c, vec3(0.85)), 0.5);
          c = max(c, vec3(0.015, 0.013, 0.018));
        }
        gl_FragColor = vec4(mix(original, c, strength), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const target = new THREE.WebGLRenderTarget(1, 1);
  material.uniforms.image.value = target.texture;
  return { scene, material, target, size: new THREE.Vector2() };
}

export type CameraFilterKey = "haze" | "grain" | "vignette" | "tone";
export type CameraFilters = Record<CameraFilterKey, boolean>;
