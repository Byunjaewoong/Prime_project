"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { EARTH_DEFAULT, EARTH_PRESETS, EarthRenderer, type EarthView } from "./EarthRenderer";
import styles from "../openSourceStudy.module.css";
import skyStyles from "./earthSky.module.css";
import { calculateSky, SUWON } from "./celestial";
import RealTimeControls from "./RealTimeControls";

export default function EarthExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<EarthRenderer | null>(null);
  const recoveryControllerRef = useRef<AbortController | null>(null);
  const current = useRef<EarthView>({ ...EARTH_DEFAULT });
  const realTimeAltitude = useRef(SUWON.elevation/1000);
  const [view,setView] = useState<EarthView>({ ...EARTH_DEFAULT });
  const [status,setStatus] = useState("loading");
  const [error,setError] = useState("");
  const [atmosphereStatus,setAtmosphereStatus] = useState("");
  const [open,setOpen] = useState(false);
  const [clock,setClock] = useState(() => Date.now());
  const sky = useMemo(() => view.realTime ? calculateSky(new Date(view.observationTime ?? clock),view.latitude,view.longitude,view.altitude*1000) : null,
    [view.realTime,view.observationTime,view.latitude,view.longitude,view.altitude,clock]);
  useEffect(() => {
    if (!view.realTime) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setClock(Date.now());
      if (!rendererRef.current || rendererRef.current.isDisposed) {
        const canvas = canvasRef.current;
        if (canvas && !recoveryControllerRef.current) {
          const controller = new AbortController();
          recoveryControllerRef.current = controller;
          const renderer = new EarthRenderer(canvas,current.current,setAtmosphereStatus);
          rendererRef.current = renderer;
          void renderer.initialize(controller.signal).then(() => {
            if (!controller.signal.aborted) setStatus("ready");
          }).catch(cause => {
            if (controller.signal.aborted) return;
            renderer.dispose();
            setError(cause instanceof Error ? cause.message : String(cause));
            setStatus("error");
          });
        }
      }
      rendererRef.current?.setView(current.current);
    },1000);
    return () => clearInterval(timer);
  },[view.realTime]);
  useEffect(() => () => {
    recoveryControllerRef.current?.abort();
    rendererRef.current?.dispose();
    rendererRef.current = null;
  },[]);
  const drag = useRef<{ id: number; x: number; y: number; yaw: number; pitch: number } | null>(null);
  const apply = (patch: Partial<EarthView>) => {
    if (current.current.realTime && patch.altitude !== undefined) realTimeAltitude.current = patch.altitude;
    current.current = { ...current.current, ...patch };
    setView(current.current);
    rendererRef.current?.setView(current.current);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    let renderer: EarthRenderer | null = null;
    const fail = (cause: unknown) => {
      if (controller.signal.aborted) return;
      renderer?.dispose();
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    };
    const lost = (event: Event) => { event.preventDefault(); fail(new Error("GPU 연결이 끊어졌습니다. 페이지를 새로고침해 주세요.")); };
    canvas.addEventListener("webglcontextlost",lost);
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          current.current = { ...current.current, animate: false };
          setView(current.current);
        }
        renderer = new EarthRenderer(canvas,current.current,setAtmosphereStatus);
        rendererRef.current = renderer;
        await renderer.initialize(controller.signal);
        if (!controller.signal.aborted) setStatus("ready");
      } catch (cause) { fail(cause); }
    });
    return () => {
      controller.abort();
      renderer?.dispose();
      canvas.removeEventListener("webglcontextlost",lost);
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  },[]);
  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const slider = (name: string, key: "coverage" | "density" | "sunElevation" | "sunAzimuth" | "exposure" | "rayleigh" | "mie", min: number, max: number, step: number) =>
    <label>{name}<output>{view[key].toFixed(step < 1 ? 2 : 0)}</output><input aria-label={name} type="range" min={min} max={max} step={step} value={view[key]} onChange={event => apply({ [key]: Number(event.target.value) })} /></label>;

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="대기와 구름의 빛 산란을 함께 계산하는 Earth"
      onPointerDown={event => { if (drag.current || (event.pointerType === "mouse" && event.button !== 0)) return; drag.current = { id: event.pointerId,x:event.clientX,y:event.clientY,yaw:current.current.yaw,pitch:current.current.pitch }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { const d=drag.current; if (!d || d.id !== event.pointerId) return; apply({ yaw:d.yaw-(event.clientX-d.x)*0.004,pitch:Math.max(current.current.mode === "orbit" ? 0.03 : -1.3,Math.min(current.current.mode === "orbit" || current.current.realTime ? 1.55 : 1.3,d.pitch+(event.clientY-d.y)*0.004)) }); }}
      onPointerUp={endDrag} onPointerCancel={endDrag}
      onWheel={event => { const v=current.current; if(v.realTime) { apply({fov:Math.max(15,Math.min(100,v.fov*Math.exp(event.deltaY*0.001)))}); return; } apply({ altitude:Math.max(v.mode === "orbit" ? 100 : 0.2,Math.min(v.mode === "orbit" ? 12000 : 40,v.altitude*Math.exp(event.deltaY*0.001))) }); }} />
    {status === "loading" && <div className={styles.error} role="status" style={{ background:"rgba(8,14,24,.8)" }}>대기와 구름을 준비하고 있습니다…</div>}
    {status === "error" && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.bottom} style={{ justifyContent: "flex-end" }}><button type="button" onClick={() => setOpen(!open)} aria-label="CONTROLS" aria-expanded={open}><SlidersHorizontal size={18} aria-hidden="true" /></button></div>
    {open && <aside className={styles.panel}>
      <h2>Earth</h2><p>대기에서 구름까지, 하나의 태양이 만드는 빛과 그림자.</p>
      <div className={styles.modeRow}>{EARTH_PRESETS.map(preset => <button type="button" key={preset.name} onClick={() => apply({...preset.view,realTime:false})}>{preset.name}</button>)}</div>
      <div className={skyStyles.mode}><button className={styles.reset} type="button" aria-pressed={view.realTime} onClick={() => apply(view.realTime ? {realTime:false,altitude:Math.max(0.2,Math.min(40,view.altitude)),sunElevation:Math.max(-10,sky?.sun.altitude ?? 0),sunAzimuth:((sky?.sun.azimuth ?? 0)+180)%360-180} : {realTime:true,mode:"sky",altitude:realTimeAltitude.current,yaw:Math.PI,pitch:0.35,observationTime:null})}>Real time</button></div>
      {sky ? <RealTimeControls view={view} sky={sky} clock={clock} apply={apply} /> : <>{slider("Sun elevation", "sunElevation",-10,90,1)}{slider("Sun direction", "sunAzimuth",-180,180,1)}</>}
      {slider("Rayleigh scattering", "rayleigh",0.2,3,0.1)}
      {slider("Mie scattering", "mie",0.2,3,0.1)}
      <p>대기의 산란·소광 계수를 조절합니다. 1.00이 원래 값이며, 변경 시 투과율과 단일 산란 데이터를 다시 계산합니다.</p>
      {atmosphereStatus && <p role="status">{atmosphereStatus}</p>}
      {slider("Cloud coverage", "coverage",0,1,0.01)}
      {slider("Cloud density", "density",0.2,3,0.05)}
      {slider("Exposure", "exposure",1,30,0.5)}
      {view.realTime ? <label>Field of view<output>{view.fov.toFixed(0)}°</output><input aria-label="Field of view" type="range" min="15" max="100" step="1" value={view.fov} onChange={event => apply({fov:Number(event.target.value)})} /></label> : <label>{view.mode === "orbit" ? "Viewing distance" : "Altitude"}<output>{view.altitude.toFixed(view.mode === "sky" ? 1 : 0)} km</output><input aria-label={view.mode === "orbit" ? "Viewing distance" : "Altitude"} type="range" min={Math.log(view.mode === "sky" ? 0.2 : 100)} max={Math.log(view.mode === "sky" ? 40 : 12000)} step="0.01" value={Math.log(view.altitude)} onChange={event => apply({ altitude: Math.exp(Number(event.target.value)) })} /></label>}
      <div className={styles.modeRow}><button type="button" aria-pressed={view.quality === "balanced"} onClick={() => apply({quality:"balanced"})}>Balanced</button><button type="button" aria-pressed={view.quality === "high"} onClick={() => apply({quality:"high"})}>High</button><button type="button" aria-pressed={!view.animate} onClick={() => apply({animate:!view.animate})}>{view.animate ? "Pause" : "Play"}</button></div>
      <p className={styles.credit}>Atmosphere © Eric Bruneton · BSD 3-Clause · <a href="/air/bruneton/LICENSE" target="_blank" rel="noopener noreferrer">License</a><br />Cloud noise: Sébastien Hillaire, weirdfoo / Worley: Marc-André Loyer · <a href="https://github.com/sebh/TileableVolumeNoise" target="_blank" rel="noopener noreferrer">Source ↗</a></p>
    </aside>}
  </main>;
}
