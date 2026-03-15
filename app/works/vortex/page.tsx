// app/works/vortex/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";
import type { App as VortexApp } from "./core/App";

export default function VortexPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [app, setApp] = useState<VortexApp | null>(null);

  // params
  const [vorticity, setVorticity] = useState(5);
  const [dyeDecay, setDyeDecay] = useState(0.995);
  const [force, setForce] = useState(15);

  // side panel hover
  useEffect(() => {
    const threshold = 32;
    const hideOffset = threshold + 80;
    const handleMove = (e: MouseEvent) => {
      if (e.clientX <= threshold) setShowPanel(true);
      else if (e.clientX > hideOffset) setShowPanel(false);
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const onReady = useCallback((a: VortexApp | null) => {
    setApp(a);
  }, []);

  const updateParam = (key: string, value: number) => {
    app?.setParam(key, value);
    switch (key) {
      case "vorticity":
        setVorticity(value);
        break;
      case "dyeDecay":
        setDyeDecay(value);
        break;
      case "force":
        setForce(value);
        break;
    }
  };

  return (
    <main className="full-canvas-page">
      <CanvasApp onReady={onReady} />

      {/* Side Panel */}
      <div
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "200px",
          background: "rgba(0,0,0,0.8)",
          transform: showPanel ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.3s ease",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        <Link
          href="/"
          style={{
            color: "white",
            textDecoration: "none",
            border: "1px solid white",
            padding: "10px 20px",
          }}
        >
          go to main
        </Link>
        <Link
          href="/works/laboratory"
          style={{
            color: "white",
            textDecoration: "none",
            border: "1px solid white",
            padding: "10px 20px",
          }}
        >
          laboratory
        </Link>
      </div>

      {/* Controls toggle */}
      <button
        onClick={() => setShowControls(!showControls)}
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 20,
          background: "rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.5)",
          border: "none",
          padding: "8px 14px",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: "12px",
          borderRadius: "4px",
        }}
      >
        {showControls ? "Close Controls" : "Open Controls"}
      </button>

      {/* Controls Panel */}
      {showControls && (
        <div
          style={{
            position: "fixed",
            top: 56,
            right: 20,
            zIndex: 20,
            background: "rgba(0,0,0,0.85)",
            color: "white",
            padding: "20px",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "12px",
            minWidth: "220px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Vorticity: {vorticity.toFixed(1)}
            <input
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={vorticity}
              onChange={(e) =>
                updateParam("vorticity", parseFloat(e.target.value))
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Dye Decay: {dyeDecay.toFixed(3)}
            <input
              type="range"
              min="0.980"
              max="1.000"
              step="0.001"
              value={dyeDecay}
              onChange={(e) =>
                updateParam("dyeDecay", parseFloat(e.target.value))
              }
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            Force: {force}
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={force}
              onChange={(e) =>
                updateParam("force", parseFloat(e.target.value))
              }
              style={{ width: "100%" }}
            />
          </label>

          <button
            onClick={() => app?.reset()}
            style={{
              padding: "8px",
              background: "rgba(255,255,255,0.15)",
              color: "white",
              border: "none",
              cursor: "pointer",
              borderRadius: "4px",
              fontFamily: "monospace",
            }}
          >
            Reset
          </button>
        </div>
      )}
    </main>
  );
}
