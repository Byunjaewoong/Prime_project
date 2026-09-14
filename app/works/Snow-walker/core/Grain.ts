import * as THREE from "three";

/** Screen-space grain over the finished camera image; no offscreen buffers. */
export function createGrain() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { frame: { value: 0 }, strength: { value: 0 } },
    vertexShader: `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      uniform float frame;
      uniform float strength;
      void main() {
        vec2 pixel = floor(gl_FragCoord.xy / 1.25);
        float noise = fract(sin(dot(pixel + frame * vec2(17.13, 9.71), vec2(12.9898,78.233))) * 43758.5453);
        float signedNoise = noise * 2.0 - 1.0;
        gl_FragColor = vec4(vec3(step(0.0, signedNoise)), abs(signedNoise) * strength);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, material };
}
