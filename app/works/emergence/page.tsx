// app/works/emergence/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";
import { App as EmergenceApp } from "./core/App";
import { SimType } from "./core/types";

const SIMS: {
  type: SimType;
  label: string;
  sub: string;
  desc: string;
}[] = [
  {
    type: "lenia",
    label: "Lenia",
    sub: "continuous life",
    desc: "kernel convolution → organic patterns",
  },
  {
    type: "boids",
    label: "Boids",
    sub: "flocking",
    desc: "3 rules → emergent murmuration",
  },
  {
    type: "grayscott",
    label: "Gray-Scott",
    sub: "reaction–diffusion",
    desc: "2 chemicals → labyrinthine structures",
  },
  {
    type: "physarum",
    label: "Physarum",
    sub: "slime mold",
    desc: "trail-following → optimal networks",
  },
];

export default function EmergencePage() {
  const appRef = useRef<EmergenceApp | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [currentSim, setCurrentSim] = useState<SimType | null>(null);
  const [hovered, setHovered] = useState<SimType | null>(null);
  const [gsParams, setGsParams] = useState<Record<string, number> | null>(null);

  // Poll params while FAB is open on grayscott so values stay fresh
  useEffect(() => {
    if (!fabOpen || currentSim !== "grayscott") return;
    setGsParams(appRef.current?.getSimParams() ?? null);
    const id = setInterval(() => {
      setGsParams(appRef.current?.getSimParams() ?? null);
    }, 200);
    return () => clearInterval(id);
  }, [fabOpen, currentSim]);

  // Toggle H-value debug overlay on the canvas when FAB is open on grayscott
  useEffect(() => {
    if (currentSim !== "grayscott") return;
    appRef.current?.setDebugOverlay(fabOpen);
    return () => appRef.current?.setDebugOverlay(false);
  }, [fabOpen, currentSim]);

  // Left slide panel
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

  const handleReady = useCallback((app: EmergenceApp | null) => {
    appRef.current = app;
  }, []);

  const selectSim = (type: SimType) => {
    setShowOverlay(false);
    setCurrentSim(type);
    appRef.current?.setSim(type);
    setFabOpen(false);
  };

  const goBack = () => {
    appRef.current?.stopSim();
    setCurrentSim(null);
    setShowOverlay(true);
    setFabOpen(false);
  };

  const simInfo = SIMS.find((s) => s.type === currentSim);

  return (
    <main className="full-canvas-page">
      <CanvasApp onReady={handleReady} />

      {/* ── Selection overlay ─────────────────────────────────────── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.96)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          zIndex: 100,
          opacity: showOverlay ? 1 : 0,
          pointerEvents: showOverlay ? "auto" : "none",
          transition: "opacity 0.5s ease",
        }}
      >
        <p
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            letterSpacing: "0.3em",
            color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase",
          }}
        >
          emergence
        </p>

        {/* 2×2 tile grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          {SIMS.map((s) => (
            <button
              key={s.type}
              onClick={() => selectSim(s.type)}
              onMouseEnter={() => setHovered(s.type)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: 200,
                height: 140,
                background:
                  hovered === s.type
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.03)",
                border: `1px solid ${
                  hovered === s.type
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(255,255,255,0.1)"
                }`,
                borderRadius: 6,
                color: "white",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "flex-end",
                padding: "16px 18px",
                transition: "background 0.2s, border-color 0.2s",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 15,
                  fontWeight: "bold",
                  letterSpacing: "0.05em",
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 10,
                  opacity: 0.45,
                  marginTop: 4,
                  letterSpacing: "0.1em",
                }}
              >
                {hovered === s.type ? s.desc : s.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Left slide panel ──────────────────────────────────────── */}
      <div
        className={
          "orbit-side-panel" + (showPanel ? " orbit-side-panel--visible" : "")
        }
      >
        <Link href="/" className="orbit-side-panel__button">
          go to main
        </Link>
      </div>

      {/* ── FAB ───────────────────────────────────────────────────── */}
      <div className="orbit-fab">
        <div
          className={
            "orbit-fab__actions" + (fabOpen ? " orbit-fab__actions--open" : "")
          }
        >
          <Link
            href="/"
            className="orbit-fab__action"
            aria-label="go to main"
            onClick={(e) => e.stopPropagation()}
          >
            🏠
          </Link>

          {fabOpen && (
            <div
              className="orbit-fab__controls"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="orbit-panel-container">
                <div className="orbit-panel-section">
                  <h4>
                    {simInfo ? simInfo.label : "emergence"}
                  </h4>
                  {simInfo && (
                    <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                      {simInfo.sub}
                    </p>
                  )}
                  {currentSim && (
                    <button
                      style={{
                        marginTop: 12,
                        fontSize: 11,
                        padding: "4px 10px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 4,
                        color: "inherit",
                        cursor: "pointer",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        goBack();
                      }}
                    >
                      ← back to selection
                    </button>
                  )}
                  {!currentSim && (
                    <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
                      select a simulation
                    </p>
                  )}
                </div>

                {/* GrayScott params — scroll to adjust */}
                {currentSim === "grayscott" && gsParams && (() => {
                  const PARAMS: { key: string; label: string; min: number; max: number; step: number }[] = [
                    { key: "F",         label: "feed rate",   min: 0.020, max: 0.080, step: 0.001  },
                    { key: "K",         label: "kill rate",   min: 0.060, max: 0.075, step: 0.001  },
                    { key: "DU",        label: "diffusion U", min: 0.10,  max: 0.22,  step: 0.005  },
                    { key: "DV",        label: "diffusion V", min: 0.05,  max: 0.15,  step: 0.005  },
                    { key: "noiseKAmp", label: "noise K",     min: 0.000, max: 0.030, step: 0.001  },
                  ];
                  return (
                    <div className="orbit-panel-section" style={{ marginTop: 8 }}>
                      <p style={{ fontSize: 10, letterSpacing: "0.15em", opacity: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
                        parameters · scroll to adjust
                      </p>
                      {PARAMS.map(({ key, label, min, max, step }) => {
                        const val = gsParams[key] ?? 0;
                        const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
                        const applyVal = (raw: number) => {
                          const rounded = Math.round(raw / step) * step;
                          const clamped = +Math.min(max, Math.max(min, rounded)).toFixed(4);
                          appRef.current?.setSimParam(key, clamped);
                          setGsParams((prev) => prev ? { ...prev, [key]: clamped } : prev);
                        };
                        return (
                          <div
                            key={key}
                            onWheel={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              applyVal(val + (e.deltaY < 0 ? 1 : -1) * step);
                            }}
                            style={{ marginBottom: 8, userSelect: "none" }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                              <span style={{ opacity: 0.5 }}>{label}</span>
                              <span style={{ color: "#7df", fontFamily: "monospace" }}>{val.toFixed(4)}</span>
                            </div>
                            {/* bar — click to set, drag to scrub */}
                            <div
                              style={{ height: 8, display: "flex", alignItems: "center", cursor: "ew-resize" }}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                const rect = e.currentTarget.getBoundingClientRect();
                                applyVal(min + ((e.clientX - rect.left) / rect.width) * (max - min));
                              }}
                              onPointerMove={(e) => {
                                if (!(e.buttons & 1)) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                applyVal(min + ((e.clientX - rect.left) / rect.width) * (max - min));
                              }}
                            >
                              <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: "#7df", borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={
            "orbit-fab__main" + (fabOpen ? " orbit-fab__main--active" : "")
          }
          onClick={() => setFabOpen((p) => !p)}
          aria-label="menu"
        >
          M
        </button>
      </div>
    </main>
  );
}
