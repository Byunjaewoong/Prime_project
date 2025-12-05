// works/orbit_three/CanvasApp.tsx
"use client";

import { useEffect, useRef } from "react";
import initThreeApp from "./core/ThreeApp";

export default function CanvasApp() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { dispose } = initThreeApp(containerRef.current);

    return () => {
      dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "520px",
        borderRadius: "16px",
        overflow: "hidden",
        background: "radial-gradient(circle at top, #020617, #000000)",
        border: "1px solid rgba(148, 163, 184, 0.3)",
      }}
    />
  );
}
