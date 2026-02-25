// app/works/weatherProject/CanvasApp.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { App as WeatherProjectApp } from "./core/App";

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<WeatherProjectApp | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new WeatherProjectApp(canvas, () => setIsReady(true));
    appRef.current = app;

    const handleClick = () => app.cycleFilter();
    canvas.addEventListener('click', handleClick);

    return () => {
      canvas.removeEventListener('click', handleClick);
      app.destroy();
      appRef.current = null;
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100vh",
        }}
      />

      {/* 로딩 오버레이 — 모든 FBX 로드 완료 시 페이드 아웃 */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#1a0800",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          zIndex: 200,
          opacity: isReady ? 0 : 1,
          pointerEvents: isReady ? "none" : "auto",
          transition: "opacity 1.2s ease",
        }}
      >
        {/* 태양 펄스 */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#ffcc44",
            boxShadow: "0 0 40px 16px #ff660055, 0 0 80px 32px #ff440022",
            animation: "wp-pulse 2s ease-in-out infinite",
          }}
        />
        <p
          style={{
            color: "#ff9944",
            fontSize: 13,
            letterSpacing: "0.25em",
            fontFamily: "monospace",
            opacity: 0.7,
          }}
        >
          loading
        </p>

        <style>{`
          @keyframes wp-pulse {
            0%, 100% { transform: scale(1);   opacity: 0.85; }
            50%       { transform: scale(1.18); opacity: 1;    }
          }
        `}</style>
      </div>
    </>
  );
}
