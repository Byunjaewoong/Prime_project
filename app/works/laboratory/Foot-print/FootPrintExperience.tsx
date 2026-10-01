"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import DragOnlyRange from "../Painted/DragOnlyRange";
import LightDirectionSphere from "../Painted/LightDirectionSphere";
import { DEFAULT_LIGHT_DIRECTION, PaintedRenderer, type LightDirection } from "../Painted/core/PaintedRenderer";
import { FootPrintRenderer, type FootPrintShape } from "./core/FootPrintRenderer";
import paintedStyles from "../Painted/painted.module.css";
import styles from "./footprint.module.css";

const SHAPES: { value: FootPrintShape; label: string }[] = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "triangle", label: "Triangle" },
];

export default function FootPrintExperience() {
  const snowCanvasRef = useRef<HTMLCanvasElement>(null);
  const printCanvasRef = useRef<HTMLCanvasElement>(null);
  const snowRef = useRef<PaintedRenderer | null>(null);
  const printsRef = useRef<FootPrintRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shape, setShape] = useState<FootPrintShape>("circle");
  const [size, setSize] = useState(36);
  const [depth, setDepth] = useState(11);
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
    printsRef.current?.stamp(event.clientX - rect.left, event.clientY - rect.top, shape, size, depth);
  };

  const updateLightDirection = (direction: LightDirection) => {
    setLightDirection(direction);
    snowRef.current?.setLightDirection(direction);
    printsRef.current?.setLightDirection(direction);
  };

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
            <span className={paintedStyles.controlLabel}><span>Size</span><output>{size}</output></span>
            <DragOnlyRange label="Impression size" min={18} max={80} step={1} value={size} onChange={setSize} />
          </div>
          <div className={paintedStyles.control}>
            <span className={paintedStyles.controlLabel}><span>Depth</span><output>{depth}</output></span>
            <DragOnlyRange label="Impression depth" min={2} max={25} step={1} value={depth} onChange={setDepth} />
          </div>
          <button className={paintedStyles.playButton} type="button" onClick={() => printsRef.current?.clear()}>Clear prints</button>
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
