// app/works/weatherProject/core/App.ts

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

  // 밝은 주황색 배경
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0xff6b35); // 밝은 주황
  this.scene.fog = new THREE.FogExp2(0xff7744, 0.028); // 부드러운 안개

  // 카메라
  this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
  this.camera.position.set(0, 3, 32);
  this.camera.lookAt(0, 10, -15);

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
  const wallGeometry = new THREE.BoxGeometry(3, 40, 150);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xcc5522, // 밝은 주황-갈색
    roughness: 0.85,
    metalness: 0.1,
    emissive: 0xff7744,
    emissiveIntensity: 0.1,
  });

  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.set(-25, 20, -20);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  this.scene.add(leftWall);

  const rightWall = new THREE.Mesh(wallGeometry, wallMaterial.clone());
  rightWall.position.set(25, 20, -20);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  this.scene.add(rightWall);

  // 밝은 창문들
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 30; j++) {
      const windowGeo = new THREE.PlaneGeometry(1.2, 1.5);
      const brightness = 0.15 + Math.random() * 0.1;
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0xdd7744,
        roughness: 0.7,
        emissive: 0xff8855,
        emissiveIntensity: brightness,
      });
      const window1 = new THREE.Mesh(windowGeo, windowMat);
      window1.position.set(-24, 1 + i * 3.8, -80 + j * 5);
      window1.rotation.y = Math.PI / 2;
      this.scene.add(window1);
    }
  }

  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 30; j++) {
      const windowGeo = new THREE.PlaneGeometry(1.2, 1.5);
      const brightness = 0.15 + Math.random() * 0.1;
      const windowMat = new THREE.MeshStandardMaterial({
        color: 0xdd7744,
        roughness: 0.7,
        emissive: 0xff8855,
        emissiveIntensity: brightness,
      });
      const window2 = new THREE.Mesh(windowGeo, windowMat);
      window2.position.set(24, 1 + i * 3.8, -80 + j * 5);
      window2.rotation.y = -Math.PI / 2;
      this.scene.add(window2);
    }
  }

  // 천장 - 밝은 색
  const ceilingGeo = new THREE.PlaneGeometry(60, 150);
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0xbb6644,
    roughness: 0.5,
    metalness: 0.5,
  });
  const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
  ceiling.position.set(0, 40, -20);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  this.scene.add(ceiling);
  }

  private addFloor() {
  const floorGeo = new THREE.PlaneGeometry(55, 150);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x995533,
    roughness: 0.4,
    metalness: 0.6,
    emissive: 0x442211,
    emissiveIntensity: 0.15,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0, -20);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  this.scene.add(floor);
  }

  private addSun() {
  const sunPosition = new THREE.Vector3(0, 13, -25);

  const sunGeometry = new THREE.SphereGeometry(9, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff66, // 밝은 노란색
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

  // 태양 광원
  this.sunLight = new THREE.PointLight(0xffcc77, 2.5, 90);
  this.sunLight.position.copy(sunPosition);
  this.sunLight.castShadow = true;
  this.sunLight.shadow.mapSize.width = 2048;
  this.sunLight.shadow.mapSize.height = 2048;
  this.scene.add(this.sunLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffaa66, 0xaa5533, 0.5);
  this.scene.add(hemisphereLight);
  }

  private addPeople() {
    const loader = new GLTFLoader();

    // 60명의 사람 (더 많이)
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 45;
      const z = 15 + Math.random() * 50; // 카메라 앞쪽에 집중
      const scale = 0.35 + Math.random() * 0.35;
      const rotation = Math.random() * Math.PI * 2;

      loader.load(
        '/walking_v1.glb',
        (gltf) => {
          const model = gltf.scene;

          // 완전히 검은 실루엣
          model.traverse((child) => {
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

          model.scale.set(scale, scale, scale);
          model.position.set(x, 0, z);
          model.rotation.y = rotation;

          this.scene.add(model);
          this.people.push(model);

          // 매우 느린 걷기 애니메이션
          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(gltf.animations[0]);
            action.timeScale = 0.1 + Math.random() * 0.3;
            action.play();
            this.mixers.push(mixer);
          }
        },
        undefined,
        (error) => {
          console.error('Error loading walking model:', error);
        }
      );
    }
  }

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

      void main() {
        vec2 uv = vUv;
        
        vec2 cc = uv - 0.5;
        float dist = dot(cc, cc) * 0.12;
        uv = (uv - 0.5) * (1.0 + dist) + 0.5;
        
        vec4 color = texture2D(tDiffuse, uv);
        
        // 채도 약간만 낮추기
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(gray), color.rgb, 0.95);
        
        // 따뜻한 톤
        color.rgb *= vec3(1.02, 0.98, 0.92);
        
        // 약한 비네팅
        float vignette = smoothstep(0.85, 0.25, length(uv - 0.5));
        color.rgb *= vignette;
        
        // 약한 스캔라인
        float scanline = sin(uv.y * 550.0 + time * 6.0) * 0.025;
        color.rgb -= scanline;
        
        // 약한 색수차
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
  this.composer.addPass(vintagePass);

  const filmPass = new FilmPass(0.2, 0.3);
  filmPass.renderToScreen = true;
  this.composer.addPass(filmPass);
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
    // 매우 미묘한 움직임
    this.camera.position.x = (x - 0.5) * 3;
    this.camera.position.y = 2.5 + (y - 0.5) * 2;
    this.camera.lookAt(0, 8, -20);
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