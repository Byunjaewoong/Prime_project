"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_GRAIN, PaintedRenderer, type GrainParams } from "./core/PaintedRenderer";
import styles from "./painted.module.css";

const GRAIN_CONTROLS: { key: keyof GrainParams; label: string; min: number; max: number; step: number }[] = [
  { key: "size", label: "Grain size", min: 0.45, max: 2.2, step: 0.05 },
  { key: "density", label: "Density", min: 0.35, max: 2.5, step: 0.05 },
  { key: "contrast", label: "Relief", min: 0, max: 2.2, step: 0.05 },
  { key: "flow", label: "Direction variation", min: 0, max: 2, step: 0.05 },
];

export default function PaintedExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PaintedRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [grain, setGrain] = useState<GrainParams>(DEFAULT_GRAIN);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PaintedRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const updateGrain = (key: keyof GrainParams, value: number) => {
    setGrain(current => ({ ...current, [key]: value }));
    rendererRef.current?.setGrain({ [key]: value });
  };

  return <main className={styles.page}>
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      role="button"
      tabIndex={0}
      aria-label="Painted texture. Click, tap, or press Enter to change its color."
      onClick={() => rendererRef.current?.changeColor()}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          rendererRef.current?.changeColor();
        }
      }}
    />
    <div className={styles.menuRoot}>
      {menuOpen && <div className={styles.menu}>
        <div className={styles.menuHeader}>
          <span>Painted</span>
          <nav className={styles.menuLinks} aria-label="Painted navigation">
            <Link href="/" aria-label="Home"><Home size={16} /></Link>
            <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
          </nav>
        </div>
        <div className={styles.controls}>
          <span className={styles.sectionTitle}>Grain</span>
          {GRAIN_CONTROLS.map(control => <label className={styles.control} key={control.key}>
            <span className={styles.controlLabel}><span>{control.label}</span><output>{grain[control.key].toFixed(2)}</output></span>
            <input type="range" min={control.min} max={control.max} step={control.step} value={grain[control.key]}
              onChange={event => updateGrain(control.key, Number(event.target.value))} />
          </label>)}
        </div>
      </div>}
      <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
