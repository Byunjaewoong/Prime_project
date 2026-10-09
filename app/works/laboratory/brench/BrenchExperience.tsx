"use client";

import Link from "next/link";
import { Download, RefreshCw, RotateCcw, Home, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createBranch, type BranchSettings } from "./core/createBranch";
import { createBarkSurface, type BarkSurface } from "./core/barkSurface";
import { growthTime } from "./core/treeFoliage";
import { DEFAULT_BRANCH_SETTINGS } from "./core/branchSkeleton";
import DragOnlyRange from "../Painted/DragOnlyRange";
import LeafSelector from "./LeafSelector";
import styles from "./brench.module.css";

const INITIAL_GROWTH = .14;

const controls = [
  { key: "height", label: "나무 높이", min: 6, max: 14, step: .25 },
  { key: "spread", label: "수관 폭", min: .5, max: 1.6, step: .05 },
  { key: "thickness", label: "줄기 굵기", min: .2, max: .65, step: .01 },
  { key: "branches", label: "큰 가지 수", min: 4, max: 10, step: 1 },
  { key: "depth", label: "분기 단계", min: 2, max: 4, step: 1 },
  { key: "angle", label: "분기 각도", min: 25, max: 75, step: 1 },
  { key: "curvature", label: "곡률 · 꺾임", min: 0, max: 2, step: .05 },
  { key: "irregularity", label: "단면 · 굵기 요철", min: 0, max: 1.6, step: .05 },
  { key: "stubs", label: "멈춘 곁가지", min: 0, max: 1.5, step: .1 },
  { key: "leafDensity", label: "잎 밀도", min: 0, max: 1.5, step: .1 },
  { key: "leafSize", label: "잎 크기", min: .5, max: 1.5, step: .05 },
  { key: "texture", label: "수피 디테일", min: 0, max: 2, step: .05 },
] as const;
const presets = [
  { name: "넓은 수관", values: { spread: 1.2, angle: 62, curvature: .85, branches: 8, depth: 3 } },
  { name: "직립형", values: { spread: .65, angle: 30, curvature: .5, branches: 7, depth: 3 } },
  { name: "굽은 고목", values: { spread: 1, angle: 55, curvature: 1.7, branches: 6, depth: 3 } },
] as const;

type Viewer = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  model: ReturnType<typeof createBranch> | null;
  rotation: { x: number; y: number };
  bark: BarkSurface;
  zoom: number;
  progress: number;
  fit: () => void;
  dirty: boolean;
  shadowsDirty: boolean;
  setLighting: (contrast: number) => void;
  setZoom: (value: number) => void;
  lights: {
    ambient: THREE.HemisphereLight;
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
  };
};

