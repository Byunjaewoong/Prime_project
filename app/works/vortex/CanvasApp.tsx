// app/works/vortex/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as VortexApp } from "./core/App";

type Props = {
  onReady?: (app: VortexApp | null) => void;
};

export default function CanvasApp({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<VortexApp | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const app = new VortexApp(canvas);
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
