"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { paintVillage } from "./paintVillage";
import styles from "./village.module.css";

export default function VillageExperience() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"single" | "village">("single");
  const [seed, setSeed] = useState(0);
  const initialSeed = useRef<number | null>(null);
  const [size, setSize] = useState(100);
  const [density, setDensity] = useState(100);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    if (initialSeed.current === null) initialSeed.current = crypto.getRandomValues(new Uint32Array(1))[0];
    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        if (rect.width && rect.height) paintVillage(element, rect.width, rect.height, { seed: seed || initialSeed.current!, mode, size: size / 100, density: density / 100 });
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(element); draw();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [mode, seed, size, density]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const save = () => canvas.current?.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `village-${seed || initialSeed.current}.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  return <main className={styles.page}>
    <canvas ref={canvas} className={styles.canvas} role="img" aria-label={mode === "single" ? "랜덤으로 생성된 그림 스타일 건물" : "원근과 겹침으로 구성된 그림 스타일 마을"} />
    {open && <aside id="village-menu" className={styles.panel} aria-label="마을 설정">
      <div className={styles.heading}><span>VILLAGE</span><Link href="/works/laboratory">← Laboratory</Link></div>
      <span className={styles.label}>COMPOSITION</span>
      <div className={styles.modes}><button aria-pressed={mode === "single"} onClick={() => setMode("single")}>건물 하나</button><button aria-pressed={mode === "village"} onClick={() => setMode("village")}>전체 마을</button></div>
      <label className={styles.control}><span>건물 크기 <output>{size}%</output></span><input aria-label="건물 크기" type="range" min="65" max="140" step="5" value={size} onChange={e => setSize(Number(e.target.value))} /></label>
      {mode === "village" && <label className={styles.control}><span>겹침 밀도 <output>{density}%</output></span><input aria-label="겹침 밀도" type="range" min="80" max="140" step="5" value={density} onChange={e => setDensity(Number(e.target.value))} /></label>}
      <button className={styles.action} onClick={() => setSeed(crypto.getRandomValues(new Uint32Array(1))[0])}>↻ 새로 생성</button>
      <button className={styles.action} onClick={save}>↓ PNG 저장</button>
    </aside>}
    <button className={styles.toggle} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="village-menu" onClick={() => setOpen(!open)}><span /><span /></button>
  </main>;
}
