"use client";

import Link from "next/link";
import { Download, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createBranch, type BranchSettings } from "./core/createBranch";
import styles from "./brench.module.css";

const initialSettings: BranchSettings = {
  seed: 24659,
  curvature: 1,
  spread: 1,
  texture: 1,
};

type Viewer = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  model: ReturnType<typeof createBranch> | null;
  rotation: { x: number; y: number };
};

export default function BrenchExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState(false);
  const [branchCount, setBranchCount] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf9f8f5, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, .1, 100);
    camera.position.set(0, -.22, 18);
    camera.lookAt(0, -.22, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa99b89, 1.5));
    const key = new THREE.DirectionalLight(0xfff6e9, 2.4);
    key.position.set(-4, 7, 9);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd5e3e5, .7);
    fill.position.set(5, -2, -5);
    scene.add(fill);

    const viewer: Viewer = { scene, renderer, model: null, rotation: { x: 0, y: 0 } };
    viewerRef.current = viewer;
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const aspect = width / height;
      const viewHeight = Math.max(11.25, 8.9 / aspect);
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (viewer.model) {
        viewer.model.group.rotation.x += (viewer.rotation.x - viewer.model.group.rotation.x) * .12;
        viewer.model.group.rotation.y += (viewer.rotation.y - viewer.model.group.rotation.y) * .12;
      }
      renderer.render(scene, camera);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      viewer.model?.dispose();
      if (viewer.model) scene.remove(viewer.model.group);
      renderer.dispose();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = createBranch(settings);
    next.group.rotation.set(viewer.rotation.x, viewer.rotation.y, 0);
    if (viewer.model) {
      viewer.scene.remove(viewer.model.group);
      viewer.model.dispose();
    }
    viewer.model = next;
    viewer.scene.add(next.group);
    setBranchCount(next.count);
  }, [settings]);

  const setValue = useCallback((key: "curvature" | "spread" | "texture", value: number) => {
    setSettings(previous => ({ ...previous, [key]: value }));
  }, []);

  const regenerate = () => setSettings(previous => ({ ...previous, seed: Math.floor(Math.random() * 0xffffffff) }));
  const resetView = () => {
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/works/laboratory" className={styles.back}>← Laboratory</Link>
        <span className={styles.archive}>GRIMGRIGI / LABORATORY</span>
        <span className={styles.index}>No. 14</span>
      </header>

      <div ref={stageRef} className={styles.stage}>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-label="절차적으로 생성된 3D 나뭇가지. 드래그하면 회전합니다."
          onPointerDown={event => {
            dragRef.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const drag = dragRef.current;
            const viewer = viewerRef.current;
            if (!drag || !viewer) return;
            viewer.rotation.y += (event.clientX - drag.x) * .006;
            viewer.rotation.x = THREE.MathUtils.clamp(viewer.rotation.x + (event.clientY - drag.y) * .003, -.5, .5);
            dragRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        />
        {error && <div className={styles.error}>이 브라우저에서는 3D 장면을 표시할 수 없습니다.</div>}
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>PROCEDURAL BOTANICAL STUDY</span>
          <h1>Brench<span className={styles.period}>.</span></h1>
          <p>나뭇가지의 결, 갈라짐, 휘어짐.</p>
        </div>
        <aside className={styles.controls} aria-label="나뭇가지 생성 설정">
          <div className={styles.controlHead}>
            <span>FORM STUDY</span>
            <span>001 / ∞</span>
          </div>
          <label className={styles.control}>
            <span><b>곡률</b><small>CURVATURE</small></span>
            <input type="range" min="0" max="2" step="0.05" value={settings.curvature} onChange={event => setValue("curvature", Number(event.target.value))} />
            <output>{settings.curvature.toFixed(2)}</output>
          </label>
          <label className={styles.control}>
            <span><b>뻗음</b><small>SPREAD</small></span>
            <input type="range" min="0.65" max="1.3" step="0.01" value={settings.spread} onChange={event => setValue("spread", Number(event.target.value))} />
            <output>{settings.spread.toFixed(2)}</output>
          </label>
          <label className={styles.control}>
            <span><b>수피 질감</b><small>BARK DETAIL</small></span>
            <input type="range" min="0" max="2" step="0.05" value={settings.texture} onChange={event => setValue("texture", Number(event.target.value))} />
            <output>{settings.texture.toFixed(2)}</output>
          </label>
          <button className={styles.generate} onClick={regenerate}><RefreshCw size={15} /> 새 가지 생성 <span>↗</span></button>
          <div className={styles.secondaryActions}>
            <button onClick={resetView}><RotateCcw size={14} /> 시점 초기화</button>
            <button onClick={download}><Download size={14} /> PNG 저장</button>
          </div>
        </aside>
        <div className={styles.caption}>
          <span>SEED {settings.seed.toString().padStart(8, "0")}</span>
          <span>{branchCount} STEMS · DRAG TO ROTATE</span>
        </div>
      </div>
    </main>
  );
}
