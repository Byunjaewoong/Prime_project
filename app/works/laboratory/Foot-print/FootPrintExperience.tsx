"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import DragOnlyRange from "../Painted/DragOnlyRange";
import LightDirectionSphere from "../Painted/LightDirectionSphere";
import { DEFAULT_COLOR, DEFAULT_LIGHT_DIRECTION, DEFAULT_NOISE, DEFAULT_SHADOW_DEPTH, PaintedRenderer, type LightDirection, type NoiseParams } from "../Painted/core/PaintedRenderer";
import { PAINTED_NOISE_CONTROLS } from "../Painted/noiseControls";
import { DEFAULT_INSIDE_NOISE, DEFAULT_INSIDE_SHADOW_DEPTH, DEFAULT_LAYER2_NOISE, FootPrintRenderer, type FootPrintShape, type ImpressionLayer } from "./core/FootPrintRenderer";
import paintedStyles from "../Painted/painted.module.css";
import styles from "./footprint.module.css";

const SHAPES: { value: FootPrintShape; label: string }[] = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
];

type SurfaceTab = "outside" | ImpressionLayer;
const SURFACE_TABS: { value: SurfaceTab; label: string }[] = [
  { value: "outside", label: "Outside" },
  { value: "layer1", label: "Layer 1" },
  { value: "layer2", label: "Layer 2" },
];

