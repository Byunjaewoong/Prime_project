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
  private filterPass: ShaderPass | null = null;
  private currentFilterIndex = 0;

  private people: THREE.Group[] = [];
  private mixers: THREE.AnimationMixer[] = [];
  private shadowGroups: THREE.Group[] = [];
  private readonly sunPos = new THREE.Vector3(0, 25, -25);

  private loadedCount = 0;
  private totalToLoad = 0;
  private onReadyCallback: (() => void) | null = null;

  // ── 그림자 유형 분류 ──────────────────────────────────────
  // 서있는 포즈: 인체 실루엣 그림자 (다리+몸통+머리)
  private static readonly STANDING_MODELS: ReadonlySet<string> = new Set([
    'Idle.fbx',
    'Smoking.fbx',
    'Talking_On_Phone.fbx',
    // 새 서있는 모델 추가 시 여기에
  ]);
  // 누워있는 포즈: 발밑 타원 그림자
  // (위 집합에 없으면 자동으로 누운 포즈 처리)
  // ────────────────────────────────────────────────────────

  constructor(canvas: HTMLCanvasElement, onReady?: () => void) {
  this.canvas = canvas;
  this.onReadyCallback = onReady ?? null;
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
    '/people/Smoking.fbx',
    '/people/Talking_On_Phone.fbx'

    // '/people/Pacing_And_Talking_On_A_Phone.fbx',
  ];

  const sunPosition = new THREE.Vector3(0, 25, -25);

  // 1. 랜덤 배치 (20명)
  const count = 20;
  this.totalToLoad = count;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 35;
    const z = -15 + Math.random() * 20;
    const randomModel = models[Math.floor(Math.random() * models.length)];

    this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  }

  // // 2. 줄 서 있는 사람들 (20명) - 3줄
  // // 첫 번째 줄 (중앙 앞쪽)
  // for (let i = 0; i < 3; i++) {
  //   const x = -10 + i * 1; // 3미터 간격
  //   const z = -15;
  //   const randomModel = models[Math.floor(Math.random() * models.length)];
  //   this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  // }

  // // 두 번째 줄 (왼쪽)
  // for (let i = 0; i < 2; i++) {
  //   const x = -15 + i * 0.5;
  //   const z = -20 + i * 1;
  //   const randomModel = models[Math.floor(Math.random() * models.length)];
  //   this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  // }

  // // 세 번째 줄 (오른쪽)
  // for (let i = 0; i < 3; i++) {
  //   const x = 12;
  //   const z = -5 + i * 0.5;
  //   const randomModel = models[Math.floor(Math.random() * models.length)];
  //   this.loadFBXPerson(fbxLoader, randomModel, x, z, sunPosition);
  // }
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
      const yOffset = modelPath.includes('Laying_Sleeping') ? -0.8 : 0;
      fbx.position.set(x, yOffset, z);

      // 태양을 향해 회전
      const personPosition = new THREE.Vector3(x, 0, z);
      const direction = new THREE.Vector3().subVectors(sunPosition, personPosition);
      direction.y = 0;

      const angle = Math.atan2(direction.x, direction.z);
      fbx.rotation.y = angle;

      // FBX 유형에 따라 그림자 방식 분기
      const filename = modelPath.split('/').pop() ?? '';
      if (App.STANDING_MODELS.has(filename)) {
        this.createPersonShadow(fbx, x, z);   // 인체 실루엣 그림자
      } else {
        this.createLayingShadow(fbx);          // 발밑 타원 그림자
      }

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

      this.checkAllLoaded();
    },
    () => { /* progress */ },
    (error) => {
      console.error(`Error loading ${modelPath}:`, error);
      this.checkAllLoaded(); // 에러여도 카운트
    }
  );
  }
  private checkAllLoaded() {
    this.loadedCount++;
    if (this.loadedCount >= this.totalToLoad && this.onReadyCallback) {
      this.onReadyCallback();
      this.onReadyCallback = null;
    }
  }

  private createPersonShadow(fbx: THREE.Group, x: number, z: number) {
    fbx.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(fbx);

    const personHeight = Math.max(bbox.max.y, 0.5);
    const personWidth = Math.max(bbox.max.x - bbox.min.x, bbox.max.z - bbox.min.z, 0.3);

    const foot = new THREE.Vector3(x, 0, z);
    const head = new THREE.Vector3(x, personHeight, z);

    // 태양에서 머리 방향으로 ray, y=0 평면과 교점 계산
    const dir = new THREE.Vector3().subVectors(head, this.sunPos);
    if (Math.abs(dir.y) < 0.001) return;
    const t = -this.sunPos.y / dir.y;
    const shadowTip = new THREE.Vector3().addVectors(this.sunPos, dir.clone().multiplyScalar(t));

    const shadowVec = new THREE.Vector3().subVectors(shadowTip, foot);
    const shadowLength = Math.max(shadowVec.length(), 0.8);
    const shadowCenter = new THREE.Vector3().lerpVectors(foot, shadowTip, 0.5);

    const L = shadowLength;
    const W = personWidth;

    // 직사각형 조각 경계에 그레인 적용하는 공유 ShaderMaterial
    const rectMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.19 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float grain = rand(vUv * 80.0);
          float edgeZone = 1.0 - smoothstep(0.0, 0.18, edgeDist);
          float alpha = mix(1.0, step(grain, 0.58), edgeZone * 0.88);
          gl_FragColor = vec4(0.02, 0.01, 0.0, alpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // 원형(머리 타원) 경계에 그레인 적용하는 ShaderMaterial
    const circleMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.19 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          float r = length(vUv - vec2(0.5, 0.5));
          float edgeDist = 0.5 - r;
          float grain = rand(vUv * 80.0);
          float edgeZone = 1.0 - smoothstep(0.0, 0.18, edgeDist);
          float alpha = mix(1.0, step(grain, 0.58), edgeZone * 0.88);
          gl_FragColor = vec4(0.02, 0.01, 0.0, alpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const group = new THREE.Group();
    group.position.set(shadowCenter.x, 0.02, shadowCenter.z);
    group.rotation.y = Math.atan2(shadowVec.x, shadowVec.z);

    // group 로컬 Z: -L/2 = 발(foot), +L/2 = 그림자 끝(head)
    const addRect = (rw: number, rh: number, px: number, pz: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh, 2, 2), rectMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(px, 0, pz);
      group.add(mesh);
    };

    // 1. 다리 두 기둥 (0~32%)
    const legL  = L * 0.32;
    const legW  = W * 0.10;        // 절반
    const legSep = W * 0.073;      // 1/3
    const legCZ = -L / 2 + legL / 2;
    addRect(legW, legL, -legSep, legCZ); // 왼쪽 다리
    addRect(legW, legL,  legSep, legCZ); // 오른쪽 다리

    // 2. 허리/엉덩이 이음부 (25~48%): 다리 → 몸통 연결
    const hipL = L * 0.23;
    const hipW = W * 0.28;        // 절반
    addRect(hipW, hipL, 0, -L / 2 + L * 0.25 + hipL / 2);

    // 3. 몸통 (42~75%)
    const bodyL = L * 0.33;
    const bodyW = W * 0.37;        // 절반
    addRect(bodyW, bodyL, 0, -L / 2 + L * 0.42 + bodyL / 2);

    // 4. 머리 타원 (80~97%): CircleGeometry를 타원으로 스케일
    //    rotation.x=-PI/2 후 scale.x→세계X, scale.y→세계Z(그림자방향)
    const headRX = W * 0.19;       // 절반
    const headRZ = L * 0.09;
    const headMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), circleMat);
    headMesh.rotation.x = -Math.PI / 2;
    headMesh.scale.set(headRX, headRZ, 1);
    headMesh.position.set(0, 0, -L / 2 + L * 0.88);
    group.add(headMesh);

    this.scene.add(group);
    this.shadowGroups.push(group);
  }

  // 누워있는 포즈: 모델 바로 아래에 타원형 그림자
  private createLayingShadow(fbx: THREE.Group) {
    fbx.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(fbx);

    // 월드 공간 bounding box 중심 (x/z만 사용)
    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;

    // XZ 범위의 60%를 타원 반지름으로
    const rx = Math.max((bbox.max.x - bbox.min.x) * 0.60, 0.2);
    const rz = Math.max((bbox.max.z - bbox.min.z) * 0.60, 0.2);

    const mat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.095 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {
          float r = length(vUv - vec2(0.5, 0.5));
          float edgeDist = 0.5 - r;
          if (edgeDist < 0.0) discard;
          float grain = rand(vUv * 80.0);
          float edgeZone = 1.0 - smoothstep(0.0, 0.18, edgeDist);
          float alpha = mix(1.0, step(grain, 0.58), edgeZone * 0.88);
          gl_FragColor = vec4(0.02, 0.01, 0.0, alpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // CircleGeometry: rotation.x=-PI/2 후 scale.x→세계X, scale.y→세계Z
    // rz↔rx 교환으로 90도 회전 효과
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 24), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(rz, rx, 1);
    mesh.position.set(cx, 0.02, cz);

    this.scene.add(mesh);
  }

  private buildFilterShaders() {
    const vert = `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `;
    const noise = `float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}`;

    // 0. Vintage (현재)
    const vintage = {
      uniforms: { tDiffuse: { value: null }, time: { value: 0.0 } },
      vertexShader: vert,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        ${noise}
        void main() {
          vec2 uv = vUv;
          vec2 cc = uv - 0.5; float dist = dot(cc,cc)*0.12;
          uv = (uv-0.5)*(1.0+dist)+0.5;
          vec4 color = texture2D(tDiffuse, uv);
          float gray = dot(color.rgb, vec3(0.299,0.587,0.114));
          color.rgb = mix(vec3(gray), color.rgb, 0.95);
          color.rgb *= vec3(1.02,0.98,0.92);
          float vignette = smoothstep(0.85,0.25,length(uv-0.5));
          color.rgb *= vignette;
          color.rgb -= sin(uv.y*550.0+time*6.0)*0.025;
          color.rgb += random(uv*time)*0.08;
          float off = 0.0012;
          color.r = mix(color.r, texture2D(tDiffuse,uv+vec2(off,0.0)).r, 0.25);
          color.b = mix(color.b, texture2D(tDiffuse,uv-vec2(off,0.0)).b, 0.25);
          gl_FragColor = color;
        }
      `,
    };

    // 1. Kodak Gold / Ultramax
    const kodakGold = {
      uniforms: { tDiffuse: { value: null }, time: { value: 0.0 } },
      vertexShader: vert,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        ${noise}
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          float lum = dot(color.rgb, vec3(0.299,0.587,0.114));
          // 중간톤 채도 낮춤
          float sat = 1.0 - smoothstep(0.3,0.7,lum)*0.28;
          color.rgb = mix(vec3(lum), color.rgb, sat);
          // 따뜻한 노란 하이라이트
          float hi = smoothstep(0.5,1.0,lum);
          color.rgb += vec3(0.14, 0.09, -0.06) * hi;
          // 그린-황 shadow cast
          float sh = 1.0 - smoothstep(0.0,0.4,lum);
          color.rgb += vec3(0.02,0.055,-0.015) * sh;
          // Soft vignette
          color.rgb *= smoothstep(0.95,0.3,length(uv-0.5))*0.18+0.82;
          color.rgb += random(uv*time)*0.05;
          gl_FragColor = color;
        }
      `,
    };

    // 3. Cross-process (시안/마젠타)
    const crossProcess = {
      uniforms: { tDiffuse: { value: null }, time: { value: 0.0 } },
      vertexShader: vert,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        ${noise}
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          float lum = dot(color.rgb, vec3(0.299,0.587,0.114));
          // Shadow cyan
          float sh = 1.0 - smoothstep(0.0,0.5,lum);
          color.r -= 0.16*sh; color.b += 0.22*sh;
          // Highlight magenta
          float hi = smoothstep(0.5,1.0,lum);
          color.g -= 0.13*hi; color.r += 0.07*hi;
          // Contrast boost
          color.rgb = (color.rgb - 0.5)*1.4 + 0.5;
          color.rgb *= smoothstep(0.9,0.2,length(uv-0.5));
          color.rgb += random(uv*time)*0.06;
          gl_FragColor = color;
        }
      `,
    };

    // 4. Duotone (붉은색 + 검정)
    const duotone = {
      uniforms: { tDiffuse: { value: null }, time: { value: 0.0 } },
      vertexShader: vert,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          float lum = dot(color.rgb, vec3(0.299,0.587,0.114));
          lum = smoothstep(0.08, 0.88, lum);
          vec3 dark  = vec3(0.04,0.01,0.01);
          vec3 light = vec3(1.0,0.22,0.04);
          vec3 duo = mix(dark, light, lum);
          duo += random(uv*time)*0.04;
          duo *= smoothstep(0.9,0.2,length(uv-0.5))*0.15+0.85;
          gl_FragColor = vec4(duo, 1.0);
        }
      `,
    };

    // 7. Cross-process v2 (시안/청록 ↔ 붉은 보색)
    const crossProcess2 = {
      uniforms: { tDiffuse: { value: null }, time: { value: 0.0 } },
      vertexShader: vert,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
        float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}
        void main() {
          vec2 uv = vUv;
          vec4 color = texture2D(tDiffuse, uv);
          float lum = dot(color.rgb, vec3(0.299,0.587,0.114));
          // 하이라이트에 강한 시안/청록
          float hi = smoothstep(0.38,0.9,lum);
          color.r -= 0.28*hi; color.g += 0.10*hi; color.b += 0.32*hi;
          // 그림자는 따뜻하게 유지
          float sh = 1.0 - smoothstep(0.0,0.4,lum);
          color.r += 0.10*sh;
          // High contrast
          color.rgb = (color.rgb - 0.38)*1.55 + 0.38;
          color.rgb += random(uv*time)*0.07;
          color.rgb *= smoothstep(0.9,0.2,length(uv-0.5))*0.15+0.85;
          gl_FragColor = color;
        }
      `,
    };

    return [vintage, kodakGold, crossProcess, duotone, crossProcess2];
  }

  private setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const shaders = this.buildFilterShaders();
    this.filterPass = new ShaderPass(shaders[this.currentFilterIndex]);
    this.filterPass.renderToScreen = true;
    this.composer.addPass(this.filterPass);
  }

  public cycleFilter(): void {
    const shaders = this.buildFilterShaders();
    this.currentFilterIndex = (this.currentFilterIndex + 1) % shaders.length;

    if (this.composer && this.filterPass) {
      const idx = this.composer.passes.indexOf(this.filterPass);
      if (idx !== -1) this.composer.passes.splice(idx, 1);
      this.filterPass.dispose();

      this.filterPass = new ShaderPass(shaders[this.currentFilterIndex]);
      this.filterPass.renderToScreen = true;
      this.composer.addPass(this.filterPass);
    }
  }

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    this.mixers.forEach(mixer => mixer.update(delta));

    if (this.filterPass?.uniforms?.time) {
      this.filterPass.uniforms.time.value = time;
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