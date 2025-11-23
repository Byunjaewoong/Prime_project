// app/components/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App } from "../lib/App";

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<App | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new App(canvas);
    appRef.current = app;

    return () => {
      if (appRef.current && typeof appRef.current.destroy === "function") {
        appRef.current.destroy();
      }
      appRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="orbit-canvas" />;
}
