import * as THREE from "three";
import { FILM_RESOLUTION, FILM_SIZE, type FilmState } from "./PaintFilm";

/** Sharp deposited sheets are meshed directly, without a spherical SPH blur. */
export class FilmSurface {
  readonly material: THREE.MeshPhysicalMaterial;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private flow: THREE.DataTexture;
  private heights: Float32Array = new Float32Array(FILM_RESOLUTION ** 2);
  constructor() {
    const n = FILM_RESOLUTION, geometry = new THREE.PlaneGeometry(FILM_SIZE, FILM_SIZE, n - 1, n - 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * n * 3), 3));
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-3, 0, -3), new THREE.Vector3(3, 2, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    this.flow = new THREE.DataTexture(new Uint8Array(n * n * 4), n, n, THREE.RGBAFormat);
    this.flow.minFilter = this.flow.magFilter = THREE.LinearFilter; this.flow.needsUpdate = true;
    this.material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .76, metalness: 0, clearcoat: .06, clearcoatRoughness: .65 });
    this.material.onBeforeCompile = shader => {
      shader.uniforms.paintFlow = { value: this.flow };
      shader.vertexShader = "varying vec2 vPaintUv;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPaintUv = position.xz / 6.0 + 0.5;");
      shader.fragmentShader = `uniform sampler2D paintFlow;
varying vec2 vPaintUv;
float paintHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float paintNoise(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(paintHash(i),paintHash(i+vec2(1,0)),f.x),mix(paintHash(i+vec2(0,1)),paintHash(i+vec2(1,1)),f.x),f.y); }
` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
vec4 flow = texture2D(paintFlow, vPaintUv);
vec2 direction = normalize(flow.rg * 2.0 - 1.0 + vec2(0.0001));
vec2 p = (vPaintUv - 0.5) * 6.0;
float along = dot(p, direction), across = dot(p, vec2(direction.y, -direction.x));
// Long, broken striations and sparse dragged pinholes, with several physical scales.
float wander = paintNoise(vec2(across*22.0, along*1.3));
float footprint = max(length(dFdx(p)),length(dFdy(p)));
float fineVisibility = 1.0-smoothstep(0.001,0.012,footprint);
float lines = paintNoise(vec2(across*125.0 + wander*3.0, along*2.0));
float scratches = pow(paintNoise(vec2(across*78.0 + wander, along*0.8)), 10.0);
float pores = pow(paintNoise(vec2(across*200.0, along*100.0)), 20.0);
float draggedPores = pow(paintNoise(vec2(across*55.0+wander*0.5, along*5.0)), 8.0);
float detail = (((lines-0.5)*0.0007 - scratches*0.003 - pores*0.003)*fineVisibility - draggedPores*0.008) * (0.4+flow.b) * flow.a;
vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
vec3 r1 = cross(q1, normal), r2 = cross(normal, q0);
float det = dot(q0,r1);
normal = normalize(abs(det)*normal - sign(det)*(dFdx(detail)*r1+dFdy(detail)*r2));
`);
    };
    this.mesh = new THREE.Mesh(geometry, this.material); this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }
  sample(x: number, z: number) {
    const n = FILM_RESOLUTION, ix = Math.max(0, Math.min(n - 1, Math.round((x / 6 + .5) * (n - 1))));
    const iz = Math.max(0, Math.min(n - 1, Math.round((z / 6 + .5) * (n - 1)))); return this.heights[iz * n + ix];
  }
  update(state: FilmState) {
    this.heights = state.height; this.mesh.visible = state.volume > 1e-9;
    const n = FILM_RESOLUTION, position = this.mesh.geometry.getAttribute("position"), color = this.mesh.geometry.getAttribute("color");
    for (let i = 0; i < state.height.length; i++) {
      const h = state.height[i]; position.setY(i, h);
      const neighbor = (state.height[Math.max(0, i - 1)] + state.height[Math.min(n * n - 1, i + 1)] + state.height[Math.max(0, i - n)] + state.height[Math.min(n * n - 1, i + n)]) * .25;
      const occlusion = 1 - Math.min(.18, Math.max(0, neighbor - h) * 7);
      const coverage = THREE.MathUtils.smoothstep(h, .0001, .003);
      color.setXYZ(i, THREE.MathUtils.lerp(.896, state.color[i * 3], coverage) * occlusion,
        THREE.MathUtils.lerp(.896, state.color[i * 3 + 1], coverage) * occlusion,
        THREE.MathUtils.lerp(.863, state.color[i * 3 + 2], coverage) * occlusion);
    }
    position.needsUpdate = color.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
    (this.flow.image.data as Uint8Array).set(state.grain); this.flow.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); this.flow.dispose(); }
}
