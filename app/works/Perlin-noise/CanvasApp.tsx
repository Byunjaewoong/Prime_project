// app/works/perlin_noise/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as PerlinApp } from "./core/App";

type CanvasAppProps = {
  // 나중에 컨트롤 하고 싶으면 onReady로 App 인스턴스 받아갈 수 있게
  onReady?: (app: PerlinApp | null) => void;
};

export default function CanvasApp({ onReady }: CanvasAppProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<PerlinApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new PerlinApp(canvas);
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
      className="full-canvas"
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
      }}
    />
  );
}
