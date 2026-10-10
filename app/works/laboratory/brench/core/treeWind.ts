import * as THREE from "three";
import { DEFAULT_BRANCH_SETTINGS } from "./branchSkeleton";

export type WindSettings = { period: number; direction: number; strength: number };
export const DEFAULT_WIND_SETTINGS: WindSettings = { period: 5, direction: 0, strength: .35 };

export function windFlexibility(thickness: number) {
  // Beam bending drops steeply as diameter increases; slider ends span 10x.
  return THREE.MathUtils.clamp(
    Math.pow(DEFAULT_BRANCH_SETTINGS.thickness / Math.max(.05, thickness), 2.85), .22, 2.2);
}

// One elastic cantilever field moves wood and leaf attachments together. Its
// slope is zero at the fixed base and increases smoothly toward the crown.
const windShader = /* glsl */`
uniform float treeWindHeight;
uniform float treeWindBase;
uniform vec3 treeWindDeflection;
#ifdef TREE_LEAF_WIND
attribute vec4 windAttachment;
#endif
vec3 treeWindField(vec3 p, out vec3 slope) {
  float h = max(0.0, (p.y - treeWindBase - .12) / treeWindHeight);
  slope = treeWindDeflection * (3.0 * h - 1.5 * h * h) / treeWindHeight;
  return treeWindDeflection * (.5 * h * h * (3.0 - h));
}
#ifdef TREE_LEAF_WIND
vec3 treeWindRotate(vec3 value, vec3 slope) {
  float tilt = atan(length(slope));
  if (tilt < .00001) return value;
  vec3 axis = normalize(cross(vec3(0.0, 1.0, 0.0), slope));
  return value * cos(tilt) + cross(axis, value) * sin(tilt)
    + axis * dot(axis, value) * (1.0 - cos(tilt));
}
#endif
vec3 treeWindPosition(vec3 p) {
  #ifdef TREE_LEAF_WIND
    // Translate and rigidly tilt the entire leaf with its branch attachment.
    vec3 slope;
    vec3 shift = treeWindField(windAttachment.xyz, slope);
    return windAttachment.xyz + shift + treeWindRotate(p - windAttachment.xyz, slope);
  #else
    vec3 slope;
    return p + treeWindField(p, slope);
  #endif
}
vec3 treeWindNormal(vec3 p, vec3 n) {
  #ifdef TREE_LEAF_WIND
    vec3 leafSlope;
    treeWindField(windAttachment.xyz, leafSlope);
    return treeWindRotate(n, leafSlope);
  #else
    vec3 slope;
    treeWindField(p, slope);
    return n - vec3(0.0, dot(slope, n), 0.0);
  #endif
}
`;

export function createTreeWind(group: THREE.Group, height: number, base: number, thickness: number) {
  const flexibility = windFlexibility(thickness);
  const stiffness = 12 / Math.sqrt(flexibility);
  const damping = 1.6 * Math.sqrt(stiffness);
  const uniforms = {
    treeWindHeight: { value: height }, treeWindBase: { value: base },
    treeWindDeflection: { value: new THREE.Vector3() },
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
    material.customProgramCacheKey = () => `${cacheKey}:tree-wind-v2:${leaf}`;
    material.needsUpdate = true;
  };
  const woodDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  patch(woodDepth, false); patch(leafDepth, true);
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.parent?.name === "seedbed") return;
    const leaf = object.geometry.hasAttribute("windAttachment");
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => patch(material, leaf));
    object.customDepthMaterial = leaf ? leafDepth : woodDepth;
    // The GPU moves vertices outside their static CPU bounds.
    object.frustumCulled = false;
  });
  const inverseRotation = new THREE.Quaternion();
  const deflection = new THREE.Vector3(), velocity = new THREE.Vector3();
  const target = new THREE.Vector3(), previous = new THREE.Vector3(), acceleration = new THREE.Vector3();
  return {
    update: (phase: number, settings: WindSettings, growth: number, elapsed: number) => {
      previous.copy(deflection);
      const angle = THREE.MathUtils.degToRad(settings.direction);
      const gust = .7 + .3 * Math.sin(phase);
      const youth = 1.25 - .25 * THREE.MathUtils.smoothstep(growth, .1, .75);
      target.set(Math.cos(angle), 0, -Math.sin(angle))
        .multiplyScalar(height * .16 * flexibility * THREE.MathUtils.clamp(settings.strength, 0, 1) * gust * youth);
      const step = THREE.MathUtils.clamp(elapsed, 0, .05);
      velocity.addScaledVector(acceleration.copy(target).sub(deflection), stiffness * step);
      velocity.multiplyScalar(Math.exp(-damping * step));
      deflection.addScaledVector(velocity, step);
      // Keep the wind in world space while the specimen is rotated by dragging.
      group.getWorldQuaternion(inverseRotation).invert();
      uniforms.treeWindDeflection.value.copy(deflection).applyQuaternion(inverseRotation);
      return deflection.distanceToSquared(previous) > 1e-9 || velocity.lengthSq() > 1e-8;
    },
    dispose: () => { woodDepth.dispose(); leafDepth.dispose(); },
  };
}
