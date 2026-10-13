"use client";

import Link from "next/link";
import { Download, RefreshCw, RotateCcw, Home, FlaskConical, Dices } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createBranch, type BranchSettings, type BranchRenderBudget } from "./core/createBranch";
import { createBarkSurface, type BarkSurface } from "./core/barkSurface";
import { growthTime } from "./core/treeFoliage";
import { DEFAULT_WIND_SETTINGS, type WindSettings } from "./core/treeWind";
import { DEFAULT_BRANCH_SETTINGS } from "./core/branchSkeleton";
import { LEAF_TYPES } from "./core/leafShapes";
import DragOnlyRange from "../Painted/DragOnlyRange";
import LeafSelector from "./LeafSelector";
import styles from "./brench.module.css";

const INITIAL_GROWTH = 1;

const controls = [
  { key: "height", label: "나무 높이", min: 6, max: 14, step: .25 },
  { key: "spread", label: "수관 폭", min: .5, max: 1.6, step: .05 },
  { key: "thickness", label: "줄기 굵기", min: .2, max: .65, step: .01 },
  { key: "branches", label: "큰 가지 수", min: 4, max: 20, step: 1 },
  { key: "sideBranchDensity", label: "곁가지 밀도", min: 0, max: 3, step: .1 },
  { key: "depth", label: "분기 단계", min: 2, max: 8, step: 1 },
  { key: "angle", label: "분기 각도", min: 25, max: 75, step: 1 },
  { key: "curvature", label: "곡률 · 꺾임", min: 0, max: 2, step: .05 },
  { key: "irregularity", label: "단면 · 굵기 요철", min: 0, max: 1.6, step: .05 },
  { key: "stubs", label: "멈춘 곁가지", min: 0, max: 1.5, step: .1 },
  { key: "leafDensity", label: "잎 밀도", min: 0, max: 5, step: .1 },
  { key: "leafSize", label: "잎 크기", min: .2, max: 1.5, step: .05 },
  { key: "texture", label: "수피 디테일", min: 0, max: 2, step: .05 },
] as const;
const presets = [
  { name: "넓은 수관", values: { spread: 1.2, angle: 62, curvature: .85, branches: 8, depth: 3 } },
  { name: "직립형", values: { spread: .65, angle: 30, curvature: .5, branches: 7, depth: 3 } },
  { name: "굽은 고목", values: { spread: 1, angle: 55, curvature: 1.7, branches: 6, depth: 3 } },
] as const;

function randomBranchSettings(previous: BranchSettings): BranchSettings {
  let seed = Math.floor(Math.random() * 0x100000000);
  if (seed === previous.seed) seed = (seed + 1) >>> 0;
  const next: BranchSettings = {
    ...previous,
    seed,
    leafType: LEAF_TYPES[Math.floor(Math.random() * LEAF_TYPES.length)].id,
  };
  for (const control of controls) {
    const steps = Math.round((control.max - control.min) / control.step);
    next[control.key] = Number((control.min + Math.floor(Math.random() * (steps + 1)) * control.step).toFixed(2));
  }
  return next;
}

