"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import styles from "./charcoal.module.css";

type PencilPoint = {
  x: number;
  y: number;
  pressure: number;
};

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

function drawPencilLine(canvas: HTMLCanvasElement, seed: number) {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * pixelRatio));
  const height = Math.max(1, Math.round(bounds.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const random = createRandom(seed);
  const top = bounds.height * 0.105;
  const bottom = bounds.height * 0.895;
  const lineHeight = Math.max(1, bottom - top);
  const samples = Math.max(220, Math.round(lineHeight / 1.45));
  const centerX = bounds.width * 0.5;
  const points: PencilPoint[] = [];
  let drift = 0;
  let velocity = 0;
  let pressure = 0.64;
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;

  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    velocity = velocity * 0.9 + (random() - 0.5) * 0.17;
    drift = Math.max(-5.8, Math.min(5.8, drift * 0.986 + velocity));
    pressure = Math.max(0.22, Math.min(1, pressure * 0.94 + random() * 0.085));
    const endTaper = Math.min(1, progress * 18, (1 - progress) * 18);
    const wobble = Math.sin(progress * Math.PI * 3.2 + phaseA) * 1.45
      + Math.sin(progress * Math.PI * 10.6 + phaseB) * 0.48;

    points.push({
      x: centerX + drift + wobble,
      y: top + progress * lineHeight,
      pressure: (0.24 + pressure * 0.76) * (0.18 + endTaper * 0.82),
    });
  }

  context.lineCap = "round";
  context.lineJoin = "round";

  // A soft graphite bed gives the stroke the compressed, rubbed edge of pencil.
  for (let pass = 0; pass < 3; pass += 1) {
    const offset = (random() - 0.5) * 2.8;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      context.beginPath();
      context.moveTo(previous.x + offset, previous.y);
      context.lineTo(point.x + offset, point.y);
      context.lineWidth = (3.2 + pass * 0.75) * point.pressure;
      context.strokeStyle = `rgba(27, 25, 23, ${0.045 + point.pressure * 0.028})`;
      context.stroke();
    }
  }

  // Overlapping hard traces retain small gaps and pressure changes like a real lead tip.
  for (let pass = 0; pass < 9; pass += 1) {
    let fiber = (random() - 0.5) * 2.4;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      fiber = fiber * 0.82 + (random() - 0.5) * 0.72;
      if (random() < 0.035 + (1 - point.pressure) * 0.07) continue;

      const passOffset = (pass - 4) * 0.23;
      context.beginPath();
      context.moveTo(previous.x + passOffset + fiber, previous.y);
      context.lineTo(point.x + passOffset + fiber * 0.8, point.y);
      context.lineWidth = (0.2 + random() * 0.42 + point.pressure * 0.5);
      context.strokeStyle = `rgba(15, 14, 13, ${0.09 + point.pressure * (0.08 + random() * 0.1)})`;
      context.stroke();
    }
  }

  // Loose graphite grains keep the edge dry and visibly hand drawn.
  const grainCount = Math.round(lineHeight * 1.65);
  for (let grain = 0; grain < grainCount; grain += 1) {
    const point = points[Math.floor(random() * points.length)];
    const spread = (random() + random() - 1) * (2.5 + point.pressure * 2.6);
    const grainWidth = 0.18 + random() * 0.7;
    const grainHeight = 0.28 + random() * 1.8;
    context.fillStyle = `rgba(22, 20, 18, ${0.055 + random() * 0.17})`;
    context.fillRect(
      point.x + spread,
      point.y + (random() - 0.5) * 2.4,
      grainWidth,
      grainHeight,
    );
  }

  // A narrow final trace preserves the single-line silhouette.
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.lineWidth = 0.34 + point.pressure * 0.72;
    context.strokeStyle = `rgba(10, 9, 8, ${0.35 + point.pressure * 0.34})`;
    context.stroke();
  }
}

export default function CharcoalExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    seedRef.current = Math.floor(Math.random() * 0xffffffff) || 1;

    let frame = 0;
    const draw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => drawPencilLine(canvas, seedRef.current));
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/works/laboratory" aria-label="Back to laboratory">
        <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.4} />
      </Link>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="A single irregular vertical graphite line"
      />
    </main>
  );
}
