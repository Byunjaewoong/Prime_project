"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, DEFAULT_PEAK_HOLD, DEFAULT_SHADOW_DEPTH, PaintedRenderer, type LightDirection, type NoiseParams } from "./core/PaintedRenderer";
import LightDirectionSphere from "./LightDirectionSphere";
import styles from "./painted.module.css";

const NOISE_CONTROLS: { key: keyof NoiseParams; label: string; min: number; max: number; step: number }[] = [
  { key: "scale", label: "Noise scale", min: 3, max: 40, step: 1 },
  { key: "octaves", label: "Detail layers", min: 1, max: 6, step: 1 },
  { key: "roughness", label: "Detail strength", min: 0.1, max: 0.85, step: 0.05 },
  { key: "relief", label: "Height / relief", min: 0, max: 15, step: 0.25 },
  { key: "seed", label: "Pattern seed", min: 0, max: 100, step: 1 },
];

const PALETTE = [
  { name: "Slate", hex: "#4d7b95" },
  { name: "Sage", hex: "#7d917d" },
  { name: "Clay", hex: "#987e72" },
  { name: "Lavender", hex: "#817b96" },
  { name: "Steel", hex: "#718998" },
  { name: "Sand", hex: "#9a8b78" },
  { name: "Teal", hex: "#708a83" },
  { name: "Mauve", hex: "#987881" },
  { name: "Indigo", hex: "#788097" },
  { name: "Olive", hex: "#929173" },
  { name: "Stone", hex: "#888b86" },
  { name: "Charcoal", hex: "#626b70" },
] as const;

export default function PaintedExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PaintedRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noise, setNoise] = useState<NoiseParams>(DEFAULT_NOISE);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [shadowDepth, setShadowDepth] = useState(DEFAULT_SHADOW_DEPTH);
  const [lightDirection, setLightDirection] = useState<LightDirection>(DEFAULT_LIGHT_DIRECTION);
  const [playing, setPlaying] = useState(false);
  const [morphSpeed, setMorphSpeed] = useState(1);
  const [peakHold, setPeakHold] = useState(DEFAULT_PEAK_HOLD);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PaintedRenderer(canvas, seed => {
      setNoise(current => ({ ...current, seed }));
    });
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

  const updateColor = (value: string) => {
    setColor(value);
    rendererRef.current?.setColor(value);
  };

  const updateShadowDepth = (value: number) => {
    setShadowDepth(value);
    rendererRef.current?.setShadowDepth(value);
  };

  const updateLightDirection = (direction: LightDirection) => {
    setLightDirection(direction);
    rendererRef.current?.setLightDirection(direction);
  };

  const togglePlaying = () => {
    const next = !playing;
    setPlaying(next);
    rendererRef.current?.setPlaying(next);
  };

  const updateMorphSpeed = (value: number) => {
    setMorphSpeed(value);
    rendererRef.current?.setMorphSpeed(value);
  };

  const updatePeakHold = (value: number) => {
    setPeakHold(value);
    rendererRef.current?.setPeakHold(value);
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
          <span className={styles.sectionTitle}>Evolution</span>
          <button className={styles.playButton} type="button" aria-label={playing ? "Pause noise evolution" : "Play noise evolution"}
            aria-pressed={playing} onClick={togglePlaying}>
            {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
            <span>{playing ? "Pause" : "Play"}</span>
          </button>
          <label className={styles.control}>
            <span className={styles.controlLabel}><span>Change speed</span><output>{morphSpeed.toFixed(2)}×</output></span>
            <input type="range" min={0.1} max={6} step={0.05} value={morphSpeed}
              onChange={event => updateMorphSpeed(Number(event.target.value))} />
          </label>
          <label className={styles.control}>
            <span className={styles.controlLabel}><span>Peak hold</span><output>{peakHold.toFixed(2)}</output></span>
            <input type="range" min={0} max={0.4} step={0.01} value={peakHold}
              onChange={event => updatePeakHold(Number(event.target.value))} />
          </label>
          <span className={styles.sectionTitle}>Appearance</span>
          <div className={styles.control}>
            <span className={styles.controlLabel}><span>Base color</span><output>{color.toUpperCase()}</output></span>
            <div className={styles.palette} role="group" aria-label="Base color">
              {PALETTE.map(choice => <button key={choice.hex} className={styles.paletteOption} type="button"
                aria-label={`${choice.name} ${choice.hex}`} aria-pressed={color === choice.hex}
                onClick={() => updateColor(choice.hex)}>
                <span className={styles.paletteSwatch} style={{ backgroundColor: choice.hex }} aria-hidden="true" />
                <span>{choice.name}</span>
              </button>)}
            </div>
          </div>
          <label className={styles.control}>
            <span className={styles.controlLabel}><span>Shadow depth</span><output>{shadowDepth.toFixed(2)}</output></span>
            <input type="range" min={0} max={2} step={0.05} value={shadowDepth}
              onChange={event => updateShadowDepth(Number(event.target.value))} />
          </label>
          <div className={styles.control}>
            <span className={styles.controlLabel}><span>Light direction</span><span>drag to rotate</span></span>
            <LightDirectionSphere direction={lightDirection} onChange={updateLightDirection} />
            <div className={styles.lightCoordinates} aria-live="off">
              <span>X {lightDirection[0].toFixed(2)}</span>
              <span>Y {lightDirection[1].toFixed(2)}</span>
              <span>Z {lightDirection[2].toFixed(2)}</span>
            </div>
          </div>
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
