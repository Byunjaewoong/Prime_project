// app/works/snow_walk/core/App.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

// SVG 데이터 (수정 없음)
const FOOTPRINT_SVG = `
<svg width="800px" height="800px" viewBox="0 -0.5 17 17" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g transform="translate(1.000000, 0.000000)" fill="#434343">
            <path d="M4.428,13.572 L0.629,12.142 L0.145,13.315 C0.145,13.315 -0.318,15.213 1.342,15.838 C3.004,16.465 3.961,14.751 3.961,14.751 L4.428,13.572 L4.428,13.572 Z" />
            <path d="M7.207,3.193 C5.565,2.534 3.26,3.979 2.463,5.8 C2.135,6.55 1.986,7.359 1.862,8.157 C1.803,8.538 1.761,8.929 1.686,9.309 C1.59,9.786 1.447,10.245 1.305,10.708 C1.108,11.351 1.325,11.459 1.924,11.569 L4.022,12.361 C4.236,12.463 4.654,12.72 4.869,12.48 C5.059,12.265 5.021,11.873 5.148,11.618 C5.312,11.287 5.496,10.95 5.699,10.638 C6.148,9.94 7,9.43 7.577,8.828 C8.292,8.08 8.687,7.33 8.905,6.338 C9.195,5.017 8.528,3.722 7.207,3.193 L7.207,3.193 Z" />
            <g transform="translate(8.000000, 0.000000)">
                <path d="M0.977,9.289 L4.632,10.732 C4.632,10.732 3.878,13.685 1.646,12.826 C-0.586,11.965 0.977,9.289 0.977,9.289 L0.977,9.289 Z" />
                <path d="M6.19,0.217 C7.75,0.797 8.378,3.255 7.721,5.024 C7.45,5.751 7.018,6.403 6.575,7.038 C6.363,7.34 6.133,7.636 5.932,7.949 C5.685,8.339 5.479,8.75 5.271,9.16 C4.98,9.73 4.759,9.665 4.275,9.366 L2.31,8.593 C2.097,8.529 1.641,8.441 1.653,8.142 C1.664,7.872 1.949,7.622 2.031,7.368 C2.137,7.035 2.234,6.683 2.3,6.34 C2.452,5.572 2.204,4.679 2.208,3.899 C2.208,2.93 2.435,2.159 2.94,1.334 C3.617,0.228 4.932,-0.248 6.19,0.217 L6.19,0.217 Z" />
            </g>
        </g>
    </g>
</svg>
`;

export class App {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private animationId: number | null = null;
  private clock: THREE.Clock;

  // Objects
  private ground: THREE.Mesh | null = null;
  private playerGroup: THREE.Group | null = null;

  // Model & Animation
  private mixer: THREE.AnimationMixer | null = null;

  // Path Logic
  private curve: THREE.QuadraticBezierCurve3 | null = null;
  private curveProgress: number = 0;
  private moveSpeed: number = 0.012; // delta-time 기반 (2× speed)

  // 유효한 경로 범위 (A' ~ B' 구간)
  private startProgress: number = 0;
  private endProgress: number = 1;

  // Footprints
  // [수정] 왼발/오른발 Geometry 따로 저장
  private leftFootGeometry: THREE.BufferGeometry | null = null;
  private rightFootGeometry: THREE.BufferGeometry | null = null;

  private footprints: THREE.Mesh[] = [];
  private fadingFootprints: THREE.Mesh[] = [];
  private lastStepPos = new THREE.Vector3(Infinity, 0, Infinity);
  private readonly STEP_DIST = 0.3; // 발자국 간 세계 공간 거리 (고정)
  private isLeftFoot: boolean = true;

  // [신규] 클릭 이벤트 관련 상태
  private isColoredMode: boolean = false;
  private defaultColor: THREE.Color = new THREE.Color(0x555555);

  // Settings
  private time: number = 0;
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private clickHandler: (event: MouseEvent) => void;

