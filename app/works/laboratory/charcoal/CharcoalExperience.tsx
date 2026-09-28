"use client";

import Link from "next/link";
import { ArrowLeft, FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./charcoal.module.css";

type StrandPoint = { x: number; y: number; oldX: number; oldY: number; pressure: number };
type GraphiteGrain = { point: number; spread: number; along: number; length: number };
type StrandSimulation = {
  points: StrandPoint[];
  restLengths: number[];
  fibers: number[][];
  grains: GraphiteGrain[];
  width: number;
  height: number;
  lastTime: number;
};
type DragState = {
  pointerId: number;
  point: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
};

const FIBER_COUNT = 9;
const CONSTRAINT_ITERATIONS = 32;
const DEFAULT_FRICTION = 0.32;

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createSimulation(width: number, height: number, seed: number): StrandSimulation {
  const random = createRandom(seed);
  const top = height * 0.105;
  const bottom = height * 0.895;
  const lineHeight = Math.max(1, bottom - top);
  const samples = Math.max(260, Math.round(lineHeight / 1.8));
  const centerX = width * 0.5;
  const points: StrandPoint[] = [];
  let drift = 0;
  let velocity = 0;
  let pressure = 0.64;
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    velocity = velocity * 0.9 + (random() - 0.5) * 0.17;
    drift = Math.max(-5.8, Math.min(5.8, drift * 0.986 + velocity));
    pressure = Math.max(0.2, Math.min(1, pressure * 0.935 + random() * 0.092));
    const broadPressure = 0.76 + Math.sin(progress * Math.PI * 5.4 + phaseB) * 0.19;
    const endTaper = Math.min(1, progress * 18, (1 - progress) * 18);
    const wobble = Math.sin(progress * Math.PI * 3.2 + phaseA) * 1.45
      + Math.sin(progress * Math.PI * 10.6 + phaseB) * 0.48;
    const x = centerX + drift + wobble;
    const y = top + progress * lineHeight;
    points.push({
      x,
      y,
      oldX: x,
      oldY: y,
      pressure: Math.max(0.12, broadPressure * (0.3 + pressure * 0.7) * (0.16 + endTaper * 0.84)),
    });
  }

  const restLengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    return Math.hypot(point.x - previous.x, point.y - previous.y);
  });
  const fibers = Array.from({ length: FIBER_COUNT }, () => {
    let offset = (random() - 0.5) * 2.2;
    return points.map(() => {
      offset = offset * 0.82 + (random() - 0.5) * 0.7;
      return offset;
    });
  });
  const grainCount = Math.round(lineHeight * 1.9);
  const grains = Array.from({ length: grainCount }, (): GraphiteGrain => ({
    point: Math.min(points.length - 2, Math.floor(random() * (points.length - 1))),
    spread: (random() + random() - 1) * (2.6 + random() * 2.7),
    along: random(),
    length: 0.25 + random() * 1.9,
  }));
  return { points, restLengths, fibers, grains, width, height, lastTime: performance.now() };
}

function constrainToViewport(point: StrandPoint, width: number, height: number) {
  const margin = 4;
  point.x = Math.max(margin, Math.min(width - margin, point.x));
  point.y = Math.max(margin, Math.min(height - margin, point.y));
}

function simulateStrand(simulation: StrandSimulation, drag: DragState | null, friction: number, now: number) {
  const elapsed = Math.min(33.334, Math.max(8, now - simulation.lastTime));
  const timeScale = elapsed / 16.667;
  simulation.lastTime = now;
  const retention = Math.pow(0.999, timeScale) * Math.exp(-friction * 0.045 * timeScale);

  for (let index = 0; index < simulation.points.length; index += 1) {
    if (drag?.point === index) continue;
    const point = simulation.points[index];
    const velocityX = (point.x - point.oldX) * retention;
    const velocityY = (point.y - point.oldY) * retention;
    point.oldX = point.x;
    point.oldY = point.y;
    point.x += velocityX;
    point.y += velocityY;
  }

  if (drag) {
    const point = simulation.points[drag.point];
    point.x = drag.x;
    point.y = drag.y;
    point.oldX = drag.x - drag.velocityX;
    point.oldY = drag.y - drag.velocityY;
  }

  for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration += 1) {
    for (let index = 0; index < simulation.restLengths.length; index += 1) {
      const first = simulation.points[index];
      const second = simulation.points[index + 1];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.max(0.0001, Math.hypot(dx, dy));
      const correction = (distance - simulation.restLengths[index]) / distance;
      const firstHeld = drag?.point === index;
      const secondHeld = drag?.point === index + 1;
      if (!firstHeld && !secondHeld) {
        first.x += dx * correction * 0.5;
        first.y += dy * correction * 0.5;
        second.x -= dx * correction * 0.5;
        second.y -= dy * correction * 0.5;
      } else if (firstHeld && !secondHeld) {
        second.x -= dx * correction;
        second.y -= dy * correction;
      } else if (!firstHeld && secondHeld) {
        first.x += dx * correction;
        first.y += dy * correction;
      }
    }
    for (const point of simulation.points) constrainToViewport(point, simulation.width, simulation.height);
    if (drag) {
      const point = simulation.points[drag.point];
      point.x = Math.max(4, Math.min(simulation.width - 4, drag.x));
      point.y = Math.max(4, Math.min(simulation.height - 4, drag.y));
    }
  }
}

