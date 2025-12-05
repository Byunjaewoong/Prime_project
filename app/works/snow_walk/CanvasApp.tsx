// app/works/snow_walk/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App } from "./core/App";

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new App(canvas);

    return () => {
      app.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed", // ✅ 뷰포트에 직접 고정
        inset: 0,          // top:0, right:0, bottom:0, left:0
        width: "100vw",
        height: "100vh",
        display: "block",
        background: "#020617",
      }}
    />
  );
}
