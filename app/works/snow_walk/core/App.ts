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

  // Footprints
  private footprints: THREE.Mesh[] = [];
  private fadingFootprints: THREE.Mesh[] = [];
  private lastStepTime: number = 0;
  private stepInterval: number = 300; 
  private isLeftFoot: boolean = true; 

  // Settings
  private time: number = 0;
  private cameraY: number = 30; // 카메라 높이 저장 (Radius 계산용)

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
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.03);

    // 3. Camera Setup
    this.camera = new THREE.PerspectiveCamera(
      45,
      width / height,
      0.1,
      100
    );
    
    this.camera.position.set(0, this.cameraY, 20);
    this.camera.lookAt(0, 0, 5);

    this.init();
    this.animate();

    window.addEventListener("resize", this.resize.bind(this));
  }

  private init() {
    this.addLights();
    this.addGround();
    this.addPlayer();
  }

  private addLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
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

  // ▼▼▼ [신규] 화면 크기에 따른 적절한 Radius 계산 ▼▼▼
  private calculateRadius(): number {
    // 카메라 FOV와 높이를 이용해 화면에 보이는 땅의 범위를 대략 계산
    // tan(fov/2) * height * aspect_ratio 등을 고려해야 하지만,
    // 간단하게 카메라 높이와 종횡비를 이용한 근사값 사용
    const aspect = this.camera.aspect;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    
    // 카메라 높이에서 바닥을 볼 때 보이는 세로 절반 길이
    const visibleHeight = Math.tan(fovRad / 2) * this.cameraY; 
    // 가로 절반 길이
    const visibleWidth = visibleHeight * aspect;

    // 화면 대각선 길이보다 조금 더 길게 설정하여 확실히 화면 밖으로 보내기
    const diagonal = Math.sqrt(visibleWidth * visibleWidth + visibleHeight * visibleHeight);
    
    // 여유분(buffer) 추가 (예: 1.2배)
    return Math.max(25, diagonal * 1.5); 
  }

  private resetPath() {
    if (!this.playerGroup) return;

    // [수정] 동적으로 계산된 Radius 사용
    const radius = this.calculateRadius();

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

    this.curveProgress = 0.05;
    
    const initialPos = this.curve.getPoint(this.curveProgress);
    this.playerGroup.position.copy(initialPos);
  }

  // ▼▼▼ [신규] 리사이징 시 현재 경로 업데이트 ▼▼▼
  private updatePathForResize() {
    if (!this.curve || !this.playerGroup) return;

    // 1. 새로운 화면 크기에 맞는 Radius 계산
    const newRadius = this.calculateRadius();

    // 2. 기존 곡선의 포인트 가져오기
    const startPoint = this.curve.v0;
    const controlPoint = this.curve.v1;
    const endPoint = this.curve.v2;

    // 3. 끝점(End Point)만 새로운 Radius에 맞춰 연장
    // (시작점은 이미 지나왔거나 고정되어 있으므로 두는 게 자연스러움)
    // 원점(0,0,0)에서 현재 끝점 방향으로의 단위 벡터 계산
    const direction = endPoint.clone().normalize();
    
    // 방향은 유지하되, 거리를 새로운 Radius로 변경
    const newEndPoint = direction.multiplyScalar(newRadius);

    // 4. 곡선 업데이트
    this.curve = new THREE.QuadraticBezierCurve3(
        startPoint,
        controlPoint,
        newEndPoint
    );
    
    // *주의: 곡선이 길어지면 같은 progress(예: 0.5)라도 위치가 달라집니다.
    // 하지만 여기서는 자연스럽게 끝점이 멀어지면서 속도가 살짝 빨라지는 효과로
    // 화면 밖으로 나가는 것을 보장하므로 progress 보정 없이 둡니다.
  }

  private createFootprint(position: THREE.Vector3, isLeft: boolean) {
    const geometry = new THREE.CircleGeometry(0.07, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x555555, 
      transparent: true,
      opacity: 0.5,
    });
    const footprint = new THREE.Mesh(geometry, material);

    footprint.rotation.x = -Math.PI / 2;
    
    const offset = isLeft ? -0.15 : 0.15;
    const offsetVector = new THREE.Vector3(offset, 0, 0); 
    offsetVector.applyQuaternion(this.playerGroup!.quaternion);

    footprint.position.set(
      position.x + offsetVector.x,
      0.01,
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
        const mat = fp.material as THREE.MeshBasicMaterial;

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

      if (this.curveProgress >= 1.0) {
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

    // [수정] 리사이징 시 현재 걷고 있는 경로 업데이트
    this.updatePathForResize();
  }

  public destroy() {
    window.removeEventListener("resize", this.resize.bind(this));
    if (this.animationId) cancelAnimationFrame(this.animationId);
    
    this.renderer.dispose();
    this.scene.clear();
  }
}
