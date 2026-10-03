"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW } from "../Foot-print/core/FootPrintRenderer";
import { PaintedRenderer } from "../Painted/core/PaintedRenderer";
import { SOLE_FAMILIES } from "../sole/core/generateSole";
import type { ProductTread } from "../sole/core/productTreads";
import { DEFAULT_STEP_SETTINGS, StepApp, type StepDirection } from "../to-step-on/core/StepApp";
import { TracePrintRenderer } from "./core/TracePrintRenderer";
import stepStyles from "../to-step-on/step.module.css";
import styles from "./trace.module.css";

const DIRECTIONS: { value: StepDirection; label: string }[] = [
  { value: "random", label: "Random" }, { value: "right", label: "Left → Right" },
  { value: "left", label: "Right → Left" }, { value: "down", label: "Top → Bottom" },
  { value: "up", label: "Bottom → Top" },
];
const LAYERS = ["layer1", "layer2"] as const;

export default function TraceExperience() {
  const snowCanvas = useRef<HTMLCanvasElement>(null);
  const printCanvas = useRef<HTMLCanvasElement>(null);
  const stepCanvas = useRef<HTMLCanvasElement>(null);
  const snowRef = useRef<PaintedRenderer | null>(null);
  const printsRef = useRef<TracePrintRenderer | null>(null);
  const stepRef = useRef<StepApp | null>(null);
  const lastProduct = useRef<ProductTread | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<StepDirection>("random");
  const [speed, setSpeed] = useState(DEFAULT_STEP_SETTINGS.speed);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(0);
  const [currentProduct, setCurrentProduct] = useState<ProductTread | null>(null);
  const [depth, setDepth] = useState({ layer1: DEFAULT_LAYER_DEPTH.layer1, layer2: DEFAULT_LAYER_DEPTH.layer2 });
  const [shadow, setShadow] = useState({ layer1: DEFAULT_LAYER_SHADOW.layer1, layer2: DEFAULT_LAYER_SHADOW.layer2 });
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!snowCanvas.current || !printCanvas.current || !stepCanvas.current) return;
    let snow: PaintedRenderer | null = null;
    let prints: TracePrintRenderer | null = null;
    let step: StepApp | null = null;
    try {
      snow = new PaintedRenderer(snowCanvas.current);
      prints = new TracePrintRenderer(printCanvas.current);
      snowRef.current = snow;
      printsRef.current = prints;
      step = new StepApp(stepCanvas.current, contact => {
        const options = SOLE_FAMILIES.filter(option => option.value !== lastProduct.current);
        const product = options[Math.floor(Math.random() * options.length)].value;
        lastProduct.current = product;
        setCurrentProduct(product);
        printsRef.current?.stamp(contact, product, 394);
        setCount(printsRef.current?.count ?? 0);
      }, { transparentBackground: true, renderPrints: false });
      stepRef.current = step;
    } catch (error) {
      console.error("Trace could not initialize", error);
      const timer = window.setTimeout(() => setUnavailable(true), 0);
      step?.destroy(); prints?.destroy(); snow?.destroy();
      return () => window.clearTimeout(timer);
    }
    return () => {
      step?.destroy(); prints?.destroy(); snow?.destroy();
      stepRef.current = null; printsRef.current = null; snowRef.current = null;
    };
  }, []);

  const plant = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    stepRef.current?.stepAt(event.clientX, event.clientY);
  };

  return <main className={styles.page}>
    <canvas ref={snowCanvas} className={styles.snow} aria-hidden="true" />
    <canvas ref={printCanvas} className={styles.prints} aria-hidden="true" data-print-count={count} data-product={currentProduct ?? ""} />
    <canvas ref={stepCanvas} className={styles.step} onPointerDown={plant} tabIndex={0} role="button"
      aria-label="Trace. Click or tap the snow to take one step. Press Enter to step in the centre."
      onKeyDown={event => {
        if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        stepRef.current?.stepAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }} />
    {unavailable && <p className={stepStyles.error} role="alert">The scene could not start. Please reload with WebGL enabled.</p>}
    <div className={stepStyles.menuRoot}>
      {menuOpen && <div id="trace-menu" className={stepStyles.menu}>
        <div className={stepStyles.menuHeader}>
          <span>Trace</span>
          <nav className={stepStyles.links} aria-label="Trace navigation">
            <Link href="/" aria-label="Home"><Home size={16} /></Link>
            <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
          </nav>
        </div>
        <p className={stepStyles.note}>One shoe. A different sole pattern with every step.</p>
        <section className={stepStyles.section}>
          <h2>Entrance</h2>
          <div className={stepStyles.directions} role="group" aria-label="Step direction">
            {DIRECTIONS.map(choice => <button type="button" key={choice.value} aria-pressed={direction === choice.value}
              onClick={() => { setDirection(choice.value); stepRef.current?.setSettings({ direction: choice.value }); }}>{choice.label}</button>)}
          </div>
        </section>
        <section className={stepStyles.section}>
          <h2>Motion</h2>
          <label className={stepStyles.speed}>Speed
            <select aria-label="Motion speed" value={speed} onChange={event => {
              const value = Number(event.target.value); setSpeed(value); stepRef.current?.setSettings({ speed: value });
            }}>
              <option value="0.5">0.5×</option><option value="0.75">0.75×</option>
              <option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option>
            </select>
          </label>
          <button type="button" className={stepStyles.action} aria-pressed={paused} onClick={() => {
            setPaused(!paused); stepRef.current?.setPaused(!paused);
          }}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume motion" : "Pause motion"}</button>
        </section>
        <section className={stepStyles.section}>
          <h2>Snow impression</h2>
          {LAYERS.map((layer, index) => <div className={styles.layerControl} key={layer}>
            <label>Layer {index + 1} depth <output>{depth[layer]}</output>
              <input type="range" aria-label={`Layer ${index + 1} depth`} min="0" max="25" step="1" value={depth[layer]}
                onChange={event => {
                  const value = Number(event.target.value);
                  setDepth(current => ({ ...current, [layer]: value })); printsRef.current?.setDepth(layer, value);
                }} />
            </label>
            <label>Shadow depth <output>{shadow[layer].toFixed(2)}</output>
              <input type="range" aria-label={`Layer ${index + 1} shadow depth`} min="0" max="2" step="0.05" value={shadow[layer]}
                onChange={event => {
                  const value = Number(event.target.value);
                  setShadow(current => ({ ...current, [layer]: value })); printsRef.current?.setShadow(layer, value);
                }} />
            </label>
          </div>)}
        </section>
        <section className={stepStyles.section}>
          <h2>Traces · {count}</h2>
          {currentProduct && <p className={stepStyles.note}>Last sole: {SOLE_FAMILIES.find(option => option.value === currentProduct)?.label}</p>}
          <button className={stepStyles.action} type="button" onClick={() => {
            printsRef.current?.clear(); setCount(0);
          }}><RotateCcw size={14} />Clear footprints</button>
        </section>
      </div>}
      <button type="button" className={stepStyles.menuButton} aria-expanded={menuOpen} aria-controls="trace-menu"
        aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>M</button>
    </div>
  </main>;
}
