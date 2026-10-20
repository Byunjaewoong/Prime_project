"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./dashboard.module.css";

type Point = [number, number];
type Stroke = { stroke_key: string; color: string; width: number; points: Point[]; generation?: number; id?: number };
type Connection = "loading" | "connected" | "offline" | "setup";

const COLORS = ["#253d36", "#b45448", "#df9c50", "#5b8195", "#758d65", "#816980"];
const PENDING_KEY = "grimgrigi.dashboard.pending.v1";

function persistPending(strokes: Stroke[]) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(strokes)); }
  catch { /* The canvas remains usable if local storage is full or unavailable. */ }
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke, width: number, height: number) {
  const points = stroke.points;
  if (!points.length) return;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0][0] * width, points[0][1] * height, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(points[0][0] * width, points[0][1] * height);
  for (let index = 1; index < points.length; index++) context.lineTo(points[index][0] * width, points[index][1] * height);
  context.stroke();
}

function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return [
    Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  ];
}

export default function DashboardExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const keysRef = useRef(new Set<string>());
  const activeRef = useRef<Stroke | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const pendingRef = useRef<Stroke[]>([]);
  const savingRef = useRef(false);
  const loadingRef = useRef(false);
  const initializedRef = useRef(false);
  const lastIdRef = useRef(0);
  const generationRef = useRef<number | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [brushWidth, setBrushWidth] = useState(4);
  const [connection, setConnection] = useState<Connection>("loading");
  const [hydrating, setHydrating] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.clearRect(0, 0, width, height);
    for (const stroke of strokesRef.current) drawStroke(context, stroke, width, height);
    if (activeRef.current) drawStroke(context, activeRef.current, width, height);
  }, []);

  const flushPending = useCallback(async () => {
    if (savingRef.current || pendingRef.current.length === 0 || generationRef.current === null) return;
    savingRef.current = true;
    try {
      while (pendingRef.current.length) {
        const stroke = pendingRef.current[0];
        const response = await fetch("/api/dashboard/strokes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stroke),
        });
        if (response.status === 409) break;
        if (!response.ok) {
          setConnection(response.status === 503 ? "setup" : "offline");
          break;
        }
        pendingRef.current.shift();
        persistPending(pendingRef.current);
        setPendingCount(pendingRef.current.length);
        setConnection("connected");
      }
    } catch {
      setConnection("offline");
    } finally {
      savingRef.current = false;
    }
  }, []);

  const syncStrokes = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      let hasMore = true;
      let resets = 0;
      while (hasMore) {
        const response = await fetch(`/api/dashboard/strokes?after=${lastIdRef.current}`, { cache: "no-store" });
        if (!response.ok) {
          setConnection(response.status === 503 ? "setup" : "offline");
          return;
        }
        const result = await response.json() as { generation: number; strokes: Stroke[]; hasMore: boolean };
        if (!Number.isSafeInteger(result.generation)) throw new Error("Invalid dashboard generation");
        if (generationRef.current !== null && result.generation < generationRef.current) return;
        if (generationRef.current === null) {
          generationRef.current = result.generation;
          pendingRef.current = pendingRef.current.filter(stroke => stroke.generation === undefined || stroke.generation === result.generation);
          pendingRef.current.forEach(stroke => { stroke.generation ??= result.generation; });
          persistPending(pendingRef.current);
          strokesRef.current = [...pendingRef.current];
          keysRef.current = new Set(pendingRef.current.map(stroke => stroke.stroke_key));
          setPendingCount(pendingRef.current.length);
        } else if (generationRef.current !== result.generation) {
          setHydrating(true);
          setLoadedCount(0);
          generationRef.current = result.generation;
          lastIdRef.current = 0;
          pendingRef.current = pendingRef.current.filter(stroke => stroke.generation === result.generation);
          persistPending(pendingRef.current);
          strokesRef.current = [...pendingRef.current];
          keysRef.current = new Set(pendingRef.current.map(stroke => stroke.stroke_key));
          activeRef.current = null;
          activePointerRef.current = null;
          setPendingCount(pendingRef.current.length);
          setStrokeCount(strokesRef.current.length);
          repaint();
          if (++resets > 3) throw new Error("Dashboard reset changed repeatedly");
          continue;
        }
        for (const stroke of result.strokes) {
          if (typeof stroke.id !== "number" || !Number.isFinite(stroke.id)) continue;
          lastIdRef.current = Math.max(lastIdRef.current, stroke.id);
          if (keysRef.current.has(stroke.stroke_key)) continue;
          keysRef.current.add(stroke.stroke_key);
          strokesRef.current.push(stroke);
        }
        setStrokeCount(strokesRef.current.length);
        setLoadedCount(strokesRef.current.length);
        repaint();
        hasMore = result.hasMore && result.strokes.length > 0;
      }
      setHydrating(false);
      setConnection("connected");
      void flushPending();
    } catch {
      setConnection("offline");
    } finally {
      loadingRef.current = false;
    }
  }, [flushPending, repaint]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      try {
        const stored = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as Stroke[];
        if (Array.isArray(stored)) {
          pendingRef.current = stored.filter(stroke => typeof stroke.stroke_key === "string" && Array.isArray(stroke.points));
          strokesRef.current.push(...pendingRef.current);
          pendingRef.current.forEach(stroke => keysRef.current.add(stroke.stroke_key));
          setPendingCount(pendingRef.current.length);
          setStrokeCount(strokesRef.current.length);
        }
      } catch { /* Ignore damaged local drafts. */ }
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(repaint);
    observer.observe(canvas);
    repaint();
    void syncStrokes();
    const timer = window.setInterval(() => { void syncStrokes(); }, 3500);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [repaint, syncStrokes]);

  const finishStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const stroke = activeRef.current;
    if (!stroke) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    activeRef.current = null;
    activePointerRef.current = null;
    strokesRef.current.push(stroke);
    keysRef.current.add(stroke.stroke_key);
    stroke.generation = generationRef.current ?? undefined;
    pendingRef.current.push(stroke);
    persistPending(pendingRef.current);
    setPendingCount(pendingRef.current.length);
    setStrokeCount(strokesRef.current.length);
    repaint();
    void flushPending();
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (activePointerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    activeRef.current = { stroke_key: crypto.randomUUID(), color, width: brushWidth, points: [pointFromEvent(event)] };
    repaint();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    const stroke = activeRef.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    const point = pointFromEvent(event);
    const previous = stroke.points[stroke.points.length - 1];
    const distance = Math.hypot((point[0] - previous[0]) * canvas.clientWidth, (point[1] - previous[1]) * canvas.clientHeight);
    if (distance < 1.5) return;
    if (stroke.points.length >= 600) {
      finishStroke(event);
      canvas.setPointerCapture(event.pointerId);
      activePointerRef.current = event.pointerId;
      activeRef.current = { stroke_key: crypto.randomUUID(), color: stroke.color, width: stroke.width, points: [previous, point] };
    } else {
      stroke.points.push(point);
    }
    repaint();
  };

  const statusText = connection === "connected" ? "Connected · shared canvas"
    : connection === "setup" ? "Supabase setup required · lines saved on this device"
      : connection === "offline" ? "Connection lost · lines saved on this device"
        : "Loading shared drawing…";

  const clearDrawing = async () => {
    if (deleting || !/^\d{4}$/.test(deletePassword)) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/dashboard/strokes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const result = await response.json() as { generation?: number; error?: string };
      if (!response.ok || !Number.isSafeInteger(result.generation)) {
        setDeleteError(result.error ?? "전체 삭제에 실패했습니다.");
        return;
      }
      generationRef.current = result.generation!;
      lastIdRef.current = 0;
      strokesRef.current = [];
      keysRef.current.clear();
      pendingRef.current = [];
      activeRef.current = null;
      activePointerRef.current = null;
      persistPending([]);
      setStrokeCount(0);
      setPendingCount(0);
      setDeletePassword("");
      setDeleteOpen(false);
      repaint();
    } catch {
      setDeleteError("연결을 확인한 뒤 다시 시도하세요.");
    } finally {
      setDeleting(false);
    }
  };

  return <main className={styles.page} aria-busy={hydrating}>
    <canvas ref={canvasRef} className={styles.canvas} aria-label="Shared drawing canvas"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={finishStroke} onPointerCancel={finishStroke} />
    {hydrating && <div className={styles.loadingOverlay} role="status" aria-live="polite">
      {connection === "offline" || connection === "setup" ? <>
        <span className={styles.loadingTitle}>그림을 불러오지 못했습니다</span>
        <button type="button" className={styles.retryButton} onClick={() => { setConnection("loading"); void syncStrokes(); }}>다시 시도</button>
      </> : <>
        <span className={styles.loadingSpinner} aria-hidden="true" />
        <span className={styles.loadingTitle}>그림을 불러오는 중</span>
        {loadedCount > 0 && <span className={styles.loadingCount}>{loadedCount.toLocaleString()}개 불러옴</span>}
      </>}
    </div>}
    <div className={styles.menuRoot}>
      {menuOpen && <div className={styles.menu}>
        <div className={styles.menuHeader}>
          <span>Dashboard</span>
          <Link href="/works/laboratory" aria-label="Laboratory">←</Link>
        </div>
        <div className={styles.menuContents}>
          <div className={styles.menuLabel}>Drawing</div>
          <div className={styles.colors} role="group" aria-label="Line color">
            {COLORS.map(choice => <button key={choice} type="button" className={styles.swatch}
              style={{ background: choice }} aria-label={`Select ${choice}`} aria-pressed={color === choice}
              onClick={() => setColor(choice)} />)}
            <label className={styles.customColor} title="Custom color"><input type="color" value={color}
              aria-label="Custom line color" onChange={event => setColor(event.target.value)} /><span>+</span></label>
          </div>
          <label className={styles.widthControl}><span>Brush size</span><output>{brushWidth}px</output>
            <input type="range" min="1" max="16" value={brushWidth}
              onChange={event => setBrushWidth(Number(event.target.value))} aria-label="Brush size" />
          </label>
          <div className={styles.menuLabel}>Shared canvas</div>
          <div className={styles.status} role="status"><span className={connection === "connected" ? styles.onlineDot : styles.offlineDot} />
            {statusText}{pendingCount > 0 && <span> · {pendingCount} pending</span>}
          </div>
          <div className={styles.lineCount}>{strokeCount.toLocaleString()} lines</div>
          {!deleteOpen ? <button type="button" className={styles.deleteButton}
            onClick={() => { setDeleteOpen(true); setDeleteError(""); }}>전체 삭제</button>
            : <div className={styles.deletePanel}>
              <p>모든 사용자의 그림이 삭제됩니다.</p>
              <input type="password" inputMode="numeric" autoComplete="off" maxLength={4}
                placeholder="비밀번호 4자리" aria-label="전체 삭제 비밀번호" value={deletePassword}
                onChange={event => setDeletePassword(event.target.value.replace(/\D/g, ""))} />
              {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}
              <div className={styles.deleteActions}>
                <button type="button" onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteError(""); }}>취소</button>
                <button type="button" className={styles.confirmDelete} disabled={deleting || deletePassword.length !== 4}
                  onClick={() => void clearDrawing()}>{deleting ? "삭제 중…" : "전체 삭제 확인"}</button>
              </div>
            </div>}
        </div>
      </div>}
      <button type="button" className={styles.menuButton} aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
