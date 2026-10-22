"use client";

import Link from "next/link";
import { ArrowLeft, SlidersHorizontal, RotateCcw, Shuffle, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImpastoRenderer } from "./core/ImpastoRenderer";
import { DEFAULTS, type PaintSettings, type Tool } from "./core/PaintField";
import styles from "./impasto.module.css";

const COLORS = ["#f4f1e7", "#d9d0bc", "#d9af68", "#ae533d", "#6c8290", "#657767", "#343738"];
const CONTROLS: { key: keyof PaintSettings; label: string; min: number; max: number; unit?: string }[] = [
  { key: "size", label: "도구 폭", min: 12, max: 220 },
  { key: "load", label: "물감량", min: 0, max: 100, unit: "%" },
  { key: "viscosity", label: "점도", min: 0, max: 100, unit: "%" },
  { key: "yield", label: "형태 유지력", min: 0, max: 100, unit: "%" },
  { key: "adhesion", label: "달라붙음 · 떼어내기", min: 0, max: 100, unit: "%" },
  { key: "texture", label: "붓결 · 표면 입자", min: 0, max: 100, unit: "%" },
  { key: "relief", label: "입체 깊이", min: 25, max: 250, unit: "%" },
  { key: "lightAngle", label: "빛 방향", min: 0, max: 360, unit: "°" },
  { key: "lightHeight", label: "빛 높이", min: 10, max: 80, unit: "°" },
  { key: "gloss", label: "유분 광택", min: 0, max: 100, unit: "%" },
];

export default function ImpastoExperience() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ImpastoRenderer | null>(null);
  const [settings, setSettings] = useState<PaintSettings>(DEFAULTS);
  const currentSettings = useRef(settings);
  const [menu, setMenu] = useState(false);
  const [progress, setProgress] = useState<number | null>(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed || !canvas.current) return;
      try {
        const instance = new ImpastoRenderer(canvas.current, setProgress, setError);
        renderer.current = instance;
        instance.update(currentSettings.current);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "물감 캔버스를 시작하지 못했습니다.");
      }
    });
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; };
  }, [attempt]);

  const update = (patch: Partial<PaintSettings>) => {
    const next = { ...settings, ...patch };
    currentSettings.current = next; setSettings(next); renderer.current?.update(next);
  };

  return <main className={styles.page}>
    <canvas key={attempt} ref={canvas} className={styles.canvas}
      aria-label="임파스토 물감 캔버스. 마우스 또는 손가락으로 드래그해서 칠하고 손을 떼어 물감을 당깁니다." />
    {progress !== null && !error && <div className={styles.loading} role="status" aria-live="polite">
      <span>물감층 만드는 중</span><progress max={100} value={progress} /><span>{progress}%</span>
    </div>}
    {error && <div className={styles.error} role="alert"><p>{error}</p>
      <button onClick={() => { setError(""); setProgress(0); setAttempt(value => value + 1); }}>캔버스 다시 열기</button>
    </div>}
    <div className={styles.menuRoot}>
      {menu && <section id="impasto-menu" className={styles.menu} aria-label="Impasto 설정">
        <header className={styles.header}>
          <Link href="/works/laboratory" aria-label="Laboratory로 돌아가기"><ArrowLeft size={17} /></Link>
          <strong>IMPASTO</strong><button aria-label="메뉴 닫기" onClick={() => setMenu(false)}><X size={18} /></button>
        </header>
        <p className={styles.guide}>드래그하여 밀고, 손을 떼어 끌어올리세요.<br />펜은 누르는 힘에 따라 자국이 달라집니다.</p>
        <div className={styles.label}>TOOL</div>
        <div className={styles.tools}>{([ ["knife", "나이프"], ["brush", "붓"], ["smear", "문지르기"] ] as [Tool, string][]).map(([id, label]) =>
          <button key={id} aria-pressed={settings.tool === id} onClick={() => update({ tool: id })}>{label}</button>)}</div>
        <div className={styles.colors}>{COLORS.map(color => <button key={color} style={{ background: color }}
          aria-label={`물감 ${color}`} aria-pressed={settings.color === color} onClick={() => update({ color })} />)}
          <label className={styles.customColor} title="직접 색 고르기">+<input type="color" value={settings.color} aria-label="물감 색 직접 고르기" onChange={e => update({ color: e.target.value })} /></label>
        </div>
        <div className={styles.label}>PAINT</div>
        {CONTROLS.map((control, i) => <div key={control.key}>
          {i === 6 && <div className={styles.label}>SURFACE & LIGHT</div>}
          <label className={styles.control}><span>{control.label}</span><output>{settings[control.key]}{control.unit}</output>
            <input type="range" min={control.min} max={control.max} value={settings[control.key]} step={1}
              onChange={e => update({ [control.key]: Number(e.target.value) })} />
          </label>
        </div>)}
        <div className={styles.actions}>
          <button disabled={progress !== null} onClick={() => renderer.current?.undo()}><Undo2 size={14} />되돌리기</button>
          <button disabled={progress !== null} onClick={() => renderer.current?.regenerate()}><Shuffle size={14} />새 질감</button>
          <button disabled={progress !== null} onClick={() => renderer.current?.clear()}><RotateCcw size={14} />물감 비우기</button>
          <button onClick={() => update(DEFAULTS)}>설정 초기화</button>
        </div>
        <p className={styles.note}>도구·물감 설정은 다음 붓질과 새 질감에 적용됩니다. 점도가 높으면 천천히 밀리고, 형태 유지력이 높으면 자국이 덜 가라앉습니다. 입체 깊이와 조명은 즉시 바뀝니다.</p>
      </section>}
      <button className={styles.menuButton} aria-label="Impasto 메뉴" aria-controls="impasto-menu" aria-expanded={menu}
        onClick={() => setMenu(value => !value)}><SlidersHorizontal size={18} /></button>
    </div>
  </main>;
}
