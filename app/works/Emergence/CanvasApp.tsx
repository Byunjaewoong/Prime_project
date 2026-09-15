// app/works/emergence/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as EmergenceApp } from "./core/App";

type CanvasAppProps = {
  onReady?: (app: EmergenceApp | null) => void;
};

export default function CanvasApp({ onReady }: CanvasAppProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<EmergenceApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gpuCanvas = gpuCanvasRef.current;
    if (!canvas || !gpuCanvas) return;

    const app = new EmergenceApp(canvas, gpuCanvas);
    appRef.current = app;
    onReady?.(app);

    return () => {
      app.destroy();
      appRef.current = null;
      onReady?.(null);
    };
  }, [onReady]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100vh" }}
      />
      <canvas
        ref={gpuCanvasRef}
        aria-hidden="true"
        style={{ display: "none", position: "fixed", zIndex: 1, inset: 0, width: "100%", height: "100vh", pointerEvents: "none" }}
      />
    </>
  );
}
