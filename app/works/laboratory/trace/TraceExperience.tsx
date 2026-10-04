"use client";

import Link from "next/link";
import { FlaskConical, Home, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  DEFAULT_INSIDE_NOISE, DEFAULT_LAYER2_NOISE, DEFAULT_LAYER3_NOISE,
  DEFAULT_LAYER_DEPTH, DEFAULT_LAYER_SHADOW, type ImpressionLayer,
} from "../Foot-print/core/FootPrintRenderer";
import LightDirectionSphere from "../Painted/LightDirectionSphere";
import {
  DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, DEFAULT_SHADOW_DEPTH,
  PaintedRenderer, type LightDirection, type NoiseParams,
} from "../Painted/core/PaintedRenderer";
import { PAINTED_NOISE_CONTROLS } from "../Painted/noiseControls";
import { SOLE_FAMILIES } from "../sole/core/generateSole";
import type { ProductTread } from "../sole/core/productTreads";
import { DEFAULT_STEP_SETTINGS, StepApp, type StepDirection } from "../to-step-on/core/StepApp";
import { DEFAULT_WALL_NOISE, TracePrintRenderer, type TraceShape } from "./core/TracePrintRenderer";
import stepStyles from "../to-step-on/step.module.css";
import styles from "./trace.module.css";

const DIRECTIONS: { value: StepDirection; label: string }[] = [
  { value: "random", label: "Random" }, { value: "right", label: "Left → Right" },
  { value: "left", label: "Right → Left" }, { value: "down", label: "Top → Bottom" },
  { value: "up", label: "Bottom → Top" },
];
const LAYERS = ["layer1", "layer2", "layer3"] as const;
type SurfaceTab = "outside" | "wall" | ImpressionLayer;
const SURFACE_TABS: { value: SurfaceTab; label: string }[] = [
  { value: "outside", label: "Outside" }, { value: "layer1", label: "Layer 1" },
  { value: "layer2", label: "Layer 2" }, { value: "layer3", label: "Layer 3" },
  { value: "wall", label: "Wall" },
];
const SHAPES: { value: TraceShape; label: string }[] = [
  { value: "shoe", label: "Shoe" }, { value: "circle", label: "Circle" },
  { value: "square", label: "Square" }, { value: "triangle", label: "Triangle" },
];

