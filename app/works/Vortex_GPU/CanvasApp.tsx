// app/works/Fluid_sim_gpu/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as FluidGpuApp } from "./core/App";

type Props = {
  onReady?: (app: FluidGpuApp | null) => void;
};

export default function CanvasApp({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<FluidGpuApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new FluidGpuApp(canvas);
    appRef.current = app;
    onReady?.(app);

    return () => {
      app.destroy();
      appRef.current = null;
      onReady?.(null);
    };
  }, [onReady]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100vh", touchAction: "none" }}
    />
  );
}