export default function FootPrintExperience() {
  const snowCanvasRef = useRef<HTMLCanvasElement>(null);
  const printCanvasRef = useRef<HTMLCanvasElement>(null);
  const snowRef = useRef<PaintedRenderer | null>(null);
  const printsRef = useRef<FootPrintRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shape, setShape] = useState<FootPrintShape>("circle");
  const [size, setSize] = useState(36);
  const [depth, setDepth] = useState(4);
  const [impressionLayer, setImpressionLayer] = useState<ImpressionLayer>("layer1");
  const [surfaceTab, setSurfaceTab] = useState<SurfaceTab>("layer1");
  const [outsideNoise, setOutsideNoise] = useState<NoiseParams>(DEFAULT_NOISE);
  const [layerNoise, setLayerNoise] = useState<Record<ImpressionLayer, NoiseParams>>({
    layer1: DEFAULT_INSIDE_NOISE,
    layer2: DEFAULT_LAYER2_NOISE,
  });
  const [outsideColor, setOutsideColor] = useState(DEFAULT_COLOR);
  const [layerColor, setLayerColor] = useState<Record<ImpressionLayer, string>>({ layer1: DEFAULT_COLOR, layer2: DEFAULT_COLOR });
  const [outsideShadow, setOutsideShadow] = useState(DEFAULT_SHADOW_DEPTH);
  const [layerShadow, setLayerShadow] = useState<Record<ImpressionLayer, number>>({
    layer1: DEFAULT_INSIDE_SHADOW_DEPTH,
    layer2: DEFAULT_INSIDE_SHADOW_DEPTH,
  });
  const [lightDirection, setLightDirection] = useState<LightDirection>(DEFAULT_LIGHT_DIRECTION);

  useEffect(() => {
    const snowCanvas = snowCanvasRef.current;
    const printCanvas = printCanvasRef.current;
    if (!snowCanvas || !printCanvas) return;
    const snow = new PaintedRenderer(snowCanvas);
    const prints = new FootPrintRenderer(printCanvas);
    snowRef.current = snow;
    printsRef.current = prints;
    return () => {
      snow.destroy();
      prints.destroy();
      snowRef.current = null;
      printsRef.current = null;
    };
  }, []);

  const pressSnow = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    printsRef.current?.stamp(event.clientX - rect.left, event.clientY - rect.top, shape, size, depth, impressionLayer);
  };

  const updateLightDirection = (direction: LightDirection) => {
    setLightDirection(direction);
    snowRef.current?.setLightDirection(direction);
    printsRef.current?.setLightDirection(direction);
  };

  const updateNoise = (key: keyof NoiseParams, value: number) => {
    if (surfaceTab === "outside") {
      setOutsideNoise(current => ({ ...current, [key]: value }));
      snowRef.current?.setNoise({ [key]: value });
    } else {
      setLayerNoise(current => ({ ...current, [surfaceTab]: { ...current[surfaceTab], [key]: value } }));
      printsRef.current?.setNoise(surfaceTab, { [key]: value });
    }
  };

  const updateColor = (value: string) => {
    if (surfaceTab === "outside") {
      setOutsideColor(value);
      snowRef.current?.setColor(value);
    } else {
      setLayerColor(current => ({ ...current, [surfaceTab]: value }));
      printsRef.current?.setColor(surfaceTab, value);
    }
  };

  const updateShadow = (value: number) => {
    if (surfaceTab === "outside") {
      setOutsideShadow(value);
      snowRef.current?.setShadowDepth(value);
    } else {
      setLayerShadow(current => ({ ...current, [surfaceTab]: value }));
      printsRef.current?.setShadowDepth(surfaceTab, value);
    }
  };

  const selectedNoise = surfaceTab === "outside" ? outsideNoise : layerNoise[surfaceTab];
  const selectedColor = surfaceTab === "outside" ? outsideColor : layerColor[surfaceTab];
  const selectedShadow = surfaceTab === "outside" ? outsideShadow : layerShadow[surfaceTab];
  const selectedSurfaceLabel = SURFACE_TABS.find(tab => tab.value === surfaceTab)?.label ?? "Outside";

  return <main className={paintedStyles.page}>
    <canvas ref={snowCanvasRef} className={paintedStyles.canvas} aria-hidden="true" />
    <canvas ref={printCanvasRef} className={styles.printCanvas} onPointerDown={pressSnow}
      role="img" aria-label="Snow surface. Tap or click to press the selected shape into the snow." />
    <div className={paintedStyles.menuRoot}>
      {menuOpen && <div className={paintedStyles.menu}>
        <div className={paintedStyles.menuHeader}>
          <span>Foot print</span>
          <nav className={paintedStyles.menuLinks} aria-label="Foot print navigation">
            <Link href="/" aria-label="Home"><Home size={16} /></Link>
            <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
          </nav>
        </div>
        <div className={paintedStyles.controls}>
          <span className={paintedStyles.sectionTitle}>Impression</span>
          <div className={styles.shapeChoices} role="group" aria-label="Impression shape">
            {SHAPES.map(choice => <button key={choice.value} type="button" className={styles.shapeChoice}
              aria-pressed={shape === choice.value} onClick={() => setShape(choice.value)}>{choice.label}</button>)}
          </div>
          <div className={paintedStyles.control}>
            <span className={paintedStyles.controlLabel}>Interior texture</span>
            <div className={styles.layerChoices} role="group" aria-label="Impression interior texture">
              {(["layer1", "layer2"] as const).map(layer => <button key={layer} type="button"
                className={styles.shapeChoice} aria-pressed={impressionLayer === layer}
                onClick={() => setImpressionLayer(layer)}>{layer === "layer1" ? "Layer 1" : "Layer 2"}</button>)}
            </div>
          </div>
          <div className={paintedStyles.control}>
            <span className={paintedStyles.controlLabel}><span>Size</span><output>{size}</output></span>
            <DragOnlyRange label="Impression size" min={18} max={80} step={1} value={size} onChange={setSize} />
          </div>
          <div className={paintedStyles.control}>
            <span className={paintedStyles.controlLabel}><span>Depth</span><output>{depth}</output></span>
            <DragOnlyRange label="Impression depth" min={2} max={25} step={1} value={depth} onChange={setDepth} />
          </div>
          <button className={paintedStyles.playButton} type="button" onClick={() => printsRef.current?.clear()}>Clear prints</button>
          <span className={paintedStyles.sectionTitle}>Surface texture</span>
          <div className={styles.surfaceTabs} role="tablist" aria-label="Surface texture area">
            {SURFACE_TABS.map(tab => <button key={tab.value} type="button" role="tab"
              aria-selected={surfaceTab === tab.value} aria-controls="footprint-surface-controls"
              className={styles.surfaceTab} onClick={() => setSurfaceTab(tab.value)}>
              {tab.label}
            </button>)}
          </div>
          <div id="footprint-surface-controls" className={styles.surfaceControls} role="tabpanel"
            aria-label={`${selectedSurfaceLabel} texture controls`}>
            <label className={paintedStyles.colorPicker}>
              <span>Base color</span>
              <input type="color" value={selectedColor} aria-label={`${surfaceTab} base color`}
                onChange={event => updateColor(event.target.value)} />
            </label>
            <div className={paintedStyles.control}>
              <span className={paintedStyles.controlLabel}><span>Shadow depth</span><output>{selectedShadow.toFixed(2)}</output></span>
              <DragOnlyRange label={`${surfaceTab} shadow depth`} min={0} max={2} step={0.05}
                value={selectedShadow} onChange={updateShadow} />
            </div>
            {PAINTED_NOISE_CONTROLS.map(control => <div className={paintedStyles.control} key={control.key}>
              <span className={paintedStyles.controlLabel}><span>{control.label}</span>
                <output>{selectedNoise[control.key].toFixed(control.step >= 1 ? 0 : 2)}</output></span>
              <DragOnlyRange label={`${surfaceTab} ${control.label}`} min={control.min} max={control.max}
                step={control.step} value={selectedNoise[control.key]}
                onChange={value => updateNoise(control.key, value)} />
            </div>)}
          </div>
          <span className={paintedStyles.sectionTitle}>Light</span>
          <div className={paintedStyles.control}>
            <span className={paintedStyles.controlLabel}><span>Light direction</span><span>drag to rotate</span></span>
            <LightDirectionSphere direction={lightDirection} onChange={updateLightDirection} />
            <div className={paintedStyles.lightCoordinates} aria-live="off">
              <span>X {lightDirection[0].toFixed(2)}</span>
              <span>Y {lightDirection[1].toFixed(2)}</span>
              <span>Z {lightDirection[2].toFixed(2)}</span>
            </div>
          </div>
          <span className={styles.hint}>Tap the snow to press a shape.</span>
        </div>
      </div>}
      <button className={paintedStyles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
