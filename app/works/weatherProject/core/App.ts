// app/works/weatherProject/core/App.ts

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class App {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private animationId: number | null = null;
  private clock: THREE.Clock;

  private sun: THREE.Mesh | null = null;
  private mirrorSun: THREE.Mesh | null = null;
  private sunLight: THREE.PointLight | null = null;

  private composer: EffectComposer | null = null;

  private people: THREE.Group[] = [];
  private mixers: THREE.AnimationMixer[] = [];

  constructor(canvas: HTMLCanvasElement) {
  this.canvas = canvas;
  this.clock = new THREE.Clock();

  const parent = this.canvas.parentElement;
  const width = parent ? parent.clientWidth : window.innerWidth;
  const height = parent ? parent.clientHeight : window.innerHeight;

  this.renderer = new THREE.WebGLRenderer({
    canvas: this.canvas,
    antialias: false,
  });
  this.renderer.setSize(width, height);
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0xff6b35);
  this.scene.fog = new THREE.FogExp2(0xff7744, 0.028);

  // 카메라 - 더 높은 위치에서
  this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
  this.camera.position.set(0, 8, 32); // 높이 증가
  this.camera.lookAt(0, 15, -15);

  this.init();
  this.setupPostProcessing();
  this.animate();

  window.addEventListener('resize', this.resize.bind(this));
  }

  private init() {
    this.addLights();
    this.addArchitecture();
    this.addFloor();
    this.addSun();
    this.addPeople();
  }

  private addLights() {
  // 밝은 환경광
  const ambientLight = new THREE.AmbientLight(0xffaa77, 0.6);
  this.scene.add(ambientLight);
  }

  private addArchitecture() {
  const wallGeometry = new THREE.BoxGeometry(2, 60, 150);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc5522,
    roughness: 0.85,
    metalness: 0.1,
    emissive: 0xff7744,
    emissiveIntensity: 0.1,
  });

  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.set(-18, 30, -20);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  this.scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeometry, wallMaterial.clone());
  rightWall.position.set(18, 30, -20);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  this.scene.add(rightWall);

  // 창문들 - 훨씬 더 어둡고 미묘하게
  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < 30; j++) {
      const windowGeo = new THREE.PlaneGeometry(1.0, 1.3); // 크기 줄임
      const brightness = 0.01 + Math.random() * 0.02; // 0.15 -> 0.01 (훨씬 어둡게)
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x3d2218, // 거의 검은색에 가까운 어두운 갈색
        roughness: 0.95,
        emissive: 0x5d3a2a, // 매우 어두운 발광
        emissiveIntensity: brightness,
      });
      const window1 = new THREE.Mesh(windowGeo, windowMat);
      window1.position.set(-17.5, 1 + i * 4, -80 + j * 5);
      window1.rotation.y = Math.PI / 2;
      this.scene.add(window1);
    }
  }

  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < 30; j++) {
      const windowGeo = new THREE.PlaneGeometry(1.0, 1.3);
      const brightness = 0.01 + Math.random() * 0.02;
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x3d2218,
        roughness: 0.95,
        emissive: 0x5d3a2a,
        emissiveIntensity: brightness,
      });
      const window2 = new THREE.Mesh(windowGeo, windowMat);
      window2.position.set(17.5, 1 + i * 4, -80 + j * 5);
      window2.rotation.y = -Math.PI / 2;
      this.scene.add(window2);
    }
  }

  const ceilingGeo = new THREE.PlaneGeometry(40, 150);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xbb6644,
    roughness: 0.5,
    metalness: 0.5,
  });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.position.set(0, 60, -20);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  this.scene.add(ceiling);
  }
  
  // addFloor 수정 (밝게)
