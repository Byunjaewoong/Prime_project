"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createProgram, fitCanvas } from "../core/fullscreenGL";
import { cloudFragment } from "./cloudShader";
import styles from "../openSourceStudy.module.css";

export default function CloudExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ coverage: 0.58, density: 0.85, sun: 0.45, yaw: 0 });
  const [values, setValues] = useState({ coverage: 0.58, density: 0.85, sun: 0.45, yaw: 0 });
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const setValue = (key: keyof typeof values, value: number) => {
    settings.current = { ...settings.current, [key]: value };
    setValues(settings.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false });
    if (!gl) { queueMicrotask(() => setError("WebGL2를 사용할 수 없습니다.")); return; }
    let program: WebGLProgram;
    try { program = createProgram(gl, cloudFragment); }
    catch (cause) { queueMicrotask(() => setError(cause instanceof Error ? cause.message : String(cause))); return; }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const uniforms = Object.fromEntries(["uResolution", "uTime", "uCoverage", "uDensity", "uSun", "uYaw"]
      .map(name => [name, gl.getUniformLocation(program, name)]));
    let frame = 0;
    let active = true;
    const start = performance.now();
    const draw = (now: number) => {
      if (!active) return;
      fitCanvas(canvas, 800_000);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, (now - start) / 1000);
      gl.uniform1f(uniforms.uCoverage, settings.current.coverage);
      gl.uniform1f(uniforms.uDensity, settings.current.density);
      gl.uniform1f(uniforms.uSun, settings.current.sun);
      gl.uniform1f(uniforms.uYaw, settings.current.yaw);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { active = false; cancelAnimationFrame(frame); gl.deleteProgram(program); gl.deleteVertexArray(vao); };
  }, []);

  const drag = useRef<{ x: number; yaw: number } | null>(null);
  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="움직이는 3D 구름 장면"
      onPointerDown={event => { drag.current = { x: event.clientX, yaw: settings.current.yaw }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (drag.current) setValue("yaw", drag.current.yaw + (event.clientX - drag.current.x) * 0.003); }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
    <div className={styles.top}><Link href="/works/laboratory">← LABORATORY</Link><span>CLOUD <i>/</i> VOLUME STUDY</span></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.bottom}><span>DRAG TO LOOK AROUND</span><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>CONTROLS {open ? "−" : "+"}</button></div>
    {open && <aside className={styles.panel}>
      <h2>Cloud</h2>
      <p>타일 가능한 Perlin / Worley 노이즈로 형성한 구름층을 광선 행진으로 렌더링합니다.</p>
      <label>Coverage <output>{Math.round(values.coverage * 100)}%</output><input type="range" min="0" max="1" step="0.01" value={values.coverage} onChange={event => setValue("coverage", Number(event.target.value))} /></label>
      <label>Density <output>{values.density.toFixed(2)}</output><input type="range" min="0.2" max="1.6" step="0.01" value={values.density} onChange={event => setValue("density", Number(event.target.value))} /></label>
      <label>Sun direction <output>{Math.round(values.sun * 57.3)}°</output><input type="range" min="-1.2" max="1.2" step="0.01" value={values.sun} onChange={event => setValue("sun", Number(event.target.value))} /></label>
      <p className={styles.credit}>Noise model: Sébastien Hillaire with weirdfoo · Worley function: Marc-André Loyer · MIT<br /><a href="https://github.com/sebh/TileableVolumeNoise/tree/1f879a26b89aaa4b5a7f112f14ec149d08057661" target="_blank" rel="noopener noreferrer">Source ↗</a> · <a href="https://github.com/sebh/TileableVolumeNoise/blob/1f879a26b89aaa4b5a7f112f14ec149d08057661/LICENSE.md" target="_blank" rel="noopener noreferrer">License ↗</a></p>
    </aside>}
  </main>;
}
