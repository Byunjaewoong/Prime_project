// app/works/snow_walk/core/App.ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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
  private moveSpeed: number = 0.0001; 
  
  // 유효한 경로 범위 (A' ~ B' 구간)
  private startProgress: number = 0; 
  private endProgress: number = 1;

  // Footprints
  private footprints: THREE.Mesh[] = [];
  private fadingFootprints: THREE.Mesh[] = [];
  private lastStepTime: number = 0;
  private stepInterval: number = 300; 
  private isLeftFoot: boolean = true; 

  // [신규] 클릭 이벤트 관련 상태
  private isColoredMode: boolean = false; 
  private defaultColor: THREE.Color = new THREE.Color(0x555555); 

  // Settings
  private time: number = 0;
  private frustum: THREE.Frustum = new THREE.Frustum(); 
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();

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
    this.camera = new THREE.PerspectiveCamera(
      45,
      width / height,
      0.1,
      100
    );
    
    this.camera.position.set(0, 30, 20);
    this.camera.lookAt(0, 0, 5);


    this.init();
    this.animate();

    window.addEventListener("resize", this.resize.bind(this));
    // 클릭 이벤트 리스너 등록
    this.canvas.addEventListener("click", this.toggleColorMode.bind(this));
  }

  private init() {
    this.addLights();
    this.addGround();
    this.addPlayer();
  }

  // [수정] 클릭 시 색상 및 광택(Shininess) 토글
  private toggleColorMode() {
    this.isColoredMode = !this.isColoredMode; 

    const allFootprints = [...this.footprints, ...this.fadingFootprints];
    
    allFootprints.forEach(fp => {
        // PhongMaterial로 캐스팅
        const mat = fp.material as THREE.MeshPhongMaterial;
        
        if (this.isColoredMode) {
            // 컬러 모드: 랜덤 색상 + 반짝임(100)
            mat.color.set(fp.userData.randomColor);
            mat.shininess = 100; 
        } else {
            // 기본 모드: 회색 + 무광(0)
            mat.color.set(this.defaultColor);
            mat.shininess = 0; 
        }
        mat.needsUpdate = true;
    });
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
    
    loader.load('/walking_v1.glb', (gltf) => {
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
    }, undefined, (error) => {
      console.error('An error happened loading the model:', error);
    });
  }

  private calculateVisibleRange() {
    if (!this.curve) return;

    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
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

  private createFootprint(position: THREE.Vector3, isLeft: boolean) {
    // [수정] 원을 더 부드럽게 (세그먼트 16)
    const geometry = new THREE.CircleGeometry(0.07, 16);
    
    // 랜덤 색상 생성 (HSL로 선명하게)
    // const randomColor = new THREE.Color().setHSL(Math.random(), 0.8, 0.6);
    const randomColor = new THREE.Color().setHSL(Math.random(), Math.random(), Math.random());
    const initialColor = this.isColoredMode ? randomColor : this.defaultColor;

    // [수정] MeshPhongMaterial 사용하여 반짝임 표현
    const material = new THREE.MeshPhongMaterial({
      color: initialColor, 
      transparent: true,
      opacity: 0.5, // 약간 더 진하게
      shininess: this.isColoredMode ? 100 : 0, // 모드에 따라 광택 결정
      specular: 0xffffff, // 흰색 하이라이트
      flatShading: false,
    });

    const footprint = new THREE.Mesh(geometry, material);

    // userData에 랜덤 색상 저장
    footprint.userData = { randomColor: randomColor };

    footprint.rotation.x = -Math.PI / 2;
    
    const offset = isLeft ? -0.15 : 0.15;
    const offsetVector = new THREE.Vector3(offset, 0, 0); 
    offsetVector.applyQuaternion(this.playerGroup!.quaternion);

    footprint.position.set(
      position.x + offsetVector.x,
      0.015, // z-fighting 방지 및 입체감을 위해 약간 띄움
      position.z + offsetVector.z
    );

    this.scene.add(footprint);
    this.footprints.push(footprint);

    if (this.footprints.length > 2000) {
      const old = this.footprints.shift();
      if (old) {
        this.fadingFootprints.push(old);
      }
    }
  }

  private animate() {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    const delta = this.clock.getDelta();
    if (this.mixer) {
      this.mixer.update(delta);
    }

    this.time += 0.015;

    for (let i = this.fadingFootprints.length - 1; i >= 0; i--) {
        const fp = this.fadingFootprints[i];
        // [수정] 타입 캐스팅 Phong으로 변경
        const mat = fp.material as THREE.MeshPhongMaterial;

        mat.opacity -= 0.001; 

        if (mat.opacity <= 0) {
            this.scene.remove(fp);
            fp.geometry.dispose();
            mat.dispose();
            this.fadingFootprints.splice(i, 1);
        }
    }

    if (this.playerGroup && this.curve) {
      this.curveProgress += this.moveSpeed;

      if (this.curveProgress >= this.endProgress) {
        this.resetPath(); 
      } else {
        const point = this.curve.getPoint(this.curveProgress);
        this.playerGroup.position.copy(point);

        const lookAtPoint = this.curve.getPoint(Math.min(this.curveProgress + 0.01, 1.0));
        this.playerGroup.lookAt(lookAtPoint);

        const currentTime = Date.now();
        if (currentTime - this.lastStepTime > this.stepInterval) {
          this.createFootprint(this.playerGroup.position, this.isLeftFoot);
          this.isLeftFoot = !this.isLeftFoot;
          this.lastStepTime = currentTime;
        }
      }
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const parent = this.canvas.parentElement;
    let width, height;

    if (parent) {
        width = parent.clientWidth;
        height = parent.clientHeight;
    } else {
        width = window.innerWidth;
        height = window.innerHeight;
    }

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    this.calculateVisibleRange();
  }

  public destroy() {
    window.removeEventListener("resize", this.resize.bind(this));
    // 이벤트 리스너 제거
    this.canvas.removeEventListener("click", this.toggleColorMode.bind(this));

    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    this.renderer.dispose();
    this.scene.clear();
  }
}
