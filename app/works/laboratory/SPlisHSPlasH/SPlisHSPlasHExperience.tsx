"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FluidRenderer, type FluidRenderMode } from "./core/FluidRenderer";
import type { FluidScene, FluidSettings } from "./core/PbfFluid";
import styles from "./splishsplash.module.css";

const DEFAULT_SETTINGS: FluidSettings = {
  particles: 864,
  gravity: 9.8,
  viscosity: 0.13,
  pressureIterations: 3,
};

const SCENES: { id: FluidScene; label: string }[] = [
  { id: "dam", label: "Dam break" },
  { id: "drops", label: "Drop" },
  { id: "fountain", label: "Fountain" },
];

export default function SPlisHSPlasHExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FluidRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scene, setScene] = useState<FluidScene>("dam");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [renderMode, setRenderMode] = useState<FluidRenderMode>("surface");
  const [surfaceResolution, setSurfaceResolution] = useState(44);
  const [surfaceThickness, setSurfaceThickness] = useState(1.2);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed) return;
      try {
        const initial = { ...DEFAULT_SETTINGS,
          particles: window.matchMedia("(max-width: 640px)").matches ? 576 : DEFAULT_SETTINGS.particles };
        const renderer = new FluidRenderer(canvas, initial);
        rendererRef.current = renderer;
        if (initial.particles !== DEFAULT_SETTINGS.particles) setSettings(initial);
        if (renderer.surfaceResolution !== 44) setSurfaceResolution(renderer.surfaceResolution);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "3D 장면을 시작하지 못했습니다.");
      }
    });
    return () => {
      disposed = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const updateSettings = (next: FluidSettings) => {
    setSettings(next);
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (next.particles === renderer.fluid.settings.particles) Object.assign(renderer.fluid.settings, next);
    else renderer.reset(scene, next);
  };

  const chooseScene = (next: FluidScene) => {
    setScene(next);
    rendererRef.current?.reset(next, settings);
    if (paused) {
      setPaused(false);
      if (rendererRef.current) rendererRef.current.paused = false;
    }
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    if (rendererRef.current) rendererRef.current.paused = next;
  };

  const chooseRenderMode = (next: FluidRenderMode) => {
    setRenderMode(next);
    rendererRef.current?.setRenderMode(next);
  };

  const updateSurface = (resolution: number, thickness: number) => {
    setSurfaceResolution(resolution);
    setSurfaceThickness(thickness);
    rendererRef.current?.setSurfaceSettings(resolution, thickness);
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas}
      aria-label="Three-dimensional interactive SPH fluid simulation. Drag to orbit, tap to splash." />
    {error && <div className={styles.error} role="alert">3D 장면을 표시하지 못했습니다. {error}</div>}
    <div className={styles.menuRoot}>
      {menuOpen && <section className={styles.menu} aria-label="SPlisHSPlasH controls">
        <header className={styles.header}>
          <Link href="/works/laboratory" aria-label="Laboratory로 돌아가기"><ArrowLeft size={18} aria-hidden="true" /></Link>
          <strong>SPlisHSPlasH</strong>
          <button type="button" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)}>×</button>
        </header>
        <p className={styles.intro}>3D SPH · Position Based Fluids</p>
        <div className={styles.sectionLabel}>DISPLAY</div>
        <div className={styles.displayButtons}>
          <button type="button" className={renderMode === "surface" ? styles.selected : ""}
            onClick={() => chooseRenderMode("surface")}>Surface</button>
          <button type="button" className={renderMode === "particles" ? styles.selected : ""}
            onClick={() => chooseRenderMode("particles")}>Particles</button>
        </div>
        {renderMode === "surface" && <>
          <label className={styles.control}><span>표면 해상도</span><output>{surfaceResolution}</output>
            <input type="range" min="32" max="52" step="4" value={surfaceResolution}
              onChange={event => updateSurface(Number(event.target.value), surfaceThickness)} /></label>
          <label className={styles.control}><span>표면 두께</span><output>{surfaceThickness.toFixed(2)}</output>
            <input type="range" min="0.8" max="1.5" step="0.05" value={surfaceThickness}
              onChange={event => updateSurface(surfaceResolution, Number(event.target.value))} /></label>
        </>}
        <div className={styles.sectionLabel}>SCENE</div>
        <div className={styles.sceneButtons}>
          {SCENES.map(option => <button key={option.id} type="button"
            className={scene === option.id ? styles.selected : ""}
            onClick={() => chooseScene(option.id)}>{option.label}</button>)}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={togglePause} aria-label={paused ? "재생" : "일시정지"}>
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
            {paused ? "재생" : "일시정지"}
          </button>
          <button type="button" onClick={() => rendererRef.current?.reset(scene, settings)}>
            <RotateCcw size={16} aria-hidden="true" />초기화
          </button>
        </div>
        <div className={styles.sectionLabel}>SIMULATION</div>
        <label className={styles.control}><span>입자 수</span><output>{settings.particles}</output>
          <input type="range" min="288" max="1440" step="72" value={settings.particles}
            onChange={event => updateSettings({ ...settings, particles: Number(event.target.value) })} /></label>
        <label className={styles.control}><span>중력</span><output>{settings.gravity.toFixed(1)}</output>
          <input type="range" min="0" max="18" step="0.2" value={settings.gravity}
            onChange={event => updateSettings({ ...settings, gravity: Number(event.target.value) })} /></label>
        <label className={styles.control}><span>점성</span><output>{settings.viscosity.toFixed(2)}</output>
          <input type="range" min="0" max="0.6" step="0.01" value={settings.viscosity}
            onChange={event => updateSettings({ ...settings, viscosity: Number(event.target.value) })} /></label>
        <label className={styles.control}><span>압력 반복</span><output>{settings.pressureIterations}</output>
          <input type="range" min="1" max="5" step="1" value={settings.pressureIterations}
            onChange={event => updateSettings({ ...settings, pressureIterations: Number(event.target.value) })} /></label>
        <p className={styles.guide}>드래그: 회전 · 스크롤: 확대 · 탭: 물에 충격</p>
        <div className={styles.sourceLinks}>
          <a className={styles.source} href="https://github.com/InteractiveComputerGraphics/SPlisHSPlasH"
            target="_blank" rel="noopener noreferrer">SPlisHSPlasH <ExternalLink size={13} aria-hidden="true" /></a>
          <a className={styles.source} href="https://github.com/InteractiveComputerGraphics/splashsurf"
            target="_blank" rel="noopener noreferrer">SplashSurf <ExternalLink size={13} aria-hidden="true" /></a>
        </div>
        <p className={styles.credit}>SPlisHSPlasH의 PBF와 SplashSurf의 입자 표면 재구성 흐름을 참고한 브라우저 구현입니다. 원본 C++/Rust 엔진을 그대로 실행하는 것은 아닙니다.</p>
      </section>}
      <button type="button" className={styles.menuButton} aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
        <SlidersHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  </main>;
}
