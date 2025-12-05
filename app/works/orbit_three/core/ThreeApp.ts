// works/orbit_three/core/ThreeApp.ts
import * as THREE from "three";

export default function initThreeApp(container: HTMLDivElement) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  // Camera
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 1.5, 5);

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Planet (중심 행성)
  const planetGeo = new THREE.SphereGeometry(1, 48, 48);
  const planetMat = new THREE.MeshStandardMaterial({
    color: 0x2563eb,
    roughness: 0.45,
    metalness: 0.1,
  });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  scene.add(planet);

  // Satellite (위성)
  const satelliteGeo = new THREE.SphereGeometry(0.2, 32, 32);
  const satelliteMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.7,
  });
  const satellite = new THREE.Mesh(satelliteGeo, satelliteMat);

  const satelliteGroup = new THREE.Group();
  satellite.position.set(2, 0.3, 0); // 행성 기준으로 살짝 위쪽
  satelliteGroup.add(satellite);
  scene.add(satelliteGroup);

  // Light (태양 느낌 포인트 라이트)
  const sunLight = new THREE.PointLight(0xffffff, 2.2, 20);
  sunLight.position.set(4, 3, 2);
  scene.add(sunLight);

  // 약간의 환경광
  const ambient = new THREE.AmbientLight(0x475569, 0.5);
  scene.add(ambient);

  // 별 배경 (간단하게 Points로)
  const starsGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 40 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  starsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starsMat = new THREE.PointsMaterial({
    size: 0.15,
    color: 0xffffff,
  });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // Orbit line (위성 궤도 링)
  const orbitGeo = new THREE.RingGeometry(2, 2.02, 64);
  const orbitMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    side: THREE.DoubleSide,
  });
  const orbit = new THREE.Mesh(orbitGeo, orbitMat);
  orbit.rotation.x = Math.PI / 2;
  scene.add(orbit);

  // Animation
  let frameId: number;
  const clock = new THREE.Clock();

  const animate = () => {
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // 행성 회전
    planet.rotation.y += 0.003;

    // 위성 궤도 회전 (Y, Z 축 포함해서 3D 느낌)
    satelliteGroup.rotation.y = t * 0.5; // Y축 회전
    satelliteGroup.rotation.x = Math.sin(t * 0.3) * 0.2; // 살짝 기울기

    // 카메라도 살짝 공전하는 느낌
    camera.position.x = Math.sin(t * 0.1) * 5;
    camera.position.z = Math.cos(t * 0.1) * 5;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  animate();

  // Resize
  const handleResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  window.addEventListener("resize", handleResize);

  // Cleanup 함수
  const dispose = () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", handleResize);

    renderer.dispose();
    planetGeo.dispose();
    planetMat.dispose();
    satelliteGeo.dispose();
    satelliteMat.dispose();
    starsGeo.dispose();
    starsMat.dispose();
    orbitGeo.dispose();
    orbitMat.dispose();

    scene.clear();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };

  return { dispose };
}