export default function BrenchExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const progressRef = useRef(INITIAL_GROWTH);
  const [settings, setSettings] = useState(DEFAULT_BRANCH_SETTINGS);
  const [contrast, setContrast] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [progress, setProgress] = useState(INITIAL_GROWTH);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [error, setError] = useState(false);
  const [branchCount, setBranchCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    } catch {
      const errorFrame = requestAnimationFrame(() => setError(true));
      return () => cancelAnimationFrame(errorFrame);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf9f8f5, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, .1, 100);
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x766b5f, .85);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff6e9, 3.4);
    key.position.set(-10, 14, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = .5;
    key.shadow.camera.far = 60;
    key.shadow.bias = -.0002;
    key.shadow.normalBias = .015;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd5e3e5, .25);
    fill.position.set(5, -2, -5);
    scene.add(fill);

    const bark = createBarkSurface(renderer.capabilities.getMaxAnisotropy());
    const viewer: Viewer = {
      scene, renderer, model: null, rotation: { x: 0, y: 0 }, bark,
      zoom: 1, progress: INITIAL_GROWTH, fit: () => {}, dirty: true, shadowsDirty: true, lights: { ambient, key, fill },
      setLighting: value => {
        ambient.intensity = 1.45 - value * .6;
        key.intensity = 2.2 + value * 1.2;
        fill.intensity = Math.max(.05, .55 - value * .3);
        viewer.dirty = true;
      },
      setZoom: value => { viewer.zoom = value; viewer.dirty = true; },
    };
    viewerRef.current = viewer;
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const size = viewer.model?.bounds.getSize(new THREE.Vector3()) ?? new THREE.Vector3(10, 12, 10);
      const viewHeight = Math.max(size.y * 1.4, Math.hypot(size.x, size.z) * 1.16 / aspect);
      camera.position.y = viewer.model?.bounds.getCenter(new THREE.Vector3()).y ?? 0;
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      viewer.dirty = true;
    };
    viewer.fit = resize;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const turning = !!viewer.model && Math.abs(viewer.rotation.x - viewer.model.group.rotation.x)
        + Math.abs(viewer.rotation.y - viewer.model.group.rotation.y) > .0001;
      if (viewer.model && turning) {
        viewer.model.group.rotation.x += (viewer.rotation.x - viewer.model.group.rotation.x) * .12;
        viewer.model.group.rotation.y += (viewer.rotation.y - viewer.model.group.rotation.y) * .12;
        viewer.shadowsDirty = true;
      }
      if (viewer.model?.setGrowth(viewer.progress)) viewer.dirty = viewer.shadowsDirty = true;
      const time = growthTime(viewer.progress);
      const growingHeight = Math.min(1, time / .52);
      const growthZoom = viewer.zoom / Math.min(1, Math.max(.16, growingHeight + .12));
      const bounds = viewer.model?.bounds;
      const focusY = bounds ? THREE.MathUtils.lerp(bounds.min.y + .7, (bounds.min.y + bounds.max.y) * .5, growingHeight) : 0;
      const movingView = Math.abs(growthZoom - camera.zoom) + Math.abs(focusY - camera.position.y) > .0001;
      if (movingView) {
        camera.zoom += (growthZoom - camera.zoom) * .15;
        camera.position.y += (focusY - camera.position.y) * .15;
        camera.updateProjectionMatrix();
      }
      if (viewer.dirty || turning || movingView) {
        renderer.shadowMap.needsUpdate = viewer.shadowsDirty;
        renderer.render(scene, camera);
        viewer.dirty = false;
        viewer.shadowsDirty = false;
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewer.model?.dispose();
      if (viewer.model) scene.remove(viewer.model.group);
      bark.dispose();
      key.shadow.dispose();
      renderer.dispose();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    // Coalesce expensive geometry changes while menu sliders are being dragged.
    const timer = window.setTimeout(() => {
      const next = createBranch(settings, viewer.bark);
      next.group.rotation.set(viewer.rotation.x, viewer.rotation.y, 0);
      if (viewer.model) {
        viewer.scene.remove(viewer.model.group);
        viewer.model.dispose();
      }
      viewer.model = next;
      viewer.scene.add(next.group);
      next.setGrowth(progressRef.current);
      viewer.fit();
      viewer.dirty = viewer.shadowsDirty = true;
      setBranchCount(next.count);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    viewerRef.current?.setLighting(contrast);
  }, [contrast]);

  useEffect(() => {
    viewerRef.current?.setZoom(zoom);
  }, [zoom]);

  const updateGrowth = (value: number) => {
    const next = value / 100;
    progressRef.current = next;
    if (viewerRef.current) viewerRef.current.progress = next;
    setProgress(next);
  };
  const setValue = (key: Exclude<keyof BranchSettings, "leafType">, value: number) => {
    setSettings(previous => ({ ...previous, [key]: value }));
  };
  const regenerate = () => setSettings(previous => ({ ...previous, seed: Math.floor(Math.random() * 0xffffffff) }));
  const resetView = () => {
    setZoom(1);
    const viewer = viewerRef.current;
    if (viewer) viewer.rotation = { x: 0, y: 0 };
  };
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `brench-${settings.seed}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} role="img"
      aria-label="절차적으로 생성된 전체 나무. 드래그하면 시점이 회전합니다."
      onPointerDown={event => {
        if (event.button !== 0) return;
        dragRef.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const drag = dragRef.current, viewer = viewerRef.current;
        if (!drag || !viewer) return;
        viewer.rotation.y += (event.clientX - drag.x) * .006;
        viewer.rotation.x = THREE.MathUtils.clamp(viewer.rotation.x + (event.clientY - drag.y) * .003, -.45, .45);
        dragRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
      onLostPointerCapture={() => { dragRef.current = null; }} />
    <div className={styles.caption}><span>BRENCH / TREE STUDY</span><span>{branchCount} STEMS · DRAG TO ROTATE</span></div>
    {error && <div className={styles.error}>이 브라우저에서는 3D 장면을 표시할 수 없습니다.</div>}
    {progress === 0 && <div className={styles.emptyHint}>아래 성장 손잡이를 오른쪽으로 드래그하세요</div>}
    <section className={styles.growth} aria-label="나무 성장 시간축">
      <div className={styles.controlLabel}><span>{progress === 0 ? "발아 전" : progress < .17 ? "새싹 · 떡잎" : progress < .43 ? "묘목" : progress < .76 ? "어린 나무" : "성목"} · DRAG</span><output>{Math.round(progress * 100)}%</output></div>
      <DragOnlyRange label="성장 시간" min={0} max={100} step={.1} value={progress * 100} onChange={updateGrowth} />
    </section>
    <div className={styles.menuRoot}>
      {controlsOpen && <aside id="brench-menu" className={styles.menu} aria-label="나무 설정">
        <div className={styles.menuHeader}><span>Brench</span><nav className={styles.menuLinks} aria-label="Brench navigation">
          <Link href="/" aria-label="Home"><Home size={16} /></Link>
          <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
        </nav></div>
        <div className={styles.controls}>
          <LeafSelector value={settings.leafType} onChange={leafType => setSettings(current => ({ ...current, leafType }))} />
          <span className={styles.sectionTitle}>TREE FORM</span>
          <div className={styles.presets}>{presets.map(preset => <button type="button" key={preset.name}
            onClick={() => setSettings(current => ({ ...current, ...preset.values }))}>{preset.name}</button>)}</div>
          <button type="button" className={styles.action} onClick={regenerate}><RefreshCw size={14} /> 새 나무 생성</button>
          <span className={styles.seed}>SEED {settings.seed}</span>
          {controls.map(control => <div className={styles.control} key={control.key}>
            <span className={styles.controlLabel}><span>{control.label}</span><output>{settings[control.key].toFixed(control.step >= 1 ? 0 : 2)}</output></span>
            <DragOnlyRange label={control.label} min={control.min} max={control.max} step={control.step}
              value={settings[control.key]} onChange={value => setValue(control.key, value)} />
          </div>)}
          <span className={styles.sectionTitle}>LIGHT & VIEW</span>
          <div className={styles.control}><span className={styles.controlLabel}><span>명암</span><output>{contrast.toFixed(2)}</output></span>
            <DragOnlyRange label="명암" min={0} max={2} step={.05} value={contrast} onChange={setContrast} /></div>
          <div className={styles.control}><span className={styles.controlLabel}><span>확대</span><output>{zoom.toFixed(2)}×</output></span>
            <DragOnlyRange label="확대" min={.7} max={3.5} step={.05} value={zoom} onChange={setZoom} /></div>
          <button type="button" className={styles.action} onClick={resetView}><RotateCcw size={14} /> 시점 초기화</button>
          <button type="button" className={styles.action} onClick={() => { setSettings(DEFAULT_BRANCH_SETTINGS); setContrast(1); resetView(); updateGrowth(INITIAL_GROWTH * 100); }}>모든 설정 초기화</button>
          <button type="button" className={styles.action} onClick={download}><Download size={14} /> PNG 저장</button>
        </div>
      </aside>}
      <button type="button" className={styles.menuButton} aria-label={controlsOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-controls="brench-menu" aria-expanded={controlsOpen} onClick={() => setControlsOpen(value => !value)}>M</button>
    </div>
  </main>;
}
