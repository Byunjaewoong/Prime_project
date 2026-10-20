"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./dashboard.module.css";

type Point = [number, number];
type Stroke = { stroke_key: string; color: string; width: number; points: Point[]; id?: number };
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
  const [color, setColor] = useState(COLORS[0]);
  const [brushWidth, setBrushWidth] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [connection, setConnection] = useState<Connection>("loading");
  const [pendingCount, setPendingCount] = useState(0);
  const [strokeCount, setStrokeCount] = useState(0);

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
    if (savingRef.current || pendingRef.current.length === 0) return;
    savingRef.current = true;
    try {
      while (pendingRef.current.length) {
        const stroke = pendingRef.current[0];
        const response = await fetch("/api/dashboard/strokes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stroke),
        });
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
      while (hasMore) {
        const response = await fetch(`/api/dashboard/strokes?after=${lastIdRef.current}`, { cache: "no-store" });
        if (!response.ok) {
          setConnection(response.status === 503 ? "setup" : "offline");
          return;
        }
        const result = await response.json() as { strokes: Stroke[]; hasMore: boolean };
        for (const stroke of result.strokes) {
          if (typeof stroke.id !== "number" || !Number.isFinite(stroke.id)) continue;
          lastIdRef.current = Math.max(lastIdRef.current, stroke.id);
          if (keysRef.current.has(stroke.stroke_key)) continue;
          keysRef.current.add(stroke.stroke_key);
          strokesRef.current.push(stroke);
        }
        setStrokeCount(strokesRef.current.length);
        repaint();
        hasMore = result.hasMore && result.strokes.length > 0;
      }
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
    setIsDrawing(false);
    strokesRef.current.push(stroke);
    keysRef.current.add(stroke.stroke_key);
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
    setIsDrawing(true);
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
      setIsDrawing(true);
    } else {
      stroke.points.push(point);
    }
    repaint();
  };

  const statusText = connection === "connected" ? "Connected · shared canvas"
    : connection === "setup" ? "Supabase setup required · lines saved on this device"
      : connection === "offline" ? "Connection lost · lines saved on this device"
        : "Loading shared drawing…";

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/works/laboratory" className={styles.back}>← Laboratory</Link>
      <div className={styles.title}><span className={styles.eyebrow}>A COMMON SURFACE</span><h1>Dashboard</h1></div>
      <span className={styles.count}>{strokeCount.toLocaleString()} lines</span>
    </header>
    <div className={styles.canvasWrap}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label="Shared drawing canvas"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={finishStroke} onPointerCancel={finishStroke} />
      {strokeCount === 0 && !isDrawing && <div className={styles.empty}>Draw a line. Leave a trace.</div>}
    </div>
    <footer className={styles.toolbar}>
      <div className={styles.colors} role="group" aria-label="Line color">
        {COLORS.map(choice => <button key={choice} type="button" className={styles.swatch}
          style={{ background: choice }} aria-label={`Select ${choice}`} aria-pressed={color === choice}
          onClick={() => setColor(choice)} />)}
        <label className={styles.customColor} title="Custom color"><input type="color" value={color}
          aria-label="Custom line color" onChange={event => setColor(event.target.value)} /><span>+</span></label>
      </div>
      <label className={styles.widthControl}>Size <input type="range" min="1" max="16" value={brushWidth}
        onChange={event => setBrushWidth(Number(event.target.value))} aria-label="Brush size" /><output>{brushWidth}</output></label>
      <div className={styles.status} role="status"><span className={connection === "connected" ? styles.onlineDot : styles.offlineDot} />
        {statusText}{pendingCount > 0 && <span> · {pendingCount} pending</span>}
      </div>
    </footer>
  </main>;
}
