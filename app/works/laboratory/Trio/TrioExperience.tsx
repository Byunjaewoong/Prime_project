"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_MASS, MIN_MASS, TrioSimulation } from "./core/TrioSimulation";
import { TrioPlanetRenderer } from "./core/TrioPlanetRenderer";
import styles from "./trio.module.css";

const MASS_CONTROLS = [
  { label: "Green", color: "#81ef00" },
  { label: "Pink", color: "#ff008b" },
  { label: "Blue", color: "#009fff" },
];

export default function TrioExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<TrioSimulation | null>(null);
  const pausedRef = useRef(false);
  const resetViewRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [masses, setMasses] = useState([1, 1, 1]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const simulation = new TrioSimulation();
    const planetRenderer = new TrioPlanetRenderer();
    simulationRef.current = simulation;
    let frame = 0;
    let previousTime = 0;
    let accumulator = 0;
    let cameraExtent = 2.4;
    const timestep = 1 / 480;

    const draw = (now: number) => {
      const elapsed = previousTime ? Math.min(0.05, (now - previousTime) / 1000) : 0;
      previousTime = now;
      if (!pausedRef.current) accumulator += elapsed;
      while (accumulator >= timestep) {
        simulation.step(timestep);
        accumulator -= timestep;
      }
      if (resetViewRef.current) {
        cameraExtent = 2.4;
        accumulator = 0;
        resetViewRef.current = false;
      }

      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = "#000";
      context.fillRect(0, 0, bounds.width, bounds.height);

      let desiredExtent = 1.7;
      for (const body of simulation.bodies) {
        desiredExtent = Math.max(desiredExtent, Math.abs(body.x) * 1.3, Math.abs(body.y) * 1.3);
        for (const point of body.trail) {
          desiredExtent = Math.max(desiredExtent, Math.abs(point.x) * 1.15, Math.abs(point.y) * 1.15);
        }
      }
      cameraExtent += (desiredExtent - cameraExtent) * (1 - Math.exp(-elapsed * 3));
      // Fit all three bodies, including an escaping one, without changing the physics.
      const scale = Math.min(bounds.width, bounds.height) * 0.42 / Math.max(cameraExtent, desiredExtent * 0.88);
      const screenX = (x: number) => bounds.width * 0.5 + x * scale;
      const screenY = (y: number) => bounds.height * 0.5 + y * scale;
      context.lineCap = "round";
      context.lineJoin = "round";

      for (const [bodyIndex, body] of simulation.bodies.entries()) {
        context.strokeStyle = body.color;
        context.shadowColor = body.color;
        for (let band = 0; band < 8; band += 1) {
          const first = Math.floor(band / 8 * body.trail.length);
          const last = Math.min(body.trail.length - 1, Math.ceil((band + 1) / 8 * body.trail.length));
          if (last <= first) continue;
          context.beginPath();
          context.moveTo(screenX(body.trail[first].x), screenY(body.trail[first].y));
          for (let index = first + 1; index <= last; index += 1) {
            context.lineTo(screenX(body.trail[index].x), screenY(body.trail[index].y));
          }
          if (band === 7) context.lineTo(screenX(body.x), screenY(body.y));
          context.globalAlpha = 0.06 + ((band + 1) / 8) ** 1.6 * 0.72;
          context.shadowBlur = 7;
          context.lineWidth = 1.15;
          context.stroke();
        }

        const x = screenX(body.x);
        const y = screenY(body.y);
        context.shadowBlur = 0;
        context.globalAlpha = 1;
        const glow = context.createRadialGradient(x, y, 1, x, y, 22);
        glow.addColorStop(0, body.color + "70");
        glow.addColorStop(1, body.color + "00");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, 22, 0, Math.PI * 2);
        context.fill();
        const radius = Math.max(10, Math.min(15, Math.min(bounds.width, bounds.height) * 0.027));
        planetRenderer.draw(context, body, bodyIndex, x, y, radius, ratio);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      simulationRef.current = null;
    };
  }, []);

  const togglePaused = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const updateMass = (index: number, mass: number) => {
    simulationRef.current?.setMass(index, mass);
    setMasses(previous => previous.map((value, bodyIndex) => bodyIndex === index ? mass : value));
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="Three gravitational bodies with green, pink and blue orbit trails" />
    <div className={styles.menuRoot}>
      {menuOpen && <div className={styles.menu}>
        <div className={styles.menuHeader}>
          <span>Trio</span>
          <div className={styles.menuLinks}>
            <Link href="/" aria-label="Home"><Home size={16} /></Link>
            <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
          </div>
        </div>
        <div className={styles.massSection}>
          <span className={styles.sectionTitle}>Mass</span>
          {MASS_CONTROLS.map((control, index) => <label className={styles.massControl} key={control.label}>
            <span className={styles.massLabel}>
              <span className={styles.massName}><span className={styles.colorDot} style={{ backgroundColor: control.color }} />{control.label}</span>
              <output>{masses[index].toFixed(2)}</output>
            </span>
            <input type="range" min={MIN_MASS} max={MAX_MASS} step="0.05" value={masses[index]}
              aria-label={`${control.label} body mass`} style={{ accentColor: control.color }}
              onChange={event => updateMass(index, Number(event.target.value))} />
          </label>)}
        </div>
        <button className={styles.action} type="button" onClick={togglePaused}>
          <span>{paused ? "Resume" : "Pause"}</span>{paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button className={styles.action} type="button" onClick={() => { simulationRef.current?.reset(); resetViewRef.current = true; }}>
          <span>Randomize</span><RotateCcw size={15} />
        </button>
      </div>}
      <button className={`${styles.menuButton} ${menuOpen ? styles.active : ""}`} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
