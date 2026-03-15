// app/works/FluidSim_cpu/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as FluidCpuApp } from "./core/App";

type Props = { onReady?: (app: FluidCpuApp | null) => void };

export default function CanvasApp({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const app = new FluidCpuApp(canvas);
    onReady?.(app);
    return () => { app.destroy(); onReady?.(null); };
  }, [onReady]);

  return <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100vh" }} />;
}
