"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./painted.module.css";

type DragOnlyRangeProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

export default function DragOnlyRange({ label, min, max, step, value, onChange }: DragOnlyRangeProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const decimalPlaces = (step.toString().split(".")[1] ?? "").length;

  const update = (next: number) => {
    const snapped = min + Math.round((Math.max(min, Math.min(max, next)) - min) / step) * step;
    onChange(Number(Math.max(min, Math.min(max, snapped)).toFixed(decimalPlaces)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    sliderRef.current?.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = trackRef.current?.getBoundingClientRect().width ?? 1;
    update(drag.startValue + (event.clientX - drag.startX) / width * (max - min));
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp": next = value + step; break;
      case "ArrowLeft":
      case "ArrowDown": next = value - step; break;
      case "PageUp": next = value + step * 10; break;
      case "PageDown": next = value - step * 10; break;
      case "Home": next = min; break;
      case "End": next = max; break;
      default: return;
    }
    event.preventDefault();
    update(next);
  };

  return <div className={styles.range} ref={sliderRef} role="slider" tabIndex={0} aria-label={label}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} onKeyDown={onKeyDown}>
    <div className={styles.rangeTrack} ref={trackRef}>
      <div className={styles.rangeFill} style={{ width: `${fraction * 100}%` }} />
      <div className={styles.rangeThumb} style={{ left: `${fraction * 100}%` }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} />
    </div>
  </div>;
}
