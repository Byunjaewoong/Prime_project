import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

/**
 * Live browser approximation of SplashSurf's particle-to-surface pipeline.
 * SplashSurf's Rust library is designed for offline/host-side reconstruction;
 * this uses a compact scalar field and marching cubes for interactive viewing.
 */
export class ParticleSurface {
  readonly mesh: MarchingCubes;
  readonly resolution: number;
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly cubeWidth = 4.5;
  private readonly halfWidth = this.cubeWidth / 2;

  constructor(resolution: number) {
    this.resolution = resolution;
    this.material = new THREE.MeshPhysicalMaterial({
      color: "#3eacd8",
      roughness: 0.22,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.11,
      side: THREE.FrontSide,
    });
    this.mesh = new MarchingCubes(resolution, this.material, false, false, 30000);
    this.mesh.position.set(0, this.halfWidth, 0);
    this.mesh.scale.setScalar(this.halfWidth);
    this.mesh.isolation = 80;
    this.mesh.frustumCulled = false;
  }

  update(positions: Float32Array, count: number, thickness: number) {
    this.mesh.reset();
    const strength = 0.035 * thickness * thickness;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const x = (positions[k] + this.halfWidth) / this.cubeWidth;
      const y = positions[k + 1] / this.cubeWidth;
      const z = (positions[k + 2] + this.halfWidth) / this.cubeWidth;
      this.mesh.addBall(x, y, z, strength, 12);
    }
    this.mesh.update();
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
