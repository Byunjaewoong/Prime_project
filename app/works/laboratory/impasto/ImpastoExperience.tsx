"use client";

import Link from "next/link";
import { ArrowLeft, SlidersHorizontal, RotateCcw, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImpastoRenderer } from "./core/ImpastoRenderer";
import { DEFAULTS, type Settings, type PaintTool } from "./core/PaintSolver";
import styles from "./impasto.module.css";

const COLORS = ["#f3f3ef", "#d9af68", "#ae533d", "#b7c5c9", "#48647c", "#657767", "#343738"];
const TOOLS: { id: PaintTool; name: string; path: string }[] = [
  { id: "tube", name: "물감 짜기", path: "M7 3h10l-1 13-3 3v3h-2v-3l-3-3Z M8 6h8" },
  { id: "flat", name: "평붓", path: "M10 2h4v9h-4Z M5 11h14v10H5Z M8 15v6m4-6v6m4-6v6" },
  { id: "round", name: "둥근 붓", path: "M10 2h4v10h-4Z M12 12C4 12 6 21 12 22c6-1 8-10 0-10Z" },
  { id: "fan", name: "부채붓", path: "M10 2h4v9h-4Z M12 11 3 20Q12 24 21 20Z M12 11v11m0-11-5 10m5-10 5 10" },
  { id: "knife", name: "넓은 나이프", path: "M10 2h4v7h-4Z M12 9v3 M4 12h16v10H4Z" },
  { id: "pointed", name: "뾰족 나이프", path: "M10 2h4v7h-4Z M12 7v3 M12 10 5 22h14Z" },
  { id: "view", name: "시점 회전", path: "M21 12a9 9 0 1 1-3-7 M18 2v5h-5 M8 12h8m-4-4v8" },
];
function ToolIcon({ path }: { path: string }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>; }
const CONTROLS: { key: keyof Settings; label: string; min: number; max: number }[] = [
  { key: "size", label: "도구 폭 · 노즐 크기", min: 10, max: 100 },
  { key: "amount", label: "물감 짜는 속도", min: 5, max: 100 },
  { key: "pressure", label: "누르는 힘", min: 5, max: 100 },
  { key: "viscosity", label: "점도", min: 0, max: 100 },
  { key: "retention", label: "형태 유지 · 소성", min: 0, max: 100 },
  { key: "adhesion", label: "도구에 달라붙는 힘", min: 0, max: 100 },
  { key: "gloss", label: "유분 광택", min: 0, max: 100 },
  { key: "light", label: "빛 방향", min: 0, max: 360 },
];

export default function ImpastoExperience() {
  const canvas = useRef<HTMLCanvasElement>(null), renderer = useRef<ImpastoRenderer | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS), current = useRef(settings);
  const [menu, setMenu] = useState(false), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  const [particles, setParticles] = useState({ count: 0, capacity: 3000 });
  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed || !canvas.current) return;
      try {
        const instance = new ImpastoRenderer(canvas.current, (count, capacity) => setParticles(previous => previous.count === count && previous.capacity === capacity ? previous : { count, capacity }), setError);
        renderer.current = instance; instance.update(current.current);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "물감 솔버를 시작하지 못했습니다."); }
    });
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; };
  }, [attempt]);
  const update = (patch: Partial<Settings>) => { const next = { ...settings, ...patch }; current.current = next; setSettings(next); renderer.current?.update(next); };

  return <main className={styles.page}>
    <canvas key={attempt} ref={canvas} className={styles.canvas} aria-label="3D 물감. 튜브로 물감을 짜고 붓이나 나이프로 덩어리를 펴 바르세요." />
    {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => { setError(""); setAttempt(n => n + 1); }}>캔버스 다시 열기</button></div>}
    <nav className={styles.toolDock} aria-label="물감 도구">{TOOLS.map(tool => <button key={tool.id} aria-label={tool.name} title={tool.name}
      aria-pressed={settings.tool === tool.id} onClick={() => update({ tool: tool.id })}><ToolIcon path={tool.path} /></button>)}</nav>
    {particles.count >= particles.capacity && <div className={styles.capacity} role="status">물감이 가득 찼습니다. 지금 놓인 물감을 펴 바르거나 메뉴에서 비워주세요.</div>}
    <div className={styles.menuRoot}>
      {menu && <section id="impasto-menu" className={styles.menu} aria-label="Impasto 설정">
        <header className={styles.header}><Link href="/works/laboratory" aria-label="Laboratory로 돌아가기"><ArrowLeft size={17} /></Link>
          <strong>IMPASTO</strong><button aria-label="메뉴 닫기" onClick={() => setMenu(false)}><X size={18} /></button></header>
        <p className={styles.guide}>흰 물감 바탕 위를 나이프로 밀어보세요.<br />튜브로 물감을 더 짜거나, 비운 뒤 시작할 수 있습니다.<br />손을 떼면 달라붙은 물감이 끌려 올라옵니다.</p>
        <div className={styles.label}>TOOL</div>
        <div className={styles.tools}>{TOOLS.filter(t => t.id !== "view").map(tool => <button key={tool.id} aria-pressed={settings.tool === tool.id} onClick={() => update({ tool: tool.id })}>{tool.name}</button>)}</div>
        <div className={styles.colors}>{COLORS.map(color => <button key={color} style={{ background: color }} aria-label={`물감 ${color}`} aria-pressed={settings.color === color} onClick={() => update({ color })} />)}
          <label className={styles.customColor} title="직접 색 고르기">+<input type="color" value={settings.color} aria-label="물감 색 직접 고르기" onChange={e => update({ color: e.target.value })} /></label></div>
        <div className={styles.label}>MATERIAL & CONTACT</div>
        {CONTROLS.map(control => <label key={control.key} className={styles.control}><span>{control.label}</span><output>{settings[control.key]}{control.key === "light" ? "°" : "%"}</output>
          <input type="range" min={control.min} max={control.max} value={settings[control.key]} step={1} onChange={e => update({ [control.key]: Number(e.target.value) })} /></label>)}
        <div className={styles.actions}>
          <button onClick={() => renderer.current?.undo()}><Undo2 size={14} />되돌리기</button>
          <button onClick={() => renderer.current?.clear()}><RotateCcw size={14} />물감 비우기</button>
          <button onClick={() => renderer.current?.prepare()}>흰 물감 바탕 만들기</button>
          <button onClick={() => renderer.current?.resetView()}>시점 초기화</button><button onClick={() => update(DEFAULTS)}>설정 초기화</button>
        </div>
        <p className={styles.note}>회전 도구에서 드래그로 옆면을 보고, 휠·핀치로 확대할 수 있습니다. 펜 필압을 지원합니다. 색은 새로 짜는 물감에 적용됩니다.</p>
      </section>}
      <button className={styles.menuButton} aria-label="Impasto 메뉴" aria-controls="impasto-menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}><SlidersHorizontal size={18} /></button>
    </div>
  </main>;
}
