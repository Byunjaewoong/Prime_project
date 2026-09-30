"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_NOISE, PaintedRenderer, type NoiseParams } from "./core/PaintedRenderer";
import styles from "./painted.module.css";

const NOISE_CONTROLS: { key: keyof NoiseParams; label: string; min: number; max: number; step: number }[] = [
  { key: "scale", label: "Noise scale", min: 3, max: 40, step: 1 },
  { key: "octaves", label: "Detail layers", min: 1, max: 6, step: 1 },
  { key: "roughness", label: "Detail strength", min: 0.1, max: 0.85, step: 0.05 },
  { key: "relief", label: "Height / relief", min: 0, max: 15, step: 0.25 },
  { key: "seed", label: "Pattern seed", min: 0, max: 100, step: 1 },
];

export default function PaintedExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PaintedRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noise, setNoise] = useState<NoiseParams>(DEFAULT_NOISE);

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

  const updateNoise = (key: keyof NoiseParams, value: number) => {
    setNoise(current => ({ ...current, [key]: value }));
    rendererRef.current?.setNoise({ [key]: value });
  };

  return <main className={styles.page}>
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      role="img"
      aria-label="Single-color painted surface shaded by a Perlin-noise height field."
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
          <span className={styles.sectionTitle}>Perlin surface</span>
          {NOISE_CONTROLS.map(control => <label className={styles.control} key={control.key}>
            <span className={styles.controlLabel}><span>{control.label}</span><output>{noise[control.key].toFixed(control.step >= 1 ? 0 : 2)}</output></span>
            <input type="range" min={control.min} max={control.max} step={control.step} value={noise[control.key]}
              onChange={event => updateNoise(control.key, Number(event.target.value))} />
          </label>)}
        </div>
      </div>}
      <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
