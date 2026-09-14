import * as THREE from "three";

/** A thin, slowly drifting layer of ground mist, rendered in one draw call. */
export function createSmog() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, tint: { value: new THREE.Color(0xe6ece5) } },
    vertexShader: `
      varying vec2 groundPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        groundPosition = world.xz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 tint;
      varying vec2 groundPosition;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = groundPosition * vec2(0.075,0.12) + vec2(time*0.014,time*0.006);
        float cloud = noise(p)*0.7 + noise(p*2.13+17.0)*0.3;
        float mist = smoothstep(0.28,0.8,cloud);
        float edge = 1.0-smoothstep(48.0,59.0,max(abs(groundPosition.x),abs(groundPosition.y)));
        gl_FragColor = vec4(tint, mist * edge * 0.085);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.65;
  mesh.renderOrder = 2;
  return mesh;
}
