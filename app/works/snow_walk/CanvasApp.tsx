// app/works/Snow_walk/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as snow_walkApp } from "./core/App";

type CanvasAppProps = {
  // 나중에 컨트롤 하고 싶으면 onReady로 App 인스턴스 받아갈 수 있게
  onReady?: (app: snow_walkApp | null) => void;
};

export default function CanvasApp({ onReady }: CanvasAppProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<snow_walkApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new snow_walkApp(canvas);
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
        width: "100",
        height: "100",
      }}
    />
  );
}
