import * as THREE from "three";

export type WindSettings = { period: number; direction: number; strength: number };
export const DEFAULT_WIND_SETTINGS: WindSettings = { period: 5, direction: 0, strength: .35 };

// A continuous deformation field keeps branch junctions, peeling bark and leaf
// attachment points together. The base stays fixed; compliance increases upwards.
const windShader = /* glsl */`
uniform float treeWindPhase;
uniform float treeWindStrength;
uniform float treeWindHeight;
uniform float treeWindBase;
uniform float treeWindYouth;
uniform vec3 treeWindDirection;
#ifdef TREE_LEAF_WIND
attribute vec4 windAttachment;
vec3 leafWindAxis() {
  return normalize(cross(vec3(0.0, 1.0, 0.0), treeWindDirection)
    + vec3(0.0, .35 * sin(windAttachment.w), 0.0));
}
float leafWindAngle() {
  return treeWindStrength * (.14 * sin(treeWindPhase * 7.0 + windAttachment.w)
    + .055 * sin(treeWindPhase * 11.0 + windAttachment.w * 1.7))
    * (.7 + .3 * sin(treeWindPhase));
}
vec3 leafWindRotate(vec3 value) {
  vec3 axis = leafWindAxis(); float angle = leafWindAngle();
  return value * cos(angle) + cross(axis, value) * sin(angle)
    + axis * dot(axis, value) * (1.0 - cos(angle));
}
#endif
void treeWindField(vec3 p, out float amount, out vec3 gradient) {
  float h = max(0.0, (p.y - treeWindBase - .12) / treeWindHeight);
  vec3 wave = vec3(.73, .32, .51);
  float phase = treeWindPhase * 2.0 + dot(p, wave);
  float gust = .62 + .32 * sin(treeWindPhase) + .06 * sin(treeWindPhase * 2.0 + .8);
  float pressure = gust + .14 * sin(phase);
  float amplitude = treeWindStrength * treeWindHeight * (.02 * h + .045 * h * h) * treeWindYouth;
  amount = amplitude * pressure;
  gradient = amplitude * .14 * cos(phase) * wave;
  if (h > 0.0) gradient.y += treeWindStrength * (.02 + .09 * h) * treeWindYouth * pressure;
}
vec3 treeWindPosition(vec3 p) {
  if (treeWindStrength == 0.0) return p;
  #ifdef TREE_LEAF_WIND
    p = windAttachment.xyz + leafWindRotate(p - windAttachment.xyz);
  #endif
  float amount; vec3 gradient; treeWindField(p, amount, gradient);
  return p + treeWindDirection * amount;
}
vec3 treeWindNormal(vec3 p, vec3 n) {
  if (treeWindStrength == 0.0) return n;
  #ifdef TREE_LEAF_WIND
    p = windAttachment.xyz + leafWindRotate(p - windAttachment.xyz);
    n = leafWindRotate(n);
  #endif
  float amount; vec3 gradient; treeWindField(p, amount, gradient);
  // Exact inverse-transpose of I + direction * gradient^T (rank-one bending).
  return n - gradient * dot(treeWindDirection, n) / max(.25, 1.0 + dot(gradient, treeWindDirection));
}
`;

export function createTreeWind(group: THREE.Group, height: number, base: number) {
  const uniforms = {
    treeWindPhase: { value: 0 }, treeWindStrength: { value: 0 },
    treeWindHeight: { value: height }, treeWindBase: { value: base },
    treeWindYouth: { value: 1 }, treeWindDirection: { value: new THREE.Vector3(1, 0, 0) },
  };
  const patched = new Set<THREE.Material>();
  const patch = (material: THREE.Material, leaf: boolean) => {
    if (patched.has(material)) return;
    patched.add(material);
    const original = material.onBeforeCompile, cacheKey = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      original.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `${leaf ? "#define TREE_LEAF_WIND\n" : ""}${windShader}\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>",
        THREE.ShaderChunk.project_vertex.replace("mvPosition = modelViewMatrix * mvPosition;",
          "mvPosition.xyz = treeWindPosition(mvPosition.xyz);\nmvPosition = modelViewMatrix * mvPosition;"));
      shader.vertexShader = shader.vertexShader.replace("#include <worldpos_vertex>",
        THREE.ShaderChunk.worldpos_vertex.replace("worldPosition = modelMatrix * worldPosition;",
          "worldPosition.xyz = treeWindPosition(worldPosition.xyz);\nworldPosition = modelMatrix * worldPosition;"));
      shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>",
        THREE.ShaderChunk.defaultnormal_vertex.replace("transformedNormal = normalMatrix * transformedNormal;", `
          vec3 windRestPosition = position;
          #ifdef USE_INSTANCING
            windRestPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
          #endif
          transformedNormal = normalMatrix * treeWindNormal(windRestPosition, transformedNormal);
        `));
    };
    material.customProgramCacheKey = () => `${cacheKey}:tree-wind-v1:${leaf}`;
    material.needsUpdate = true;
  };
  const woodDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patch(woodDepth, false); patch(leafDepth, true);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const leaf = object.geometry.hasAttribute("windAttachment");
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => patch(material, leaf));
    object.customDepthMaterial = leaf ? leafDepth : woodDepth;
    // The GPU moves vertices outside their static CPU bounds.
    object.frustumCulled = false;
  });
  const inverseRotation = new THREE.Quaternion();
  return {
    update: (phase: number, settings: WindSettings, growth: number) => {
      const wasMoving = uniforms.treeWindStrength.value > 0;
      uniforms.treeWindPhase.value = phase;
      uniforms.treeWindStrength.value = THREE.MathUtils.clamp(settings.strength, 0, 1) * 1.5;
      uniforms.treeWindYouth.value = 1 + 2.5 * (1 - THREE.MathUtils.smoothstep(growth, 0, .4));
      // Direction is fixed in the scene even while the user rotates the specimen.
      const angle = THREE.MathUtils.degToRad(settings.direction);
      group.getWorldQuaternion(inverseRotation).invert();
      uniforms.treeWindDirection.value.set(Math.cos(angle), 0, -Math.sin(angle)).applyQuaternion(inverseRotation);
      return wasMoving || uniforms.treeWindStrength.value > 0;
    },
    dispose: () => { woodDepth.dispose(); leafDepth.dispose(); },
  };
}
