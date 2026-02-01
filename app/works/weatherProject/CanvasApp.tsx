// app/works/weatherProject/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as WeatherProjectApp } from "./core/App";

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<WeatherProjectApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new WeatherProjectApp(canvas);
    appRef.current = app;

    return () => {
      app.destroy();
      appRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100vh",
      }}
    />
  );
}