  // 백그라운드 로직 루프 (탭 비활성화에도 지속)
  private logicIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastLogicTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.035);

    // 3. Camera Setup
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

    this.camera.position.set(0, 30, 20);
    this.camera.lookAt(0, 0, 5);

    this.init();
    this.animate();
    this.startLogicLoop();

    window.addEventListener("resize", this.resize.bind(this));
    // 클릭 이벤트 리스너 등록
    this.clickHandler = (event: MouseEvent) => this.addTreeOnClick(event);
    this.canvas.addEventListener("click", this.clickHandler);
  }

  private init() {
    this.addLights();
    this.addGround();

    // 4. 발자국 Geometry 분리 생성
    this.initFootprintGeometries();

    this.addPlayer();
    // this.addIslandTree();
  }

  // [NEW] SVG 파싱 및 왼발/오른발 분리
  private initFootprintGeometries() {
    const loader = new SVGLoader();
    const svgData = loader.parse(FOOTPRINT_SVG);

    // SVG 구조상 paths<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[0]</a>, paths<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[1]</a> -> 왼발
    // paths<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[2]</a>, paths<a href="" class="citation-link" target="_blank" style="vertical-align: super; font-size: 0.8em; margin-left: 3px;">[3]</a> -> 오른발 (transform된 그룹)
    const leftShapes: THREE.Shape[] = [];
    const rightShapes: THREE.Shape[] = [];

    svgData.paths.forEach((path, index) => {
      const shapes = path.toShapes(true);
      if (index < 2) {
        leftShapes.push(...shapes);
      } else {
        rightShapes.push(...shapes);
      }
    });

    const extrudeSettings = {
      depth: 0,
      bevelEnabled: false,
    };

    // --- 왼발 Geometry 생성 ---
    const leftGeo = new THREE.ExtrudeGeometry(leftShapes, extrudeSettings);
    leftGeo.center(); // 중심점 맞추기
    const scale = 0.015;
    leftGeo.scale(scale, scale, scale);
    leftGeo.rotateX(Math.PI / 2); // 바닥에 눕히기
    leftGeo.rotateY(Math.PI / 10);     // [요청사항] 180도 회전
    this.leftFootGeometry = leftGeo;

    // --- 오른발 Geometry 생성 ---
    const rightGeo = new THREE.ExtrudeGeometry(rightShapes, extrudeSettings);
    rightGeo.center(); // 중심점 맞추기 (이 과정에서 원래 SVG의 translate(8) 간격이 사라지고 중앙으로 옴)
    rightGeo.scale(scale, scale, scale);
    rightGeo.rotateX(Math.PI / 2);
    rightGeo.rotateY(Math.PI / 10);    // [요청사항] 180도 회전
    this.rightFootGeometry = rightGeo;
  }

  private addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(15, 13, -15);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 100;

    const d = 30;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;

    this.scene.add(sunLight);
  }

  private addGround() {
    const createBrightSnowTexture = () => {
      const size = 512;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      for (let i = 0; i < 50000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const grey = Math.floor(195);
        ctx.fillStyle = `rgb(${grey},${grey},${grey})`;
        ctx.fillRect(x, y, 1, 1);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(8, 8);
      return texture;
    };

    const snowTexture = createBrightSnowTexture();

    const geometry = new THREE.PlaneGeometry(120, 120, 128, 128);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: snowTexture,
      bumpMap: snowTexture,
      bumpScale: 0.08,
      roughness: 0.6,
      metalness: 0.1,
    });

    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  private addPlayer() {
    this.playerGroup = new THREE.Group();
    this.scene.add(this.playerGroup);

    this.resetPath();

    const loader = new GLTFLoader();

    loader.load(
      "/walking_v1.glb",
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        model.scale.set(0.6, 0.6, 0.6);
        model.position.y = 0;
        model.rotation.y = 0;

        this.playerGroup?.add(model);

        this.mixer = new THREE.AnimationMixer(model);
        const clips = gltf.animations;

        if (clips.length > 0) {
          const action = this.mixer.clipAction(clips[0]);
          action.play();
        }
      },
      undefined,
      (error) => {
        console.error("An error happened loading the model:", error);
      }
    );
  }

  private addIslandTree() {
    // Frustum Culling 적용: 카메라 시야 안에 위치시키기
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.normalize();
    const position = this.camera.position.clone().add(direction.multiplyScalar(30)); // 카메라 앞 30단위
    position.y = 0; // 지면에 배치

    this.addTreeAtPosition(position);
  }

  private addTreeAtPosition(position: THREE.Vector3) {
    const loader = new GLTFLoader();

    // 랜덤으로 모델 선택 (반반 확률)
    const modelName = Math.random() < 0.5 ? "island_tree_01_1k.glb" : "island_tree_02_1k.glb";

    loader.load(
      `/${modelName}`,
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        model.position.copy(position);
        model.rotation.y = Math.random() * Math.PI * 2; // 랜덤 Y축 회전
        model.scale.set(1, 1, 1); // 적절한 스케일 설정

        this.scene.add(model);
      },
      undefined,
      (error) => {
        console.error(`An error happened loading the ${modelName}:`, error);
      }
    );
  }

  private addTreeOnClick(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const canvasWidth = rect.width;
    const canvasHeight = rect.height;

    // NDC 좌표로 변환
    const ndcX = (mouseX / canvasWidth) * 2 - 1;
    const ndcY = -(mouseY / canvasHeight) * 2 + 1;

    // Raycaster 생성
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    // Ground 평면 (y=0)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();

    if (raycaster.ray.intersectPlane(plane, intersection)) {
      this.addTreeAtPosition(intersection);
    }
  }

  private calculateVisibleRange() {
    if (!this.curve) return;

    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    const samples = 100;
    let firstVisible = -1;
    let lastVisible = -1;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const point = this.curve.getPoint(t);

      if (this.frustum.containsPoint(point)) {
        if (firstVisible === -1) firstVisible = t;
        lastVisible = t;
      }
    }

    if (firstVisible === -1) {
      this.startProgress = 0;
      this.endProgress = 1;
    } else {
      this.startProgress = Math.max(0, firstVisible - 0.05);
      this.endProgress = Math.min(1, lastVisible + 0.05);
    }

    // 너무 짧은 경로면 다시 생성
    if (this.endProgress - this.startProgress < 0.1) {
      this.resetPath();
    }
  }

  private resetPath() {
    if (!this.playerGroup) return;

    const radius = 40;

    const startAngle = Math.random() * Math.PI * 2;
    const startPoint = new THREE.Vector3(
      Math.cos(startAngle) * radius,
      0,
      Math.sin(startAngle) * radius
    );

    const endAngle = startAngle + Math.PI + (Math.random() - 0.5);
    const endPoint = new THREE.Vector3(
      Math.cos(endAngle) * radius,
      0,
      Math.sin(endAngle) * radius
    );

    const controlPoint = new THREE.Vector3(
      (Math.random() - 0.5) * 30,
      0,
      (Math.random() - 0.5) * 30
    );

    this.curve = new THREE.QuadraticBezierCurve3(
      startPoint,
      controlPoint,
      endPoint
    );

    this.calculateVisibleRange();

    this.curveProgress = this.startProgress;
    const initialPos = this.curve.getPoint(this.curveProgress);
    this.playerGroup.position.copy(initialPos);
  }

   // 1. 메서드 시그니처 변경: tangent(방향 벡터)를 인자로 받음
  private createFootprint(position: THREE.Vector3, tangent: THREE.Vector3, isLeft: boolean) {
    if (!this.leftFootGeometry || !this.rightFootGeometry) return;

    const geometry = isLeft ? this.leftFootGeometry : this.rightFootGeometry;

    // ... (Material 설정 코드는 기존과 동일) ...
    const randomColor = new THREE.Color().setHSL(Math.random(), Math.random(), Math.random());
    const initialColor = this.isColoredMode ? randomColor : this.defaultColor;
    const material = new THREE.MeshPhongMaterial({
        color: initialColor,
        transparent: true,
        opacity: 0.6,
        shininess: this.isColoredMode ? 100 : 0,
        specular: 0xffffff,
        flatShading: false,
        side: THREE.DoubleSide
    });

    const footprint = new THREE.Mesh(geometry, material);
    footprint.userData = { randomColor: randomColor };

    // 2. 위치 설정 (진행 방향의 수직 벡터를 구해 좌우 오프셋 계산)
    // Tangent(진행방향)와 Up(0,1,0) 벡터의 외적(Cross Product) = 오른쪽 방향 벡터
    const up = new THREE.Vector3(0, 1, 0);
    const rightSide = new THREE.Vector3().crossVectors(tangent, up).normalize();
    
    // 왼발이면 오른쪽 벡터의 반대(-), 오른발이면 정방향(+)
    const offsetDistance = isLeft ? -0.08 : 0.08;
    
    footprint.position.copy(position)
        .addScaledVector(rightSide, offsetDistance); // 위치 이동
    
    footprint.position.y = 0.02; // 바닥 위로 살짝 띄움

    // 3. 회전 설정 (핵심: lookAt 사용)
    // 발자국을 현재 위치에 두고, "현재 위치 + 진행 방향"을 바라보게 함
    const lookTarget = footprint.position.clone().add(tangent);
    footprint.lookAt(lookTarget);

    // [중요] SVG 지오메트리가 뒤(+Z)를 보고 있다면 180도 돌려줘야 함
    // lookAt은 -Z(앞)를 타겟으로 맞추므로, 지오메트리가 +Z(뒤)를 보고 있다면 반대로 찍힘.
    // 만약 여전히 반대라면 아래 rotateY를 추가하세요.
    footprint.rotateY(Math.PI); 

    this.scene.add(footprint);
    this.footprints.push(footprint);

    // ... (배열 관리 로직 동일) ...
    if (this.footprints.length > 1000) {
        const old = this.footprints.shift();
        if (old) this.fadingFootprints.push(old);
    }
  }



  private startLogicLoop() {
    this.lastLogicTime = performance.now();
    this.logicIntervalId = setInterval(() => {
      const now = performance.now();
      const delta = (now - this.lastLogicTime) / 1000;
      this.lastLogicTime = now;
      this.updateLogic(delta);
    }, 16);
  }

  private updateLogic(delta: number) {
    if (this.mixer) this.mixer.update(delta);

    // 페이드 속도 delta 기반 (0.3/초 = 0.005 * 60fps)
    for (let i = this.fadingFootprints.length - 1; i >= 0; i--) {
      const fp = this.fadingFootprints[i];
      const mat = fp.material as THREE.MeshPhongMaterial;
      mat.opacity -= 0.3 * delta;
      if (mat.opacity <= 0) {
        this.scene.remove(fp);
        mat.dispose();
        this.fadingFootprints.splice(i, 1);
      }
    }

    // 큰 delta를 16ms 단위로 세분화 → 발자국 간격 일정 유지
    const SUB = 0.016;
    let remaining = delta;
    while (remaining > 0) {
      const dt = Math.min(remaining, SUB);
      remaining -= dt;
      this.stepMovement(dt);
    }
  }

  private stepMovement(delta: number) {
    if (!this.curve || !this.playerGroup) return;

    this.curveProgress += this.moveSpeed * delta;

    if (this.curveProgress > this.endProgress) {
      this.resetPath();
      return;
    }

    const point = this.curve.getPoint(this.curveProgress);
    const tangent = this.curve.getTangent(this.curveProgress).normalize();

    this.playerGroup.position.copy(point);
    this.playerGroup.lookAt(point.clone().add(tangent));

    if (point.distanceTo(this.lastStepPos) >= this.STEP_DIST) {
      this.createFootprint(point, tangent, this.isLeftFoot);
      this.isLeftFoot = !this.isLeftFoot;
      this.lastStepPos.copy(point);
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.calculateVisibleRange();
    }
  }

  public destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.logicIntervalId) clearInterval(this.logicIntervalId);
    window.removeEventListener("resize", this.resize.bind(this));
    this.canvas.removeEventListener("click", this.clickHandler);
    this.renderer.dispose();
  }
}
