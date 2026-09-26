// app/works/orbit2/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App } from "./core/App";

type CanvasAppProps = {
  orbitSpeed: number;
};

export default function CanvasApp({ orbitSpeed }: CanvasAppProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<App | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new App(canvas);
    appRef.current = app;

    return () => {
      if (appRef.current) {
        appRef.current.destroy();
      }
      appRef.current = null;
    };
  }, []);

  useEffect(() => {
    appRef.current?.setOrbitSpeed(orbitSpeed);
  }, [orbitSpeed]);

  return <canvas ref={canvasRef} className="orbit-canvas" />;
}
