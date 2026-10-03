import * as THREE from "three";

/** A camera-space silhouette that follows the direction of each step. */
export class PassingSilhouette {
  private readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      progress: { value: 0 },
      direction: { value: new THREE.Vector2(1, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float progress;
      uniform vec2 direction;

      void main() {
        vec2 screen = vUv * 2.0 - 1.0;
        float along = dot(screen, direction);
        float across = dot(screen, vec2(-direction.y, direction.x));
        // The leading edge belongs to the passing leg; the trailing edge
        // follows later so the frame briefly goes fully dark before clearing.
        float lead = mix(-1.45, 1.45, smoothstep(0.45, 0.69, progress));
        float tail = mix(-1.45, 1.45, smoothstep(0.76, 0.97, progress));
        float bend = 0.12 * across * across + 0.035 * sin(across * 5.0 + progress * 3.0);
        float front = 1.0 - smoothstep(lead + bend - 0.025, lead + bend + 0.025, along);
        float back = smoothstep(tail + bend - 0.025, tail + bend + 0.025, along);
        float alpha = front * back;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `,
  });
  private readonly mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.mesh.position.z = -1;
    this.mesh.renderOrder = 1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  begin(direction: THREE.Vector2) {
    this.material.uniforms.direction.value.copy(direction);
    this.material.uniforms.progress.value = 0;
    this.mesh.visible = true;
  }

  update(progress: number) { this.material.uniforms.progress.value = progress; }
  end() { this.mesh.visible = false; }

  resize() {
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.mesh.scale.set(halfHeight * this.camera.aspect, halfHeight, 1);
  }
}