function drawStrand(context: CanvasRenderingContext2D, simulation: StrandSimulation) {
  const { points } = simulation;
  context.clearRect(0, 0, simulation.width, simulation.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let pass = 0; pass < 3; pass += 1) {
    const passOffset = (pass - 1) * 0.9;
    for (let pressureBand = 0; pressureBand < 5; pressureBand += 1) {
      context.beginPath();
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const point = points[index];
        const band = Math.min(4, Math.floor(point.pressure * 5));
        if (band !== pressureBand) continue;
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.max(0.001, Math.hypot(dx, dy));
        const normalX = -dy / length;
        const normalY = dx / length;
        context.moveTo(previous.x + normalX * passOffset, previous.y + normalY * passOffset);
        context.lineTo(point.x + normalX * passOffset, point.y + normalY * passOffset);
      }
      const bandPressure = (pressureBand + 0.5) / 5;
      context.lineWidth = (3.2 + pass * 0.7) * bandPressure;
      context.strokeStyle = `rgba(27, 25, 23, ${0.042 + bandPressure * 0.03})`;
      context.stroke();
    }
  }

  for (let pass = 0; pass < simulation.fibers.length; pass += 1) {
    const fiber = simulation.fibers[pass];
    context.beginPath();
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const normalX = -dy / length;
      const normalY = dx / length;
      const previousOffset = fiber[index - 1] + (pass - 4) * 0.19;
      const offset = fiber[index] + (pass - 4) * 0.19;
      context.moveTo(previous.x + normalX * previousOffset, previous.y + normalY * previousOffset);
      context.lineTo(point.x + normalX * offset, point.y + normalY * offset);
    }
    context.lineWidth = 0.62 + (pass % 3) * 0.08;
    context.strokeStyle = `rgba(15, 14, 13, ${0.17 + (pass % 4) * 0.014})`;
    context.stroke();
  }

  for (let grainGroup = 0; grainGroup < 5; grainGroup += 1) {
    context.beginPath();
    for (let grainIndex = grainGroup; grainIndex < simulation.grains.length; grainIndex += 5) {
      const grain = simulation.grains[grainIndex];
      const previous = points[grain.point];
      const point = points[grain.point + 1];
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const tangentX = dx / length;
      const tangentY = dy / length;
      const normalX = -tangentY;
      const normalY = tangentX;
      const x = previous.x + dx * grain.along + normalX * grain.spread;
      const y = previous.y + dy * grain.along + normalY * grain.spread;
      context.moveTo(x, y);
      context.lineTo(x + tangentX * grain.length, y + tangentY * grain.length);
    }
    context.lineWidth = 0.24 + grainGroup * 0.1;
    context.strokeStyle = `rgba(22, 20, 18, ${0.07 + grainGroup * 0.028})`;
    context.stroke();
  }

  for (let pressureBand = 0; pressureBand < 6; pressureBand += 1) {
    context.beginPath();
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const band = Math.min(5, Math.floor(point.pressure * 6));
      if (band !== pressureBand) continue;
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
    }
    const bandPressure = (pressureBand + 0.5) / 6;
    context.lineWidth = 0.34 + bandPressure * 0.74;
    context.strokeStyle = `rgba(10, 9, 8, ${0.36 + bandPressure * 0.35})`;
    context.stroke();
  }
}

function pointerPosition(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const bounds = canvas.getBoundingClientRect();
  return { x: clientX - bounds.left, y: clientY - bounds.top };
}

