// app/works/emergence/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as EmergenceApp } from "./core/App";

type CanvasAppProps = {
  onReady?: (app: EmergenceApp | null) => void;
};

export default function CanvasApp({ onReady }: CanvasAppProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<EmergenceApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new EmergenceApp(canvas);
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
      style={{ display: "block", width: "100%", height: "100vh" }}
    />
  );
}
