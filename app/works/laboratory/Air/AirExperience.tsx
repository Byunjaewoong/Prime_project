"use client";

import Link from "next/link";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { AIR_PRESETS, AirRenderer, type AirView } from "./AirRenderer";
import styles from "./air.module.css";

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
type Drag = { id: number; x: number; y: number; mode: "camera" | "sun" };

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

export default function AirExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AirRenderer | null>(null);
  const viewRef = useRef<AirView>({ ...AIR_PRESETS[0].view });
  const dragRef = useRef<Drag | null>(null);
  const [view, setView] = useState<AirView>(AIR_PRESETS[0].view);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const applyView = (next: AirView) => {
    viewRef.current = next;
    setView(next);
    rendererRef.current?.setView(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    let renderer: AirRenderer | null = null;
    let observer: ResizeObserver | null = null;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      try {
        renderer = new AirRenderer(canvas, viewRef.current);
        rendererRef.current = renderer;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "WebGL2를 시작할 수 없습니다.");
        setStatus("error");
        return;
      }
      const activeRenderer = renderer;
      observer = new ResizeObserver(() => activeRenderer.resize());
      observer.observe(canvas);
      void activeRenderer.initialize(controller.signal, (done, total) => {
        if (!controller.signal.aborted) setProgress(Math.round(done / total * 100));
      }).then(() => {
        if (!controller.signal.aborted) setStatus("ready");
      }).catch(cause => {
        if (controller.signal.aborted) return;
        console.error("Bruneton atmosphere initialization failed", cause);
        setError(cause instanceof Error ? cause.message.split("\n")[0] : "대기 데이터를 불러오지 못했습니다.");
        setStatus("error");
      });
    });
    return () => {
      controller.abort();
      observer?.disconnect();
      renderer?.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY,
      mode: event.ctrlKey || event.shiftKey ? "sun" : "camera" };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const current = viewRef.current;
    if (drag.mode === "sun") {
      applyView({ ...current,
        sunZenith: clamp(current.sunZenith + dy / 500, 0, Math.PI),
        sunAzimuth: current.sunAzimuth - dx / 500 });
    } else {
      applyView({ ...current,
        viewZenith: clamp(current.viewZenith - dy / 500, 0, Math.PI / 2),
        viewAzimuth: current.viewAzimuth - dx / 500 });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const current = viewRef.current;
    applyView({ ...current, viewDistanceMeters: clamp(current.viewDistanceMeters * Math.exp(event.deltaY * 0.001), 1000, 1.2e7) });
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="Interactive atmospheric scattering scene"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp} onWheel={onWheel} />
    <div className={styles.topline}>
      <Link href="/works/laboratory" className={styles.back} aria-label="Laboratory로 돌아가기"><ArrowLeft size={20} aria-hidden="true" /></Link>
    </div>
    {status !== "ready" && <div className={styles.loading} role="status" aria-live="polite"
      aria-label={status === "loading" ? `대기 산란 데이터 불러오는 중 ${progress}%` : "장면을 표시하지 못했습니다"}>
      {status === "loading" ? <>
        <span className={styles.spinner} aria-hidden="true" />
      </> : <>
        <span>장면을 표시하지 못했습니다.</span>
        <small>{error}</small>
      </>}
    </div>}
    <div className={styles.menuRoot}>
      {menuOpen && <section className={styles.menu} aria-label="Air controls">
        <div className={styles.menuHeader}><span>AIR / ATMOSPHERE</span><button type="button" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">×</button></div>
        <p className={styles.menuIntro}>Eric Bruneton의 사전 계산 대기 산란 모델</p>
        <div className={styles.label}>VIEW PRESET</div>
        <div className={styles.presets}>
          {AIR_PRESETS.map(preset => <button key={preset.name} type="button" onClick={() => applyView({ ...preset.view })}>{preset.name}</button>)}
        </div>
        <div className={styles.label}>SUN & CAMERA</div>
        <label className={styles.control}><span>태양 고도</span><output>{Math.round(90 - view.sunZenith * DEG)}°</output>
          <input type="range" min="-15" max="90" step="1" value={clamp(90 - view.sunZenith * DEG, -15, 90)}
            onChange={event => applyView({ ...viewRef.current, sunZenith: (90 - Number(event.target.value)) * RAD })} /></label>
        <label className={styles.control}><span>태양 방향</span><output>{Math.round(view.sunAzimuth * DEG)}°</output>
          <input type="range" min="-180" max="180" step="1" value={clamp(view.sunAzimuth * DEG, -180, 180)}
            onChange={event => applyView({ ...viewRef.current, sunAzimuth: Number(event.target.value) * RAD })} /></label>
        <label className={styles.control}><span>관찰 거리</span><output>{view.viewDistanceMeters >= 100000 ? `${Math.round(view.viewDistanceMeters / 1000)} km` : `${(view.viewDistanceMeters / 1000).toFixed(1)} km`}</output>
          <input type="range" min="3" max="7.08" step="0.01" value={Math.log10(view.viewDistanceMeters)}
            onChange={event => applyView({ ...viewRef.current, viewDistanceMeters: 10 ** Number(event.target.value) })} /></label>
        <label className={styles.control}><span>노출</span><output>{view.exposure.toFixed(0)}</output>
          <input type="range" min="1" max="220" step="1" value={view.exposure}
            onChange={event => applyView({ ...viewRef.current, exposure: Number(event.target.value) })} /></label>
        <p className={styles.credit}>Original model and LUTs © Eric Bruneton · BSD 3-Clause</p>
      </section>}
      <button type="button" className={styles.menuButton} aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><SlidersHorizontal size={19} aria-hidden="true" /></button>
    </div>
  </main>;
}
