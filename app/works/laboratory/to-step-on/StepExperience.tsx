"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_STEP_SETTINGS, StepApp, type StepDirection } from "./core/StepApp";
import styles from "./step.module.css";

const DIRECTIONS: { value: StepDirection; label: string }[] = [
  { value: "random", label: "Random" }, { value: "right", label: "Left → Right" },
  { value: "left", label: "Right → Left" }, { value: "down", label: "Top → Bottom" },
  { value: "up", label: "Bottom → Top" },
];

export default function StepExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<StepApp | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<StepDirection>("random");
  const [speed, setSpeed] = useState(DEFAULT_STEP_SETTINGS.speed);
  const [paused, setPaused] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let app: StepApp;
    try { app = new StepApp(canvas); appRef.current = app; }
    catch (error) {
      console.error("To step on could not initialize", error);
      const timer = window.setTimeout(() => setUnavailable(true), 0);
      return () => window.clearTimeout(timer);
    }
    return () => { app.destroy(); appRef.current = null; };
  }, []);

  const step = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    appRef.current?.stepAt(event.clientX, event.clientY);
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} onPointerDown={step}
      tabIndex={0} role="button" aria-label="To step on. Click or tap the floor to take one step. Press Enter for a step in the centre."
      onKeyDown={event => {
        if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
        appRef.current?.stepAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }} />
    {unavailable && <p className={styles.error} role="alert">The 3D scene could not start. Please reload with WebGL enabled.</p>}
    <div className={styles.menuRoot}>
      {menuOpen && <div id="step-menu" className={styles.menu}>
        <div className={styles.menuHeader}>
          <span>To step on</span>
          <nav className={styles.links} aria-label="To step on navigation">
            <Link href="/" aria-label="Home"><Home size={16} /></Link>
            <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
          </nav>
        </div>
        <p className={styles.note}>Tap the floor. One step, one trace.</p>
        <section className={styles.section}>
          <h2>Entrance</h2>
          <div className={styles.directions} role="group" aria-label="Step direction">
            {DIRECTIONS.map(choice => <button type="button" key={choice.value} aria-pressed={direction === choice.value}
              onClick={() => { setDirection(choice.value); appRef.current?.setSettings({ direction: choice.value }); }}>{choice.label}</button>)}
          </div>
        </section>
        <section className={styles.section}>
          <h2>Motion</h2>
          <label className={styles.speed}>Speed
            <select aria-label="Motion speed" value={speed} onChange={event => {
              const value = Number(event.target.value); setSpeed(value); appRef.current?.setSettings({ speed: value });
            }}>
              <option value="0.5">0.5×</option><option value="0.75">0.75×</option>
              <option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option>
            </select>
          </label>
          <button type="button" className={styles.action} aria-pressed={paused} onClick={() => {
            setPaused(!paused); appRef.current?.setPaused(!paused);
          }}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume motion" : "Pause motion"}</button>
        </section>
        <section className={styles.section}>
          <h2>Traces</h2>
          <button className={styles.action} type="button" onClick={() => appRef.current?.clearPrints()}><RotateCcw size={14} />Clear footprints</button>
        </section>
      </div>}
      <button type="button" className={styles.menuButton} aria-expanded={menuOpen} aria-controls="step-menu"
        aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>M</button>
    </div>
  </main>;
}