private addFloor() {
  const floorGeo = new THREE.PlaneGeometry(40, 150); // 55 -> 40
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xd9a88c, // 훨씬 밝은 색
    roughness: 0.8, // 0.4 -> 0.8 (덜 반사)
    metalness: 0.1, // 0.6 -> 0.1
    emissive: 0x000000, // 발광 제거
    emissiveIntensity: 0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0, -20);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true; // 그림자 받기
  this.scene.add(floor);
  }

  private addSun() {
  const sunPosition = new THREE.Vector3(0, 25, -25); // 13 -> 25 (더 높게)

  const sunGeometry = new THREE.SphereGeometry(9, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff66,
    side: THREE.DoubleSide,
  });

  this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
  this.sun.position.copy(sunPosition);
  this.scene.add(this.sun);

  const mirrorGeometry = new THREE.SphereGeometry(9, 64, 64, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const mirrorMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff66,
    side: THREE.DoubleSide,
  });

  this.mirrorSun = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
  this.mirrorSun.position.copy(sunPosition);
  this.scene.add(this.mirrorSun);

  // Glow
  const glowGeometry = new THREE.SphereGeometry(11, 64, 64);
  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      c: { value: 0.45 },
      p: { value: 4.0 },
      glowColor: { value: new THREE.Color(0xffaa44) },
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float c;
      uniform float p;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(c - dot(vNormal, vec3(0.0, 0.0, 1.0)), p);
        gl_FragColor = vec4(glowColor, 1.0) * intensity * 1.2;
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });

  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.position.copy(sunPosition);
  this.scene.add(glowMesh);

  // 태양 광원 - 더 강력하게 (그림자 진하게)
  this.sunLight = new THREE.PointLight(0xffcc77, 4.0, 120); // 2.5 -> 4.0, 90 -> 120
  this.sunLight.position.copy(sunPosition);
  this.sunLight.castShadow = true;
  this.sunLight.shadow.mapSize.width = 4096; // 2048 -> 4096 (더 선명한 그림자)
  this.sunLight.shadow.mapSize.height = 4096;
  this.sunLight.shadow.bias = -0.001; // 그림자 품질 개선
  this.scene.add(this.sunLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffaa66, 0xaa5533, 0.5);
  this.scene.add(hemisphereLight);
  }

  private addPeople() {
  const fbxLoader = new FBXLoader();
  
  // 모든 FBX 모델 경로
  const models = [
    '/people/FemaleLayingPose.fbx',
    '/people/Idle.fbx',
    '/people/Laying_Sleeping.fbx',
    '/people/MaleLayingPose.fbx',
    '/people/MaleLayingPose_1.fbx',
    '/people/Pacing_And_Talking_On_A_Phone.fbx',
    '/people/Smoking.fbx',
    '/people/Talking_On_Phone.fbx'
  ];

  const sunPosition = new THREE.Vector3(0, 25, -25);

  // 1. 랜덤 배치 (40명)
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() - 0.5) * 35;
    const z = -15 + Math.random() * 20;
    const randomModel = models[Math.floor(Math.random() * models.length)];
    
    this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  }

  // 2. 줄 서 있는 사람들 (20명) - 3줄
  // 첫 번째 줄 (중앙 앞쪽)
  for (let i = 0; i < 3; i++) {
    const x = -10 + i * 1; // 3미터 간격
    const z = -15;
    const randomModel = models[Math.floor(Math.random() * models.length)];
    this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  }

  // 두 번째 줄 (왼쪽)
  for (let i = 0; i < 2; i++) {
    const x = -15 + i * 0.5;
    const z = -20 + i * 1;
    const randomModel = models[Math.floor(Math.random() * models.length)];
    this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  }

  // 세 번째 줄 (오른쪽)
  for (let i = 0; i < 3; i++) {
    const x = 12;
    const z = -5 + i * 0.5;
    const randomModel = models[Math.floor(Math.random() * models.length)];
    this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  }
  }


  private loadFBXPerson(
  loader: FBXLoader, 
  modelPath: string, 
  x: number, 
  z: number, 
  sunPosition: THREE.Vector3
) {
  loader.load(
    modelPath,
    (fbx) => {
      // 검은 실루엣으로 변경
      fbx.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 1.0,
            metalness: 0,
          });
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      // 크기 조정 (FBX는 보통 크기가 다를 수 있음)
      let scale = 0.01; // FBX는 보통 더 큰 스케일
      
      // 누워있는 포즈는 좀 더 작게
      if (modelPath.includes('Laying')) {
        scale *= 0.8;
      }

      fbx.scale.set(scale, scale, scale);
      fbx.position.set(x, 0, z);

      // 태양을 향해 회전
      const personPosition = new THREE.Vector3(x, 0, z);
      const direction = new THREE.Vector3().subVectors(sunPosition, personPosition);
      direction.y = 0;
      
      const angle = Math.atan2(direction.x, direction.z);
      fbx.rotation.y = angle;

      this.scene.add(fbx);
      this.people.push(fbx);

      // 애니메이션이 있으면 재생
      if (fbx.animations && fbx.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(fbx);
        const action = mixer.clipAction(fbx.animations[0]);
        action.timeScale = 0.3 + Math.random() * 0.4; // 느리게
        action.play();
        this.mixers.push(mixer);
      }
    },
    (progress) => {
      // 로딩 진행상황 (필요시)
      // console.log((progress.loaded / progress.total) * 100 + '% loaded');
    },
    (error) => {
      console.error(`Error loading ${modelPath}:`, error);
    }
  );
  }
