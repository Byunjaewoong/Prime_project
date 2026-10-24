"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createProgram, fitCanvas } from "../core/fullscreenGL";
import { displayFragment, pathFragment } from "./pathShader";
import styles from "../openSourceStudy.module.css";

export default function PathtracingExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ yaw: 0, pitch: 0, zoom: 5.1 });
  const reset = useRef(0);
  const [samples, setSamples] = useState(0);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"quality" | "speed">("quality");
  const modeRef = useRef(mode);
  const updateView = (next: typeof view.current) => { view.current = next; reset.current++; };
  const updateMode = (next: typeof mode) => { modeRef.current = next; setMode(next); reset.current++; };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { queueMicrotask(() => setError("WebGL2를 사용할 수 없습니다.")); return; }
    if (!gl.getExtension("EXT_color_buffer_float")) { queueMicrotask(() => setError("이 장치에서는 부동소수점 렌더 타깃을 사용할 수 없습니다.")); return; }
    let trace: WebGLProgram, display: WebGLProgram;
    try { trace = createProgram(gl, pathFragment); display = createProgram(gl, displayFragment); }
    catch (cause) { queueMicrotask(() => setError(cause instanceof Error ? cause.message : String(cause))); return; }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const traceUniforms = Object.fromEntries(["uResolution", "uPrevious", "uSample", "uYaw", "uPitch", "uZoom"]
      .map(name => [name, gl.getUniformLocation(trace, name)]));
    const imageUniform = gl.getUniformLocation(display, "uImage");
    const displayResolution = gl.getUniformLocation(display, "uResolution");
    const targets: { texture: WebGLTexture; framebuffer: WebGLFramebuffer }[] = [];
    const clearTargets = () => { for (const target of targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); } targets.length = 0; };
    const createTargets = () => {
      clearTargets();
      for (let i = 0; i < 2; i++) {
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error("렌더 타깃을 만들 수 없습니다.");
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("부동소수점 프레임버퍼를 사용할 수 없습니다.");
        targets.push({ texture, framebuffer });
      }
    };
    let frame = 0, count = 0, seenReset = -1, active = true;
    const draw = () => {
      if (!active) return;
      try {
        const resized = fitCanvas(canvas, modeRef.current === "quality" ? 520_000 : 240_000);
        if (resized || targets.length === 0) createTargets();
        if (resized || seenReset !== reset.current) { count = 0; seenReset = reset.current; setSamples(0); }
        if (count < 512) {
          const current = targets[count % 2], previous = targets[(count + 1) % 2];
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, current.framebuffer);
          gl.useProgram(trace);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, previous.texture);
          gl.uniform1i(traceUniforms.uPrevious, 0);
          gl.uniform2f(traceUniforms.uResolution, canvas.width, canvas.height);
          gl.uniform1i(traceUniforms.uSample, count);
          gl.uniform1f(traceUniforms.uYaw, view.current.yaw);
          gl.uniform1f(traceUniforms.uPitch, view.current.pitch);
          gl.uniform1f(traceUniforms.uZoom, view.current.zoom);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.useProgram(display);
          gl.bindTexture(gl.TEXTURE_2D, current.texture);
          gl.uniform1i(imageUniform, 0);
          gl.uniform2f(displayResolution, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          count++;
          if (count < 9 || count % 8 === 0) setSamples(count);
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { active = false; cancelAnimationFrame(frame); clearTargets(); gl.deleteProgram(trace); gl.deleteProgram(display); gl.deleteVertexArray(vao); };
  }, []);

  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="누적 렌더링되는 Cornell box 경로 추적 장면"
      onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, yaw: view.current.yaw, pitch: view.current.pitch }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!drag.current) return; updateView({ ...view.current, yaw: Math.max(-0.45, Math.min(0.45, drag.current.yaw + (event.clientX - drag.current.x) * 0.002)), pitch: Math.max(-0.35, Math.min(0.35, drag.current.pitch + (event.clientY - drag.current.y) * 0.002)) }); }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onWheel={event => { updateView({ ...view.current, zoom: Math.max(3.5, Math.min(8, view.current.zoom + event.deltaY * 0.005)) }); }} />
    <div className={styles.top}><Link href="/works/laboratory">← LABORATORY</Link><span>PATHTRACING <i>/</i> LIGHT STUDY</span></div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    <div className={styles.bottom}><span>{samples} SAMPLES · DRAG TO LOOK</span><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>CONTROLS {open ? "−" : "+"}</button></div>
    {open && <aside className={styles.panel}>
      <h2>Pathtracing</h2>
      <p>빛의 경로를 무작위로 추적하고 샘플을 누적해 간접 조명과 부드러운 그림자를 만듭니다. 드래그하거나 휠로 시점을 변경하면 누적을 다시 시작합니다.</p>
      <div className={styles.modeRow}><button type="button" aria-pressed={mode === "quality"} onClick={() => updateMode("quality")}>Quality</button><button type="button" aria-pressed={mode === "speed"} onClick={() => updateMode("speed")}>Speed</button></div>
      <button type="button" className={styles.reset} onClick={() => { updateView({ yaw: 0, pitch: 0, zoom: 5.1 }); }}>Reset view</button>
      <p className={styles.credit}>Inspired by Erich Loftis&apos; THREE.js-PathTracing-Renderer, originating from Kevin Beason&apos;s smallPT · CC0-1.0. This page uses a local WebGL2 shader rather than bundled Three.js.<br /><a href="https://github.com/erichlof/THREE.js-PathTracing-Renderer/tree/a930973667faf4502b427a01dd338a19522c8f6c" target="_blank" rel="noopener noreferrer">Source ↗</a> · <a href="https://github.com/erichlof/THREE.js-PathTracing-Renderer/blob/a930973667faf4502b427a01dd338a19522c8f6c/LICENSE" target="_blank" rel="noopener noreferrer">License ↗</a></p>
    </aside>}
  </main>;
}
