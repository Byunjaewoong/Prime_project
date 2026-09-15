// app/works/Snow_walk/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as snow_walkApp } from "./core/App";
import type { CameraFilters } from "./core/CameraFilter";

type CanvasAppProps = {
  cameraFilters?: CameraFilters;
  // 나중에 컨트롤 하고 싶으면 onReady로 App 인스턴스 받아갈 수 있게
  onReady?: (app: snow_walkApp | null) => void;
};

const DEFAULT_FILTERS: CameraFilters = { haze: true, grain: true, vignette: true, tone: true };

export default function CanvasApp({ onReady, cameraFilters = DEFAULT_FILTERS }: CanvasAppProps) {
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

  useEffect(() => {
    for (const [key, enabled] of Object.entries(cameraFilters)) {
      appRef.current?.setCameraFilter(key as keyof CameraFilters, enabled);
    }
  }, [cameraFilters]);

  return (
    <canvas
      ref={canvasRef}
      className="full-canvas"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
      }}
    />
  );
}