export default function CharcoalExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<StrandSimulation | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const releaseRef = useRef<{ point: number; velocityX: number; velocityY: number } | null>(null);
  const frictionRef = useRef(DEFAULT_FRICTION);
  const seedRef = useRef(0);
  const [friction, setFriction] = useState(DEFAULT_FRICTION);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    seedRef.current = Math.floor(Math.random() * 0xffffffff) || 1;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const desiredRatio = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      const budgetRatio = Math.sqrt(14_000_000 / Math.max(1, bounds.width * bounds.height));
      const pixelRatio = Math.max(1, Math.min(desiredRatio, budgetRatio));
      const physicalWidth = Math.max(1, Math.round(bounds.width * pixelRatio));
      const physicalHeight = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        simulationRef.current = createSimulation(bounds.width, bounds.height, seedRef.current);
        dragRef.current = null;
      }
    };
    const animate = (now: number) => {
      resize();
      const simulation = simulationRef.current;
      if (simulation) {
        const release = releaseRef.current;
        if (release) {
          const point = simulation.points[release.point];
          point.oldX = point.x - release.velocityX * 0.92;
          point.oldY = point.y - release.velocityY * 0.92;
          releaseRef.current = null;
        }
        simulateStrand(simulation, dragRef.current, frictionRef.current, now);
        drawStrand(context, simulation);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    animationFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  const updateFriction = (value: number) => {
    frictionRef.current = value;
    setFriction(value);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const simulation = simulationRef.current;
    if (!simulation) return;
    const position = pointerPosition(event.currentTarget, event.clientX, event.clientY);
    let nearestPoint = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < simulation.points.length; index += 1) {
      const point = simulation.points[index];
      const distance = Math.hypot(point.x - position.x, point.y - position.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = index;
      }
    }
    const grabRadius = event.pointerType === "mouse" ? 24 : 44;
    if (nearestPoint < 0 || nearestDistance > grabRadius) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    dragRef.current = {
      pointerId: event.pointerId,
      point: nearestPoint,
      x: position.x,
      y: position.y,
      lastX: position.x,
      lastY: position.y,
      lastTime: now,
      velocityX: 0,
      velocityY: 0,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const position = pointerPosition(event.currentTarget, event.clientX, event.clientY);
    const now = performance.now();
    const elapsed = Math.max(4, now - drag.lastTime);
    const scale = 16.667 / elapsed;
    let velocityX = (position.x - drag.lastX) * scale;
    let velocityY = (position.y - drag.lastY) * scale;
    const velocityLength = Math.hypot(velocityX, velocityY);
    if (velocityLength > 64) {
      velocityX *= 64 / velocityLength;
      velocityY *= 64 / velocityLength;
    }
    drag.velocityX = drag.velocityX * 0.45 + velocityX * 0.55;
    drag.velocityY = drag.velocityY * 0.45 + velocityY * 0.55;
    drag.x = position.x;
    drag.y = position.y;
    drag.lastX = position.x;
    drag.lastY = position.y;
    drag.lastTime = now;
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const releaseScale = event.type === "pointercancel"
      ? 0
      : Math.exp(-Math.max(0, performance.now() - drag.lastTime) / 90);
    releaseRef.current = {
      point: drag.point,
      velocityX: drag.velocityX * releaseScale,
      velocityY: drag.velocityY * releaseScale,
    };
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/works/laboratory" aria-label="Back to laboratory">
        <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.4} />
      </Link>
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${dragging ? styles.canvasDragging : ""}`}
        aria-label="A draggable, non-stretching graphite strand on a floor"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />
      <div className={styles.menuRoot}>
        {menuOpen && (
          <div className={styles.menu} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span>Charcoal</span>
              <div className={styles.menuLinks}>
                <Link href="/" aria-label="Home"><Home aria-hidden="true" size={16} /></Link>
                <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical aria-hidden="true" size={16} /></Link>
              </div>
            </div>
            <section className={styles.menuSection}>
              <h2>Surface</h2>
              <label className={styles.slider}>
                <span><span>Floor friction</span><output>{friction.toFixed(2)}</output></span>
                <input aria-label="Floor friction" type="range" min="0" max="5" step="0.01" value={friction} onChange={(event) => updateFriction(Number(event.currentTarget.value))} />
              </label>
            </section>
          </div>
        )}
        <button
          type="button"
          className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          M
        </button>
      </div>
    </main>
  );
}