type Viewer = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  model: ReturnType<typeof createBranch> | null;
  rotation: { x: number; y: number };
  bark: BarkSurface;
  budget: BranchRenderBudget;
  zoom: number;
  progress: number;
  wind: WindSettings;
  fit: () => void;
  capture: () => string;
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
  const recoveryAttemptsRef = useRef(0);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_BRANCH_SETTINGS);
  const [modelReady, setModelReady] = useState(false);
  const [contrast, setContrast] = useState(1);
  const [wind, setWind] = useState(DEFAULT_WIND_SETTINGS);
  const [zoom, setZoom] = useState(1);
  const [progress, setProgress] = useState(INITIAL_GROWTH);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branchCount, setBranchCount] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSettings(previous => randomBranchSettings(previous));
      setModelReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const compact = window.matchMedia("(max-width: 800px), (pointer: coarse)").matches;
    const budget = compact ? { maxStems: 90, maxLeaves: 900 }
      : { maxStems: 420, maxLeaves: 7000 };
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !compact });
    } catch {
      const errorFrame = requestAnimationFrame(() => setError("이 브라우저에서는 3D 장면을 표시할 수 없습니다."));
      return () => cancelAnimationFrame(errorFrame);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1.25 : 2));
    renderer.setClearColor(0xf9f8f5, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !compact;
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
    key.castShadow = !compact;
    key.shadow.mapSize.set(compact ? 1024 : 2048, compact ? 1024 : 2048);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.near = .5;
    key.shadow.camera.far = 60;
    key.shadow.bias = -.0002;
    key.shadow.normalBias = .015;
    scene.add(key);
    scene.add(key.target);
    const fill = new THREE.DirectionalLight(0xd5e3e5, .25);
    fill.position.set(5, -2, -5);
    scene.add(fill);

    const bark = createBarkSurface(renderer.capabilities.getMaxAnisotropy());
    const viewer: Viewer = {
      scene, renderer, model: null, rotation: { x: 0, y: 0 }, bark, budget,
      wind: { ...DEFAULT_WIND_SETTINGS }, zoom: 1, progress: progressRef.current,
      fit: () => {}, capture: () => "", dirty: true, shadowsDirty: true, lights: { ambient, key, fill },
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
      const center = viewer.model?.bounds.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
      const viewHeight = Math.max(size.y * 1.4, Math.hypot(size.x, size.z) * 1.16 / aspect);
      camera.position.set(center.x, center.y, center.z + Math.max(30, size.z * 2));
      camera.lookAt(center);
      camera.far = Math.max(100, size.z * 5);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      const shadowSpan = size.length() * .75;
      key.target.position.copy(center);
      key.position.copy(center).addScaledVector(new THREE.Vector3(-.45, .7, .9).normalize(), shadowSpan * 2);
      key.shadow.camera.left = key.shadow.camera.bottom = -shadowSpan;
      key.shadow.camera.right = key.shadow.camera.top = shadowSpan;
      key.shadow.camera.far = shadowSpan * 4;
      key.shadow.camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      viewer.dirty = viewer.shadowsDirty = true;
    };
    viewer.fit = resize;
    viewer.capture = () => {
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      return canvas.toDataURL("image/png");
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let contextLost = false;
    let recoveryTimer: number | null = null;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      setError("3D 렌더링이 중단되었습니다. 복구 중입니다.");
      if (recoveryAttemptsRef.current === 0) {
        recoveryTimer = window.setTimeout(() => {
          if (!contextLost) return;
          recoveryAttemptsRef.current = 1;
          setCanvasVersion(version => version + 1);
        }, 2500);
      } else {
        setError("3D 렌더링을 복구하지 못했습니다. 페이지를 다시 열어 주세요.");
      }
    };
    const onContextRestored = () => {
      contextLost = false;
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      viewer.fit();
      viewer.dirty = viewer.shadowsDirty = true;
      setError(null);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    let frame = 0, previousFrame = performance.now(), lastRender = 0, windPhase = 0;
    const resetWindClock = () => { previousFrame = performance.now(); lastRender = 0; };
    document.addEventListener("visibilitychange", resetWindClock);
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || contextLost) { previousFrame = now; return; }
      if (compact && now - lastRender < 1000 / 30) return;
      lastRender = now;
      const elapsed = Math.max(0, (now - previousFrame) / 1000);
      previousFrame = now;
      windPhase = (windPhase + elapsed * Math.PI * 2 / viewer.wind.period) % (Math.PI * 2);
      const turning = !!viewer.model && Math.abs(viewer.rotation.x - viewer.model.group.rotation.x)
        + Math.abs(viewer.rotation.y - viewer.model.group.rotation.y) > .0001;
      if (viewer.model && turning) {
        viewer.model.group.rotation.x += (viewer.rotation.x - viewer.model.group.rotation.x) * .12;
        viewer.model.group.rotation.y += (viewer.rotation.y - viewer.model.group.rotation.y) * .12;
        viewer.shadowsDirty = true;
      }
      if (viewer.model?.setGrowth(viewer.progress)) viewer.dirty = viewer.shadowsDirty = true;
      const time = growthTime(viewer.progress);
      if (viewer.model?.updateWind(windPhase, viewer.wind, time, elapsed) && viewer.progress > 0) {
        viewer.dirty = viewer.shadowsDirty = true;
      }
      const zooming = Math.abs(viewer.zoom - camera.zoom) > .0001;
      if (zooming) {
        camera.zoom += (viewer.zoom - camera.zoom) * .15;
        camera.updateProjectionMatrix();
      }
      if (viewer.dirty || turning || zooming) {
        renderer.shadowMap.needsUpdate = viewer.shadowsDirty;
        renderer.render(scene, camera);
        viewer.dirty = false;
        viewer.shadowsDirty = false;
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      document.removeEventListener("visibilitychange", resetWindClock);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      observer.disconnect();
      viewer.model?.dispose();
      if (viewer.model) scene.remove(viewer.model.group);
      bark.dispose();
      key.shadow.dispose();
      renderer.dispose();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, [canvasVersion]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !modelReady) return;
    // Coalesce expensive geometry changes while menu sliders are being dragged.
    const timer = window.setTimeout(() => {
      let next: ReturnType<typeof createBranch> | null = null;
      try {
        next = createBranch(settings, viewer.bark, viewer.budget);
        next.group.rotation.set(viewer.rotation.x, viewer.rotation.y, 0);
        next.setGrowth(progressRef.current);
      } catch (cause) {
        next?.dispose();
        console.error("Brench tree generation failed", cause);
        setError("새 나무를 만들지 못했습니다. 설정을 낮추거나 다시 시도해 주세요.");
        return;
      }
      if (viewer.model) {
        viewer.scene.remove(viewer.model.group);
        viewer.model.dispose();
      }
      viewer.model = next;
      viewer.scene.add(next.group);
      viewer.fit();
      viewer.dirty = viewer.shadowsDirty = true;
      setBranchCount(next.count);
      if (!viewer.renderer.getContext().isContextLost()) setError(null);
    }, viewer.budget.maxStems < 420 ? 250 : 100);
    return () => window.clearTimeout(timer);
  }, [settings, canvasVersion, modelReady]);

  useEffect(() => {
    viewerRef.current?.setLighting(contrast);
  }, [contrast, canvasVersion]);

  useEffect(() => {
    viewerRef.current?.setZoom(zoom);
  }, [zoom, canvasVersion]);

  useEffect(() => {
    if (viewerRef.current) { viewerRef.current.wind = wind; viewerRef.current.dirty = true; }
  }, [wind, canvasVersion]);

  const updateGrowth = (value: number) => {
    const next = value / 100;
    progressRef.current = next;
    if (viewerRef.current) viewerRef.current.progress = next;
    setProgress(next);
  };
  const setValue = (key: Exclude<keyof BranchSettings, "leafType">, value: number) => {
    setSettings(previous => ({ ...previous, [key]: value }));
  };
  const regenerate = () => {
    updateGrowth(100);
    setSettings(previous => ({ ...previous, seed: Math.floor(Math.random() * 0x100000000) }));
  };
  const randomizeModel = () => {
    updateGrowth(100);
    setSettings(previous => randomBranchSettings(previous));
  };
  const resetView = () => {
    setZoom(1);
    const viewer = viewerRef.current;
    if (viewer) viewer.rotation = { x: 0, y: 0 };
  };
  const download = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const link = document.createElement("a");
    link.download = `brench-${settings.seed}.png`;
    link.href = viewer.capture();
    link.click();
  };
  const renderControl = (control: (typeof controls)[number]) => <div className={styles.control} key={control.key}>
    <span className={styles.controlLabel}><span>{control.label}</span><output>{settings[control.key].toFixed(control.step >= 1 ? 0 : 2)}</output></span>
    <DragOnlyRange label={control.label} min={control.min} max={control.max} step={control.step}
      value={settings[control.key]} onChange={value => setValue(control.key, value)} />
  </div>;

  return <main className={styles.page}>
    <canvas key={canvasVersion} ref={canvasRef} className={styles.canvas} role="img"
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
    {error && <div className={styles.error}>{error}</div>}
    <div className={styles.menuRoot}>
      {controlsOpen && <aside id="brench-menu" className={styles.menu} aria-label="나무 설정">
        <div className={styles.menuHeader}><span>Brench</span><nav className={styles.menuLinks} aria-label="Brench navigation">
          <Link href="/" aria-label="Home"><Home size={16} /></Link>
          <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
        </nav></div>
        <div className={styles.controls}>
          <span className={styles.sectionTitle}>GROWTH</span>
          <div className={styles.control}>
            <span className={styles.controlLabel}><span>성장 단계</span><output>{Math.round(progress * 100)}%</output></span>
            <DragOnlyRange label="성장 시간" min={0} max={100} step={.1} value={progress * 100} onChange={updateGrowth} />
            <span className={styles.seed}>{progress === 0 ? "발아 전" : progress < .1 ? "발아" : progress < .23 ? "고개 숙인 새싹" : progress < .35 ? "떡잎 펼침" : progress < .54 ? "첫 본잎" : progress < .76 ? "어린 나무" : "성목"} · {branchCount} STEMS</span>
          </div>
          <span className={styles.sectionTitle}>TREE FORM</span>
          <div className={styles.presets}>{presets.map(preset => <button type="button" key={preset.name}
            onClick={() => setSettings(current => ({ ...current, ...preset.values }))}>{preset.name}</button>)}</div>
          <button type="button" className={styles.action} onClick={regenerate}><RefreshCw size={14} /> 새 나무 생성</button>
          <button type="button" className={styles.action} onClick={randomizeModel}><Dices size={14} /> 모델 랜덤 생성</button>
          <span className={styles.seed}>SEED {settings.seed}</span>
          {controls.slice(0, 10).map(renderControl)}
          <LeafSelector value={settings.leafType} onChange={leafType => setSettings(current => ({ ...current, leafType }))} />
          {controls.slice(10, 12).map(renderControl)}
          <span className={styles.sectionTitle}>WIND</span>
          <div className={styles.control}><span className={styles.controlLabel}><span>바람 주기</span><output>{wind.period.toFixed(2)}초</output></span>
            <DragOnlyRange label="바람 주기" min={1} max={12} step={.25} value={wind.period}
              onChange={period => setWind(current => ({ ...current, period }))} /></div>
          <div className={styles.control}><span className={styles.controlLabel}><span>바람 방향</span><output>{wind.direction}°</output></span>
            <DragOnlyRange label="바람 방향" min={0} max={360} step={5} value={wind.direction}
              onChange={direction => setWind(current => ({ ...current, direction }))} /></div>
          <div className={styles.control}><span className={styles.controlLabel}><span>바람 세기</span><output>{Math.round(wind.strength * 100)}%</output></span>
            <DragOnlyRange label="바람 세기" min={0} max={100} step={1} value={wind.strength * 100}
              onChange={strength => setWind(current => ({ ...current, strength: strength / 100 }))} /></div>
          <p className={styles.leafHint}>0° 오른쪽 / 90° 뒤 / 180° 왼쪽 / 270° 앞</p>
          <span className={styles.sectionTitle}>APPEARANCE & VIEW</span>
          {renderControl(controls[12])}
          <div className={styles.control}><span className={styles.controlLabel}><span>명암</span><output>{contrast.toFixed(2)}</output></span>
            <DragOnlyRange label="명암" min={0} max={2} step={.05} value={contrast} onChange={setContrast} /></div>
          <div className={styles.control}><span className={styles.controlLabel}><span>확대</span><output>{zoom.toFixed(2)}×</output></span>
            <DragOnlyRange label="확대" min={.7} max={3.5} step={.05} value={zoom} onChange={setZoom} /></div>
          <button type="button" className={styles.action} onClick={resetView}><RotateCcw size={14} /> 시점 초기화</button>
          <span className={styles.sectionTitle}>EXPORT & RESET</span>
          <button type="button" className={styles.action} onClick={() => { setSettings(DEFAULT_BRANCH_SETTINGS); setWind(DEFAULT_WIND_SETTINGS); setContrast(1); resetView(); updateGrowth(INITIAL_GROWTH * 100); }}>모든 설정 초기화</button>
          <button type="button" className={styles.action} onClick={download}><Download size={14} /> PNG 저장</button>
        </div>
      </aside>}
      <button type="button" className={styles.menuButton} aria-label={controlsOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-controls="brench-menu" aria-expanded={controlsOpen} onClick={() => setControlsOpen(value => !value)}>M</button>
    </div>
  </main>;
}
