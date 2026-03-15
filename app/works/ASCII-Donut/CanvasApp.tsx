// app/works/donut/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import { App as DonutCoreApp } from "./core/App";

type Props = {
  onReady?: (app: DonutCoreApp | null) => void;
};

export default function CanvasApp({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new DonutCoreApp(canvasRef.current);
    onReady?.(app);

    return () => {
      onReady?.(null);
      app.destroy();
    };
  }, [onReady]);

  return <canvas ref={canvasRef} className="orbit-canvas" />;
}
