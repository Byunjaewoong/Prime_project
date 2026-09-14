// app/works/FluidSim_cpu/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as FluidCpuApp } from "./core/App";

type Props = { onReady?: (app: FluidCpuApp | null) => void };

export default function CanvasApp({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dyeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const app = new FluidCpuApp(canvas, dyeCanvasRef.current ?? undefined);
    onReady?.(app);
    return () => { app.destroy(); onReady?.(null); };
  }, [onReady]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, zIndex: 1, display: "block", width: "100%", height: "100%", touchAction: "none" }} />
      <canvas ref={dyeCanvasRef} style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", pointerEvents: "none" }} />
    </>
  );
}
