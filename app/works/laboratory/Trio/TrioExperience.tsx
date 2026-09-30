"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BODY_COLORS, MAX_BODY_COUNT, MAX_MASS, MIN_BODY_COUNT, MIN_MASS, TrioSimulation } from "./core/TrioSimulation";
import { TrioPlanetRenderer } from "./core/TrioPlanetRenderer";
import styles from "./trio.module.css";

const INITIAL_CAMERA_EXTENT = 2.4;
const trailAlpha = (progress: number) => 0.04 + Math.pow(progress, 1.6) * 0.74;
const colorWithAlpha = (color: string, alpha: number) =>
  `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;

export default function TrioExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<TrioSimulation | null>(null);
  const pausedRef = useRef(false);
  const resetViewRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [bodyCount, setBodyCount] = useState(3);
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
    let cameraExtent = INITIAL_CAMERA_EXTENT;
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
        cameraExtent = INITIAL_CAMERA_EXTENT;
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
      // Fit every body, including an escaping one, without changing the physics.
      const shortEdge = Math.max(1, Math.min(bounds.width, bounds.height));
      const scale = shortEdge * 0.42 / Math.max(cameraExtent, desiredExtent * 0.88);
      const referenceScale = shortEdge * 0.42 / INITIAL_CAMERA_EXTENT;
      const worldRadius = Math.max(10, Math.min(15, shortEdge * 0.027)) / referenceScale;
      const planetRadius = worldRadius * scale;
      const screenX = (x: number) => bounds.width * 0.5 + x * scale;
      const screenY = (y: number) => bounds.height * 0.5 + y * scale;
      context.lineCap = "round";
      context.lineJoin = "round";

      for (const [bodyIndex, body] of simulation.bodies.entries()) {
        context.strokeStyle = body.color;
        context.shadowColor = body.color;
        context.globalAlpha = 0.06;
        context.shadowBlur = 7;
        context.lineWidth = 1.15;
        context.beginPath();
        context.moveTo(screenX(body.trail[0].x), screenY(body.trail[0].y));
        for (let index = 1; index < body.trail.length; index += 1) {
          context.lineTo(screenX(body.trail[index].x), screenY(body.trail[index].y));
        }
        context.lineTo(screenX(body.x), screenY(body.y));
        context.stroke();

        context.globalAlpha = 1;
        context.shadowBlur = 0;
        context.lineCap = "butt";
        for (let first = 0; first < body.trail.length; first += 8) {
          const last = Math.min(body.trail.length - 1, first + 8);
          const start = body.trail[first];
          const end = last === body.trail.length - 1 ? body : body.trail[last];
          const startX = screenX(start.x);
          const startY = screenY(start.y);
          const endX = screenX(end.x);
          const endY = screenY(end.y);
          const gradient = context.createLinearGradient(
            startX, startY,
            Math.abs(endX - startX) + Math.abs(endY - startY) < 0.001 ? startX + 1 : endX,
            endY
          );
          gradient.addColorStop(0, colorWithAlpha(body.color, trailAlpha(first / body.trail.length)));
          gradient.addColorStop(1, colorWithAlpha(body.color, trailAlpha(last === body.trail.length - 1 ? 1 : last / body.trail.length)));
          context.strokeStyle = gradient;
          context.beginPath();
          context.moveTo(startX, startY);
          for (let index = first + 1; index <= last; index += 1) {
            context.lineTo(screenX(body.trail[index].x), screenY(body.trail[index].y));
          }
          if (last === body.trail.length - 1) context.lineTo(endX, endY);
          context.stroke();
        }
        context.lineCap = "round";

        const x = screenX(body.x);
        const y = screenY(body.y);
        context.shadowBlur = 0;
        context.globalAlpha = 1;
        const glowRadius = planetRadius * 2.2;
        const glow = context.createRadialGradient(x, y, glowRadius * 0.05, x, y, glowRadius);
        glow.addColorStop(0, body.color + "70");
        glow.addColorStop(1, body.color + "00");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, glowRadius, 0, Math.PI * 2);
        context.fill();
        planetRenderer.draw(context, body, bodyIndex, x, y, planetRadius, ratio);
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

  const updateBodyCount = (count: number) => {
    const simulation = simulationRef.current;
    simulation?.setBodyCount(count);
    setBodyCount(count);
    setMasses(simulation?.bodies.map(body => body.mass) ?? Array.from({ length: count }, () => 1));
    resetViewRef.current = true;
  };

  return <main className={styles.page}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label={`${bodyCount} gravitational bodies with colored orbit trails`} />
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
          <label className={styles.massControl}>
            <span className={styles.massLabel}><span>Bodies</span><output>{bodyCount}</output></span>
            <input type="range" min={MIN_BODY_COUNT} max={MAX_BODY_COUNT} step="1" value={bodyCount}
              aria-label="Number of bodies" onChange={event => updateBodyCount(Number(event.target.value))} />
          </label>
          <span className={styles.sectionTitle}>Mass</span>
          {masses.map((mass, index) => <label className={styles.massControl} key={index}>
            <span className={styles.massLabel}>
              <span className={styles.massName}><span className={styles.colorDot} style={{ backgroundColor: BODY_COLORS[index] }} />Body {index + 1}</span>
              <output>{mass.toFixed(2)}</output>
            </span>
            <input type="range" min={MIN_MASS} max={MAX_MASS} step="0.05" value={mass}
              aria-label={`Body ${index + 1} mass`} style={{ accentColor: BODY_COLORS[index] }}
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
