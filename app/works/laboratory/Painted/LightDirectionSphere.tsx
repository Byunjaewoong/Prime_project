"use client";

import { useEffect, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { LightDirection } from "./core/PaintedRenderer";
import styles from "./painted.module.css";

const SIZE = 188;
const RADIUS = 84;
const POINT_COUNT = 3200;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const spherePoints = Array.from({ length: POINT_COUNT }, (_, index) => {
  const y = 1 - 2 * (index + 0.5) / POINT_COUNT;
  const ring = Math.sqrt(1 - y * y);
  const angle = index * GOLDEN_ANGLE;
  return [Math.cos(angle) * ring, y, Math.sin(angle) * ring] as const;
});

function drawSphere(canvas: HTMLCanvasElement, direction: LightDirection) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixels = Math.round(SIZE * ratio);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, SIZE, SIZE);

  const center = SIZE / 2;
  context.beginPath();
  context.arc(center, center, RADIUS, 0, Math.PI * 2);
  context.fillStyle = "#10171b";
  context.fill();
  context.save();
  context.clip();

  // Rotate the stippled globe so its dark cap points along the selected vector.
  const [lx, ly, lz] = direction;
  const qLength = Math.hypot(-ly, lx, 1 + lz);
  const qx = -ly / qLength;
  const qy = lx / qLength;
  const qw = (1 + lz) / qLength;
  for (const [x, y, z] of spherePoints) {
    const tx = 2 * (qy * z);
    const ty = 2 * (-qx * z);
    const tz = 2 * (qx * y - qy * x);
    const rx = x + qw * tx + qy * tz;
    const ry = y + qw * ty - qx * tz;
    const rz = z + qw * tz + qx * ty - qy * tx;
    if (rz <= 0) continue;

    const fade = Math.max(0, Math.min(1, (z - 0.06) / 0.32));
    const cap = fade * fade * (3 - 2 * fade);
    const alpha = (0.85 - cap * 0.81) * (0.58 + rz * 0.42);
    context.fillStyle = `rgba(238,242,239,${alpha})`;
    context.beginPath();
    context.arc(center + rx * RADIUS, center - ry * RADIUS, 0.62 + rz * 0.44, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  context.beginPath();
  context.arc(center, center, RADIUS, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255,255,255,0.25)";
  context.lineWidth = 1;
  context.stroke();
}

export default function LightDirectionSphere({ direction, onChange }: {
  direction: LightDirection;
  onChange: (direction: LightDirection) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directionRef = useRef(direction);
  const pointerRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    directionRef.current = direction;
    if (canvasRef.current) drawSphere(canvasRef.current, direction);
  }, [direction]);

  const moveBy = (dx: number, dy: number) => {
    let x = directionRef.current[0] + dx / SIZE;
    let y = directionRef.current[1] - dy / SIZE;
    const planarLength = Math.hypot(x, y);
    if (planarLength > 0.98) {
      x *= 0.98 / planarLength;
      y *= 0.98 / planarLength;
    }
    const next: LightDirection = [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))];
    directionRef.current = next;
    onChange(next);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    moveBy(event.clientX - pointer.x, event.clientY - pointer.y);
    pointerRef.current = { id: pointer.id, x: event.clientX, y: event.clientY };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-9, 0], ArrowRight: [9, 0], ArrowUp: [0, -9], ArrowDown: [0, 9],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveBy(...move);
  };

  return <canvas ref={canvasRef} className={styles.lightSphere} role="slider" tabIndex={0}
    aria-label="Light direction sphere. Drag to rotate, or use arrow keys."
    aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(direction[0] * 100)}
    aria-valuetext={`X ${direction[0].toFixed(2)}, Y ${direction[1].toFixed(2)}, Z ${direction[2].toFixed(2)}`}
    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={event => { if (pointerRef.current?.id === event.pointerId) pointerRef.current = null; }}
    onPointerCancel={event => { if (pointerRef.current?.id === event.pointerId) pointerRef.current = null; }}
    onKeyDown={onKeyDown} />;
}
