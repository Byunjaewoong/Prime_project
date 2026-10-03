import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { SHOE_LENGTH } from "./StepModel";

const materials = {
  "black-line": { color: 0x111318, roughness: 0.72 },
  Material: { color: 0x363a40, roughness: 0.78 },
  white: { color: 0xb8b8b2, roughness: 0.9 },
  insole: { color: 0x282b31, roughness: 0.87 },
} as const;

/** The supplied OBJ faces +Z, but has a Blender-sized origin and no portable texture. */
export async function loadShoeAsset(): Promise<THREE.Group> {
  const shoe = await new OBJLoader().loadAsync("/shoes.obj");
  const sourceMaterials = new Set<THREE.Material>();
  const assigned = new Map<string, THREE.MeshStandardMaterial>();
  shoe.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const convert = (source: THREE.Material) => {
      sourceMaterials.add(source);
      const name = source.name as keyof typeof materials;
      const style = materials[name] ?? materials["black-line"];
      const key = source.name || "default";
      let material = assigned.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ ...style, side: THREE.DoubleSide });
        assigned.set(key, material);
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  sourceMaterials.forEach(material => material.dispose());

  const bounds = new THREE.Box3().setFromObject(shoe);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = SHOE_LENGTH / size.z;
  // Keep the sole on the floor and the toe along local +Z, matching footprints.
  shoe.scale.setScalar(scale);
  shoe.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale + 0.017);
  return shoe;
}
