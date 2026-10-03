"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { generateSole, SOLE_FAMILIES, SOLE_OUTLINE, type SoleFamily } from "./core/generateSole";
import { extractSoleShape } from "./core/extractSoleShape";
import styles from "./sole.module.css";

type Design = { seed: number; family: SoleFamily };
const INITIAL_DESIGN: Design = { seed: 394, family: "imprint" };
// Cropped from Rens ten Hagen's CC0 image: https://commons.wikimedia.org/wiki/File:Schoenafdruk.png
const SAMPLE_IMAGE = "/sole-reference.png";

export default function SoleExperience() {
  const [design, setDesign] = useState<Design>(INITIAL_DESIGN);
  const [mode, setMode] = useState<"generated" | "extracted">("generated");
  const [imageUrl, setImageUrl] = useState(SAMPLE_IMAGE);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [threshold, setThreshold] = useState(120);
  const [imageError, setImageError] = useState("");
  const marks = useMemo(() => generateSole(design.seed, design.family), [design]);
  const extracted = useMemo(() => imageData ? extractSoleShape(imageData, threshold) : null, [imageData, threshold]);
  const familyName = SOLE_FAMILIES.find(option => option.value === design.family)?.label ?? "Outsole";

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, 420 / image.naturalWidth, 1000 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) { setImageError("Image processing is unavailable."); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setImageData(context.getImageData(0, 0, canvas.width, canvas.height));
      setImageError("");
    };
    image.onerror = () => { if (!cancelled) setImageError("Could not read this image."); };
    image.src = imageUrl;
    return () => { cancelled = true; if (imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  const regenerate = () => {
    const nextSeed = Math.floor(Math.random() * 0xffffffff);
    setDesign(previous => ({ ...previous, seed: nextSeed }));
  };

  const downloadShape = () => {
    if (!extracted?.path) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 1000"><path d="${extracted.path}" fill="#111" fill-rule="evenodd"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "sole-shape.svg";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/works/laboratory" className={styles.back}>← laboratory</Link>
      <span className={styles.title}>SOLE</span>
      {mode === "generated" && <button type="button" className={styles.regenerate} onClick={regenerate}>
        <RefreshCw size={15} strokeWidth={1.7} aria-hidden="true" />
        <span>new pattern</span>
      </button>}
    </header>
    <section className={styles.stage} aria-label="Shoe outsole study">
      <div className={styles.toolbar}>
        <div className={styles.modeChoices} role="group" aria-label="Sole source">
          <button type="button" aria-pressed={mode === "generated"} onClick={() => setMode("generated")}>Generated</button>
          <button type="button" aria-pressed={mode === "extracted"} onClick={() => setMode("extracted")}>Image shape</button>
        </div>
        {mode === "generated" && <label className={styles.familySelect}>Style
          <select value={design.family} onChange={event => setDesign(previous => ({ ...previous, family: event.target.value as SoleFamily }))}>
            {SOLE_FAMILIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>}
        {mode === "extracted" && <div className={styles.imageControls}>
          <label className={styles.upload}>Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            if (file.size > 12 * 1024 * 1024) { setImageError("Choose an image under 12 MB."); return; }
            setImageData(null);
            setImageUrl(URL.createObjectURL(file));
          }} /></label>
          <button type="button" className={styles.sample} onClick={() => setImageUrl(SAMPLE_IMAGE)}>Example</button>
          <button type="button" className={styles.sample} onClick={downloadShape} disabled={!extracted?.path}>Download SVG</button>
          <label className={styles.threshold}>Darkness <input type="range" min="25" max="230" value={threshold}
            onChange={event => setThreshold(Number(event.target.value))} /><output>{threshold}</output></label>
        </div>}
      </div>
      <div className={styles.preview}><svg className={styles.sole} viewBox="0 0 420 1000" role="img"
        aria-label={mode === "generated" ? `${familyName} shoe sole with procedural tread` : `Extracted shoe sole with ${extracted?.pieces ?? 0} tread pieces`}>
        {mode === "extracted" ? <path d={extracted?.path ?? ""} fill="#111" fillRule="evenodd" /> : <>
        <defs>
          <clipPath id="sole-outline-clip"><path d={SOLE_OUTLINE} /></clipPath>
        </defs>
        <g clipPath={design.family === "imprint" ? undefined : "url(#sole-outline-clip)"}
          transform={design.family === "imprint" ? "translate(-21 0) scale(1.1 1)" : undefined}>
          {marks.map((mark, index) => <path key={index} d={mark.d} transform={mark.transform}
            fill={mark.strokeWidth ? "none" : mark.tone === "ink" ? "#111111" : mark.tone === "gray" ? "#b9b9b9" : "#ffffff"}
            stroke={mark.strokeWidth ? mark.tone === "ink" ? "#111111" : mark.tone === "gray" ? "#b9b9b9" : "#ffffff" : undefined}
            strokeWidth={mark.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
        </g>
        {design.family !== "imprint" && <path d={SOLE_OUTLINE} fill="none" stroke="#111111" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />}
        </>}
      </svg></div>
      {mode === "extracted" && (imageError || (imageData && !extracted?.path)) && <p className={styles.error} role="status">
        {imageError || "No dark sole shapes found. Adjust Darkness or use a higher-contrast image."}
      </p>}
    </section>
    <footer className={styles.footer} aria-live="polite">
      {mode === "generated" ? <><span>{familyName}</span><span>{design.seed.toString(16).padStart(8, "0")}</span></>
        : <><span>{extracted?.pieces ?? 0} extracted shapes</span>{imageUrl === SAMPLE_IMAGE && <a href="https://commons.wikimedia.org/wiki/File:Schoenafdruk.png" target="_blank" rel="noopener noreferrer">Example: Rens ten Hagen · CC0</a>}</>}
    </footer>
  </main>;
}
