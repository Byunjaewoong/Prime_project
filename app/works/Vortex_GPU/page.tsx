// app/works/Vortex_GPU/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";
import type { App as FluidGpuApp } from "./core/App";

export default function VortexGpuPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [app, setApp] = useState<FluidGpuApp | null>(null);

  const [vorticity, setVorticity] = useState(9);
  const [dyeDecay, setDyeDecay] = useState(0.996);
  const [force, setForce] = useState(0.2);
  const [drag, setDrag] = useState(0.995);
  const [viscosity, setViscosity] = useState(0.00001);
  const [saturation, setSaturation] = useState(1.3);
  const [brightness, setBrightness] = useState(0.6);
  const [showVectors, setShowVectors] = useState(false);

  /* ── Desktop: left-edge hover panel ─── */
  useEffect(() => {
    const threshold = 32, hideOffset = threshold + 80;
    const handleMove = (e: MouseEvent) => {
      if (e.clientX <= threshold) setShowPanel(true);
      else if (e.clientX > hideOffset) setShowPanel(false);
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  const onReady = useCallback((a: FluidGpuApp | null) => { setApp(a); }, []);

  const updateParam = (key: string, value: number) => {
    app?.setParam(key, value);
    switch (key) {
      case "vorticity": setVorticity(value); break;
      case "dyeDecay": setDyeDecay(value); break;
      case "force": setForce(value); break;
      case "drag": setDrag(value); break;
      case "viscosity": setViscosity(value); break;
      case "saturation": setSaturation(value); break;
      case "brightness": setBrightness(value); break;
    }
  };

  return (
    <main className="full-canvas-page">
      <CanvasApp onReady={onReady} />

      {/* ── Left slide panel (desktop hover) ─────────────────────── */}
      <div className={"orbit-side-panel" + (showPanel ? " orbit-side-panel--visible" : "")}>
        <Link href="/" className="orbit-side-panel__button">go to main</Link>
      </div>

      {/* ── FAB (mobile drag / desktop hover) ────────────────────── */}
      <div className="orbit-fab">
        <div className={"orbit-fab__actions" + (fabOpen ? " orbit-fab__actions--open" : "")}>
          <Link href="/" className="orbit-fab__action" aria-label="go to main" onClick={(e) => e.stopPropagation()}>
            🏠
          </Link>

          {fabOpen && (
            <div className="orbit-fab__controls" onClick={(e) => e.stopPropagation()}>
              <div className="orbit-panel-container">
                <div className="orbit-panel-section">
                  <h4>Vortex GPU</h4>
                  <p style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>stable fluids (GPU)</p>

                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Vorticity</span>
                        <span style={{ fontFamily: "monospace" }}>{vorticity.toFixed(1)}</span>
                      </span>
                      <input type="range" min="0" max="15" step="0.5" value={vorticity}
                        onChange={(e) => updateParam("vorticity", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Dye Decay</span>
                        <span style={{ fontFamily: "monospace" }}>{dyeDecay.toFixed(3)}</span>
                      </span>
                      <input type="range" min="0.980" max="1.000" step="0.001" value={dyeDecay}
                        onChange={(e) => updateParam("dyeDecay", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Force</span>
                        <span style={{ fontFamily: "monospace" }}>{force.toFixed(2)}</span>
                      </span>
                      <input type="range" min="0.1" max="2" step="0.1" value={force}
                        onChange={(e) => updateParam("force", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Drag</span>
                        <span style={{ fontFamily: "monospace" }}>{drag.toFixed(3)}</span>
                      </span>
                      <input type="range" min="0.900" max="1.000" step="0.005" value={drag}
                        onChange={(e) => updateParam("drag", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Viscosity</span>
                        <span style={{ fontFamily: "monospace" }}>{viscosity.toFixed(5)}</span>
                      </span>
                      <input type="range" min="0" max="0.0002" step="0.00001" value={viscosity}
                        onChange={(e) => updateParam("viscosity", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Saturation</span>
                        <span style={{ fontFamily: "monospace" }}>{saturation.toFixed(1)}</span>
                      </span>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={saturation}
                        onChange={(e) => updateParam("saturation", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
                      <span style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ opacity: 0.5 }}>Brightness</span>
                        <span style={{ fontFamily: "monospace" }}>{brightness.toFixed(1)}</span>
                      </span>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={brightness}
                        onChange={(e) => updateParam("brightness", parseFloat(e.target.value))} style={{ width: "100%" }} />
                    </label>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = !showVectors;
                        setShowVectors(next);
                        if (app) app.showVectors = next;
                      }}
                      style={{
                        fontSize: 11, padding: "4px 10px",
                        background: showVectors ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 4, color: "inherit", cursor: "pointer",
                      }}
                    >
                      {showVectors ? "⇢ vectors ON" : "⇢ vectors"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); app?.reset(); }}
                      style={{
                        fontSize: 11, padding: "4px 10px",
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 4, color: "inherit", cursor: "pointer",
                      }}
                    >
                      ↺ reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={"orbit-fab__main" + (fabOpen ? " orbit-fab__main--active" : "")}
          onClick={() => setFabOpen((p) => !p)}
          aria-label="menu"
        >
          M
        </button>
      </div>
    </main>
  );
}