// setupPostProcessing 메서드에서 filmPass 부분만 수정

  private setupPostProcessing() {
  this.composer = new EffectComposer(this.renderer);
  
  const renderPass = new RenderPass(this.scene, this.camera);
  this.composer.addPass(renderPass);

  const VintageShader = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float time;
      varying vec2 vUv;

      // 노이즈 함수
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
      }

      void main() {
        vec2 uv = vUv;
        
        // CRT 왜곡
        vec2 cc = uv - 0.5;
        float dist = dot(cc, cc) * 0.12;
        uv = (uv - 0.5) * (1.0 + dist) + 0.5;
        
        vec4 color = texture2D(tDiffuse, uv);
        
        // 채도 조정
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, 0.95);
        
        // 따뜻한 톤
        color.rgb *= vec3(1.02, 0.98, 0.92);
        
        // 비네팅
        float vignette = smoothstep(0.85, 0.25, length(uv - 0.5));
        color.rgb *= vignette;
        
        // 스캔라인
        float scanline = sin(uv.y * 550.0 + time * 6.0) * 0.025;
        color.rgb -= scanline;
        
        // 필름 그레인 (노이즈)
        float grain = random(uv * time) * 0.08;
        color.rgb += grain;
        
        // 색수차
        float offset = 0.0012;
        float r = texture2D(tDiffuse, uv + vec2(offset, 0.0)).r;
        float b = texture2D(tDiffuse, uv - vec2(offset, 0.0)).b;
        color.r = mix(color.r, r, 0.25);
        color.b = mix(color.b, b, 0.25);
        
        gl_FragColor = color;
      }
    `,
  };

  const vintagePass = new ShaderPass(VintageShader);
  vintagePass.renderToScreen = true;
  this.composer.addPass(vintagePass);
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    this.mixers.forEach(mixer => mixer.update(delta));

    if (this.composer) {
      const passes = this.composer.passes;
      if (passes.length > 1) {
        const vintagePass = passes[1] as ShaderPass;
        if (vintagePass.uniforms) {
          vintagePass.uniforms.time.value = time;
        }
      }
    }

    // 태양 펄스 (더 느리게)
    if (this.sun && this.mirrorSun) {
      const scale = 1 + Math.sin(time * 0.3) * 0.02;
      this.sun.scale.set(scale, scale, scale);
      this.mirrorSun.scale.set(scale, scale, scale);
    }

    if (this.composer) {
      this.composer.render();
    }
  };

  public onMouseMove(x: number, y: number) {
  this.camera.position.x = (x - 0.5) * 4;
  this.camera.position.y = 8 + (y - 0.5) * 6;
  this.camera.lookAt(0, 15, -15);
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      
      if (this.composer) {
        this.composer.setSize(width, height);
      }
    }
  }

  public destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.resize.bind(this));
    this.renderer.dispose();
  }
}