export default function TraceExperience() {
  const snowCanvas = useRef<HTMLCanvasElement>(null);
  const printCanvas = useRef<HTMLCanvasElement>(null);
  const stepCanvas = useRef<HTMLCanvasElement>(null);
  const snowRef = useRef<PaintedRenderer | null>(null);
  const printsRef = useRef<TracePrintRenderer | null>(null);
  const stepRef = useRef<StepApp | null>(null);
  const lastProduct = useRef<ProductTread | null>(null);
  const stampOptions = useRef<{ shape: TraceShape; size: number; edgeLayer3: boolean }>({
    shape: "shoe", size: 36, edgeLayer3: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [direction, setDirection] = useState<StepDirection>("random");
  const [speed, setSpeed] = useState(DEFAULT_STEP_SETTINGS.speed);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(0);
  const [currentProduct, setCurrentProduct] = useState<ProductTread | null>(null);
  const [shape, setShape] = useState<TraceShape>("shoe");
  const [shoeScale, setShoeScale] = useState(1);
  const [size, setSize] = useState(36);
  const [edgeLayer3, setEdgeLayer3] = useState(false);
  const [surfaceTab, setSurfaceTab] = useState<SurfaceTab>("layer1");
  const [depth, setDepth] = useState({ ...DEFAULT_LAYER_DEPTH });
  const [layerShadow, setLayerShadow] = useState({ ...DEFAULT_LAYER_SHADOW });
  const [layerNoise, setLayerNoise] = useState<Record<ImpressionLayer, NoiseParams>>({
    layer1: { ...DEFAULT_INSIDE_NOISE }, layer2: { ...DEFAULT_LAYER2_NOISE }, layer3: { ...DEFAULT_LAYER3_NOISE },
  });
  const [layerColor, setLayerColor] = useState<Record<ImpressionLayer, string>>({
    layer1: DEFAULT_COLOR, layer2: DEFAULT_COLOR, layer3: DEFAULT_COLOR,
  });
  const [outsideNoise, setOutsideNoise] = useState<NoiseParams>({ ...DEFAULT_NOISE });
  const [wallNoise, setWallNoise] = useState<NoiseParams>({ ...DEFAULT_WALL_NOISE });
  const [edgeIrregularity, setEdgeIrregularity] = useState(1);
  const [outsideColor, setOutsideColor] = useState(DEFAULT_COLOR);
  const [outsideShadow, setOutsideShadow] = useState(DEFAULT_SHADOW_DEPTH);
  const [lightDirection, setLightDirection] = useState<LightDirection>([...DEFAULT_LIGHT_DIRECTION]);
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
        printsRef.current?.stamp(contact, product, 394, stampOptions.current);
        setCount(printsRef.current?.count ?? 0);
      }, {
        transparentBackground: true, renderPrints: false,
        onSoleReady: silhouette => printsRef.current?.setSoleMask(silhouette),
      });
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

  const updateNoise = (key: keyof NoiseParams, value: number) => {
    if (surfaceTab === "outside") {
      setOutsideNoise(current => ({ ...current, [key]: value }));
      snowRef.current?.setNoise({ [key]: value });
    } else if (surfaceTab === "wall") {
      setWallNoise(current => ({ ...current, [key]: value }));
      printsRef.current?.setWallNoise({ [key]: value });
    } else {
      const layer = surfaceTab;
      setLayerNoise(current => ({ ...current, [layer]: { ...current[layer], [key]: value } }));
      printsRef.current?.setNoise(layer, { [key]: value });
    }
  };
  const updateColor = (value: string) => {
    if (surfaceTab === "outside") {
      setOutsideColor(value); snowRef.current?.setColor(value);
    } else if (surfaceTab !== "wall") {
      const layer = surfaceTab;
      setLayerColor(current => ({ ...current, [layer]: value }));
      printsRef.current?.setColor(layer, value);
    }
  };
  const updateShadow = (value: number) => {
    if (surfaceTab === "outside") {
      setOutsideShadow(value); snowRef.current?.setShadowDepth(value);
    } else if (surfaceTab !== "wall") {
      const layer = surfaceTab;
      setLayerShadow(current => ({ ...current, [layer]: value }));
      printsRef.current?.setShadow(layer, value);
    }
  };
  const updateLight = (direction: LightDirection) => {
    setLightDirection(direction);
    snowRef.current?.setLightDirection(direction);
    printsRef.current?.setLightDirection(direction);
  };
  const selectedNoise = surfaceTab === "outside" ? outsideNoise : surfaceTab === "wall" ? wallNoise : layerNoise[surfaceTab];
  const selectedColor = surfaceTab === "outside" ? outsideColor : surfaceTab === "wall" ? null : layerColor[surfaceTab];
  const selectedShadow = surfaceTab === "outside" ? outsideShadow : surfaceTab === "wall" ? null : layerShadow[surfaceTab];

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
          <span className={styles.controlTitle}>Impression shape</span>
          <div className={styles.choices} role="group" aria-label="Impression shape">
            {SHAPES.map(choice => <button key={choice.value} type="button" aria-pressed={shape === choice.value}
              onClick={() => {
                stampOptions.current.shape = choice.value; setShape(choice.value);
              }}>{choice.label}</button>)}
          </div>
          <p className={stepStyles.note}>The shoe and its imprint share one scale. Changes during a step apply to the next step.</p>
          <label className={styles.rangeControl}>
            <span>Shoe &amp; footprint size <output>{shoeScale.toFixed(2)}×</output></span>
            <input type="range" aria-label="Shoe and footprint size" min="0.2" max="1.5" step="0.05"
              value={shoeScale} onChange={event => {
                const value = Number(event.target.value);
                setShoeScale(value); stepRef.current?.setShoeScale(value);
              }} />
          </label>
          <label className={styles.rangeControl}>
            <span>Other shape size <output>{size}</output></span>
            <input type="range" aria-label="Impression size" min="18" max="80" step="1" value={size} disabled={shape === "shoe"}
              onChange={event => {
                const value = Number(event.target.value);
                stampOptions.current.size = value; setSize(value);
              }} />
          </label>
          <button className={styles.edgeButton} type="button" aria-pressed={edgeLayer3}
            onClick={() => {
              stampOptions.current.edgeLayer3 = !edgeLayer3;
              setEdgeLayer3(!edgeLayer3);
            }}>Layer 3 on outer edge · {edgeLayer3 ? "On" : "Off"}</button>
          {LAYERS.map((layer, index) => <div className={styles.layerControl} key={layer}>
            <label>Layer {index + 1} depth <output>{depth[layer]}</output>
              <input type="range" aria-label={`Layer ${index + 1} depth`} min="2" max="25" step="1" value={depth[layer]}
                onChange={event => {
                  const value = Number(event.target.value);
                  setDepth(current => ({ ...current, [layer]: value })); printsRef.current?.setDepth(layer, value);
                }} />
            </label>
          </div>)}
        </section>
        <section className={stepStyles.section}>
          <h2>Surface texture</h2>
          <div className={styles.surfaceTabs} role="tablist" aria-label="Surface texture area">
            {SURFACE_TABS.map(tab => <button key={tab.value} type="button" role="tab"
              aria-selected={surfaceTab === tab.value} aria-controls="trace-surface-controls"
              onClick={() => setSurfaceTab(tab.value)}>{tab.label}</button>)}
          </div>
          <div id="trace-surface-controls" className={styles.surfaceControls} role="tabpanel"
            aria-label={`${SURFACE_TABS.find(tab => tab.value === surfaceTab)?.label} texture controls`}>
            {surfaceTab === "wall" && <>
              <p className={stepStyles.note}>Adjust only the sloped edge of existing and future impressions.</p>
              <label className={styles.rangeControl}>
                <span>Edge irregularity <output>{edgeIrregularity.toFixed(2)}</output></span>
                <input type="range" aria-label="Wall edge irregularity" min="0" max="2" step="0.05"
                  value={edgeIrregularity} onChange={event => {
                    const value = Number(event.target.value);
                    setEdgeIrregularity(value); printsRef.current?.setEdgeIrregularity(value);
                  }} />
              </label>
            </>}
            {selectedColor !== null && <label className={styles.colorPicker}>Base color
              <input type="color" aria-label={`${surfaceTab} base color`} value={selectedColor}
                onChange={event => updateColor(event.target.value)} />
            </label>}
            {selectedShadow !== null && <label className={styles.rangeControl}>
              <span>Shadow depth <output>{selectedShadow.toFixed(2)}</output></span>
              <input type="range" aria-label={`${surfaceTab} shadow depth`} min="0" max="2" step="0.05"
                value={selectedShadow} onChange={event => updateShadow(Number(event.target.value))} />
            </label>}
            {PAINTED_NOISE_CONTROLS.map(control => <label className={styles.rangeControl} key={control.key}>
              <span>{control.label}
                <output>{selectedNoise[control.key].toFixed(control.step >= 1 ? 0 : 2)}</output></span>
              <input type="range" aria-label={`${surfaceTab} ${control.label}`} min={control.min}
                max={control.max} step={control.step} value={selectedNoise[control.key]}
                onChange={event => updateNoise(control.key, Number(event.target.value))} />
            </label>)}
          </div>
        </section>
        <section className={stepStyles.section}>
          <h2>Light</h2>
          <p className={stepStyles.note}>Drag to rotate the light on snow and impressions.</p>
          <div className={styles.lightControl}>
            <LightDirectionSphere direction={lightDirection} onChange={updateLight} />
            <div className={styles.lightCoordinates}>
              <span>X {lightDirection[0].toFixed(2)}</span>
              <span>Y {lightDirection[1].toFixed(2)}</span>
              <span>Z {lightDirection[2].toFixed(2)}</span>
            </div>
          </div>
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
