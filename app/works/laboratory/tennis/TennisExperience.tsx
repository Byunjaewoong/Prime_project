"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Link from "next/link";
import type { Difficulty, TennisApp, TennisState } from "./TennisApp";
import styles from "./tennis.module.css";

const initial: TennisState = { phase: "ready", points: ["0", "0"], games: [0, 0], server: 0, message: "", shot: "", power: 0, rally: 0, best: 0, paused: false, swingCue: null };
export default function TennisExperience() {
  const canvas = useRef<HTMLCanvasElement>(null), app = useRef<TennisApp | null>(null);
  const [state, setState] = useState(initial);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [menu, setMenu] = useState(false), [difficulty, setDifficulty] = useState<Difficulty>("Normal"), [guide, setGuide] = useState(true);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const stickId = useRef<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const wasPaused = useRef(false);
  useEffect(() => {
    let disposed = false;
    import("./TennisApp").then(({ TennisApp: App }) => {
      if (disposed || !canvas.current) return;
      try { app.current = new App(canvas.current, setState); setLoaded(true); }
      catch (e) { setError(e instanceof Error ? e.message : "WebGL could not start."); }
    }).catch(() => setError("게임을 불러오지 못했습니다. 새로고침해 주세요."));
    return () => { disposed = true; app.current?.destroy(); app.current = null; };
  }, []);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setMenu(open => {
          if (!open) { wasPaused.current = state.paused; app.current?.setPaused(true); }
          else app.current?.setPaused(wasPaused.current);
          return !open;
        });
      }
    };
    window.addEventListener("keydown", escape); return () => window.removeEventListener("keydown", escape);
  }, [state.paused]);
  useEffect(() => { if (menu) closeButton.current?.focus(); }, [menu]);
  function toggleMenu() {
    if (!menu) { wasPaused.current = state.paused; app.current?.setPaused(true); }
    else { app.current?.setPaused(wasPaused.current); menuButton.current?.focus(); }
    setMenu(!menu);
  }
  function start() { app.current?.start(); setMenu(false); (document.activeElement as HTMLElement)?.blur(); }
  function moveStick(e: PointerEvent<HTMLDivElement>) {
    if (stickId.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - rect.left - rect.width / 2) / 40, y = (e.clientY - rect.top - rect.height / 2) / 40;
    const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
    setStick({ x, y }); app.current?.setJoystick(x, y);
  }
  function endStick(e: PointerEvent<HTMLDivElement>) {
    if (stickId.current !== e.pointerId) return;
    stickId.current = null; setStick({ x: 0, y: 0 }); app.current?.setJoystick(0, 0);
  }
  return <main className={styles.root}>
    <canvas ref={canvas} className={styles.canvas} aria-label="Tennis court. WASD to move, mouse motion to swing. Player is on the lower court." />
    <header className={styles.hud}>
      <div className={styles.brand}>TENNIS <span>COURT NO. 17</span></div>
      <div className={styles.scoreboard} aria-label="Score">
        <div><span className={styles.you}>YOU {state.server === 0 && "•"}</span><strong>{state.points[0]}</strong><small>{state.games[0]}</small></div>
        <div><span className={styles.cpu}>CPU {state.server === 1 && "•"}</span><strong>{state.points[1]}</strong><small>{state.games[1]}</small></div>
        <p>POINTS <span>GAMES</span></p>
      </div>
    </header>
    <button ref={menuButton} className={styles.menuButton} onClick={toggleMenu} aria-label="Open menu" aria-expanded={menu}>M</button>
    {state.phase !== "ready" && <div className={styles.bottomHud}>
      <div className={styles.rally}>RALLY <b>{String(state.rally).padStart(2, "0")}</b><span>BEST {state.best}</span></div>
      <div className={styles.shot} aria-live="polite">{state.shot}<div style={{ opacity: state.shot ? 1 : 0 }}><i style={{ width: `${state.power * 100}%` }} /></div></div>
      <span className={styles.desktopHelp}>WASD MOVE · MOUSE SWING · P PAUSE</span>
    </div>}
    {!menu && state.swingCue && <div className={styles.swingCue} style={{ left: state.swingCue.x, top: state.swingCue.y }} aria-live="polite"><strong>{state.swingCue.arrow}</strong><span>{state.swingCue.name}</span></div>}
    {!menu && state.phase === "serve" && !state.paused && <button className={styles.serve} onClick={() => { app.current?.serve(); (document.activeElement as HTMLElement)?.blur(); }} disabled={state.server !== 0}>{state.message}</button>}
    {!menu && state.phase === "point" && <div className={styles.point} role="status">{state.message}</div>}
    {!menu && state.paused && state.phase !== "ready" && <div className={styles.scrim}><section className={styles.card}><p>TAKE YOUR TIME</p><h1>Paused.</h1><button onClick={() => { app.current?.setPaused(false); (document.activeElement as HTMLElement)?.blur(); }}>Resume ↗</button></section></div>}
    {!menu && (state.phase === "ready" || state.phase === "match") && <div className={styles.scrim}>
      <section className={styles.card}>
        <p>LABORATORY / 17</p>
        <h1>{state.phase === "match" ? state.message === "YOU WIN" ? "Your match." : "One more?" : "Make your\nnext move."}</h1>
        <div className={styles.description}>{state.phase === "match" ? `${state.message} · ${state.games.join(" — ")} · BEST RALLY ${state.best}` : "타이밍으로 받아치고, 스윙으로 궤적을 만드세요."}</div>
        <div className={styles.instructions}>
          <div><b>01 / MOVE</b><span>WASD · 방향키 / 모바일 이동 패드</span></div>
          <div><b>02 / SWING</b><span>공이 가까워질 때 마우스 스트로크 / 스와이프<br />↑ DRIVE · ↓ CUT · ↔ SIDE</span></div>
          <div><b>03 / TIMING</b><span>빠른 스윙 = 강한 타격. 원 안에서 받아치세요.<br />서브: Space 또는 스와이프 · 일시정지: P</span></div>
        </div>
        {error ? <p role="alert" className={styles.error}>WebGL 실행 오류: {error}</p> : <button disabled={!loaded} onClick={start}>{!loaded ? "Preparing court…" : state.phase === "match" ? "Play again ↗" : "Enter court ↗"}</button>}
        <small>싱글스 · 3게임 선승, 2게임 차 · YOU: 아래 / CPU: 위</small>
      </section>
    </div>}
    {!menu && !state.paused && state.phase === "rally" && <div className={styles.touchControls}>
      <div className={styles.joystick} role="group" aria-label="Movement pad" onPointerDown={e => { stickId.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); moveStick(e); }} onPointerMove={moveStick} onPointerUp={endStick} onPointerCancel={endStick} onLostPointerCapture={endStick}><i style={{ transform: `translate(${stick.x * 34}px, ${stick.y * 34}px)` }} /></div>
      <span>SWIPE TO SWING ↗</span>
    </div>}
    {menu && <div className={styles.menuScrim} onClick={e => { if (e.target === e.currentTarget) toggleMenu(); }}>
      <aside className={styles.menu} role="dialog" aria-modal="true" aria-label="Tennis settings" onKeyDown={e => {
        if (e.key !== "Tab") return;
        const controls = e.currentTarget.querySelectorAll<HTMLElement>("button,a,select,input");
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }}>
        <div className={styles.menuTitle}><span>TENNIS / SETTINGS</span><button ref={closeButton} onClick={toggleMenu} aria-label="Close menu">×</button></div>
        <label>OPPONENT<select value={difficulty} onChange={e => { const d = e.target.value as Difficulty; setDifficulty(d); app.current?.setDifficulty(d); }}><option>Easy</option><option>Normal</option><option>Hard</option></select></label>
        <label className={styles.check}>Landing & contact guides<input type="checkbox" checked={guide} onChange={e => { setGuide(e.target.checked); app.current?.setGuide(e.target.checked); }} /></label>
        <button className={styles.newMatch} onClick={start}>↻ New match</button>
        <section><h2>HOW TO PLAY</h2><p>아래 흰색 선수가 플레이어입니다. WASD 또는 방향키로 이동한 뒤, 공이 닿을 때 마우스를 휘두르세요. 클릭할 필요는 없습니다.</p><p>위로: DRIVE(탑스핀) · 아래로: CUT(슬라이스)<br />좌우: SIDE(코스와 횡회전) · 빠르게: 강한 샷<br />라켓과 방향 화살표가 실제 스트로크를 따라갑니다.<br />모바일: 왼쪽 패드 이동 + 화면 스와이프</p><p>Space / 스와이프: 서브 · P: 일시정지<br />서브는 대각 서비스 박스에 들어가야 하며, 리턴은 한 번 바운드 후 가능합니다. 아웃·네트·두 번 바운드는 실점입니다.</p><p>3게임 선승, 2게임 차로 종료합니다. 실제 유체/공기역학 대신 게임용 스핀 물리를 사용합니다.</p></section>
        <nav><Link href="/works/laboratory">← Laboratory</Link><Link href="/">Home ↗</Link></nav>
      </aside>
    </div>}
  </main>;
}
