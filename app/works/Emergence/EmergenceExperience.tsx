// app/works/emergence/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CanvasApp from "./CanvasApp";
import { App as EmergenceApp } from "./core/App";
import { SimType } from "./core/types";

// ── Lenia G(Uo, Ui) 2D phase diagram ─────────────────────────────────────────
function LeniaPhaseChart({ params }: { params: Record<string, number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d")!;
    const {
      UO_LO1 = 0.26, UO_HI1 = 0.46,
      UO_LO2 = 0.27, UO_HI2 = 0.36,
      UI_THR  = 0.50,
    } = params;

    // Draw phase map pixel by pixel
    const img = ctx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const uo = px / W;
        const ui = 1 - py / H;   // Y flipped: Ui=1 at top
        const alive = ui >= UI_THR
          ? (uo >= UO_LO1 && uo <= UO_HI1)
          : (uo >= UO_LO2 && uo <= UO_HI2);
        const i = (py * W + px) * 4;
        const v = alive ? 210 : 18;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // UI_THR horizontal dashed line
    ctx.strokeStyle = "rgba(170,238,255,0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    const thrY = H * (1 - UI_THR);
    ctx.beginPath(); ctx.moveTo(0, thrY); ctx.lineTo(W, thrY); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "8px monospace";
    ctx.fillText("0", 2, H - 2);
    ctx.fillText("1", W - 6, H - 2);
    ctx.fillText("Uo →", W / 2 - 14, H - 2);
    ctx.fillText("1", 2, 9);
    ctx.fillText("Ui", 2, H / 2 + 4);
  }, [params]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={110}
      style={{
        width: "100%",
        display: "block",
        borderRadius: 3,
        marginBottom: 10,
        imageRendering: "pixelated",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    />
  );
}

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
  {
    type: "atoms",
    label: "Atoms",
    sub: "particle forces",
    desc: "directed attraction · repulsion",
  },
];

const SIM_ROUTES: Record<string, SimType> = {
  lenia: "lenia",
  boids: "boids",
  "gray-scott": "grayscott",
  physarum: "physarum",
  atoms: "atoms",
};

export default function EmergenceExperience() {
  const pathname = usePathname();
  const routeName = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const routeSim = SIM_ROUTES[routeName] ?? null;
  const appRef = useRef<EmergenceApp | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(routeSim === null);
  const [currentSim, setCurrentSim] = useState<SimType | null>(routeSim);
  const [hovered, setHovered] = useState<SimType | null>(null);
  const [gsParams, setGsParams] = useState<Record<string, number> | null>(null);
  const [leniaParams, setLeniaParams] = useState<Record<string, number> | null>(null);
  const [atomParams, setAtomParams] = useState<Record<string, number> | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchDevice(media.matches || navigator.maxTouchPoints > 0);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Poll params while FAB is open on grayscott so values stay fresh
  useEffect(() => {
    if (!fabOpen || currentSim !== "grayscott") return;
    const id = setInterval(() => {
      setGsParams(appRef.current?.getSimParams() ?? null);
    }, 200);
    return () => clearInterval(id);
  }, [fabOpen, currentSim]);

  // Poll params while FAB is open on lenia
  useEffect(() => {
    if (!fabOpen || currentSim !== "lenia") return;
    const id = setInterval(() => {
      setLeniaParams(appRef.current?.getSimParams() ?? null);
    }, 200);
    return () => clearInterval(id);
  }, [fabOpen, currentSim]);

  // Toggle H-value debug overlay on the canvas when FAB is open on grayscott
  useEffect(() => {
    if (!fabOpen || currentSim !== "atoms") return;
    const id = setInterval(() => {
      setAtomParams(appRef.current?.getSimParams() ?? null);
    }, 200);
    return () => clearInterval(id);
  }, [fabOpen, currentSim]);

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
    if (app && routeSim) app.setSim(routeSim);
  }, [routeSim]);

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
                    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                      <button
                        style={{
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
                        ← back
                      </button>
                      <button
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          background: "rgba(255,255,255,0.07)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: 4,
                          color: "inherit",
                          cursor: "pointer",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          appRef.current?.resetSim();
                        }}
                      >
                        ↺ reset
                      </button>
                    </div>
                  )}
                  {!currentSim && (
                    <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>
                      select a simulation
                    </p>
                  )}
                </div>

                {/* Lenia params — scroll / drag to adjust */}
                {currentSim === "lenia" && leniaParams && (() => {
                  const mode = leniaParams._mode ?? 0;
                  const isExpanded = mode === 1;
                  const isLifeforms = mode === 2;
                  const PARAMS_STD: { key: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
                    { key: "R",       label: "kernel radius",  min: 8,    max: 20,   step: 1,     fmt: v => v.toFixed(0)  },
                    { key: "SIGMA_K", label: "kernel width",   min: 0.03, max: 0.22, step: 0.005, fmt: v => v.toFixed(3)  },
                    { key: "MU",      label: "growth center",  min: 0.08, max: 0.25, step: 0.002, fmt: v => v.toFixed(3)  },
                    { key: "SIGMA_G", label: "growth width",   min: 0.02, max: 0.14, step: 0.002, fmt: v => v.toFixed(3)  },
                    { key: "DT",      label: "time step",      min: 0.04, max: 0.18, step: 0.005, fmt: v => v.toFixed(3)  },
                  ];
                  const PARAMS_EXP: { key: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
                    { key: "R",       label: "outer radius",   min: 8,    max: 20,   step: 1,     fmt: v => v.toFixed(0)  },
                    { key: "R_I",     label: "inner radius",   min: 3,    max: 12,   step: 1,     fmt: v => v.toFixed(0)  },
                    { key: "UO_LO1",  label: "Uo lo (Ui≥thr)", min: 0.05, max: 0.80, step: 0.005, fmt: v => v.toFixed(3)  },
                    { key: "UO_HI1",  label: "Uo hi (Ui≥thr)", min: 0.05, max: 0.90, step: 0.005, fmt: v => v.toFixed(3)  },
                    { key: "UO_LO2",  label: "Uo lo (Ui<thr)", min: 0.05, max: 0.80, step: 0.005, fmt: v => v.toFixed(3)  },
                    { key: "UO_HI2",  label: "Uo hi (Ui<thr)", min: 0.05, max: 0.90, step: 0.005, fmt: v => v.toFixed(3)  },
                    { key: "UI_THR",  label: "Ui threshold",   min: 0.20, max: 0.80, step: 0.01,  fmt: v => v.toFixed(2)  },
                    { key: "DT",      label: "time step",      min: 0.04, max: 0.18, step: 0.005, fmt: v => v.toFixed(3)  },
                  ];
                  const PARAMS = isLifeforms ? [] : isExpanded ? PARAMS_EXP : PARAMS_STD;
                  return (
                    <div className="orbit-panel-section" style={{ marginTop: 8 }}>
                      {isExpanded && <LeniaPhaseChart params={leniaParams} />}
                      {isLifeforms && (
                        <div style={{ marginBottom: 10, padding: "8px 9px", border: "1px solid rgba(170,238,255,0.25)", borderRadius: 5, background: "rgba(170,238,255,0.06)" }}>
                          <div style={{ fontSize: 11, color: "#aef", marginBottom: 3 }}>Lenia lifeforms</div>
                          <div style={{ fontSize: 10, lineHeight: 1.45, opacity: 0.55 }}>
                            right-click the field to add one organism with a random heading
                          </div>
                        </div>
                      )}
                      {/* Alive % monitor */}
                      {(() => {
                        const pct = leniaParams._alivePct ?? 0;
                        const color = pct > 30 ? "#8f8" : pct > 8 ? "#ff8" : "#f88";
                        return (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 10 }}>
                            <span style={{ opacity: 0.5 }}>alive cells</span>
                            <span style={{ fontFamily: "monospace", color }}>{pct.toFixed(1)}%</span>
                          </div>
                        );
                      })()}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <p style={{ fontSize: 10, letterSpacing: "0.15em", opacity: 0.4, textTransform: "uppercase", margin: 0 }}>
                          {isLifeforms ? "shared-rule organisms" : "parameters · scroll to adjust"}
                        </p>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            style={{
                              fontSize: 10,
                              padding: "3px 8px",
                              background: "rgba(255,255,255,0.07)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: 4,
                              color: "#fff",
                              cursor: "pointer",
                              letterSpacing: "0.05em",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              appRef.current?.randomiseParams();
                              setLeniaParams(appRef.current?.getSimParams() ?? null);
                            }}
                          >
                            {isLifeforms ? "reset" : "random"}
                          </button>
                          {!isLifeforms && (() => {
                            const isDelta = (leniaParams._deltaActive ?? 0) === 1;
                            return (
                              <button
                                style={{
                                  fontSize: 10,
                                  padding: "3px 8px",
                                  background: isDelta ? "rgba(255,180,80,0.18)" : "rgba(255,255,255,0.07)",
                                  border: `1px solid ${isDelta ? "rgba(255,180,80,0.55)" : "rgba(255,255,255,0.2)"}`,
                                  borderRadius: 4,
                                  color: isDelta ? "#fb4" : "inherit",
                                  cursor: "pointer",
                                  letterSpacing: "0.05em",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  appRef.current?.toggleLeniaDelta();
                                  setLeniaParams(appRef.current?.getSimParams() ?? null);
                                }}
                              >
                                delta
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 12 }}>
                        {[
                          { value: 1, label: "expanded" },
                          { value: 0, label: "standard" },
                          { value: 2, label: "lifeforms" },
                        ].map(option => {
                          const active = mode === option.value;
                          return (
                            <button
                              key={option.value}
                              style={{
                                fontSize: 10,
                                padding: "5px 4px",
                                background: active ? "rgba(170,238,255,0.15)" : "rgba(255,255,255,0.07)",
                                border: `1px solid ${active ? "rgba(170,238,255,0.5)" : "rgba(255,255,255,0.2)"}`,
                                borderRadius: 4,
                                color: active ? "#aef" : "inherit",
                                cursor: "pointer",
                                letterSpacing: "0.04em",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                appRef.current?.setLeniaMode(option.value);
                                setLeniaParams(appRef.current?.getSimParams() ?? null);
                              }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {PARAMS.map(({ key, label, min, max, step, fmt }) => {
                        const val = leniaParams[key] ?? 0;
                        const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
                        const applyVal = (raw: number) => {
                          const rounded = Math.round(raw / step) * step;
                          const clamped = +Math.min(max, Math.max(min, rounded)).toFixed(5);
                          appRef.current?.setSimParam(key, clamped);
                          setLeniaParams((prev) => prev ? { ...prev, [key]: clamped } : prev);
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
                              <span style={{ color: "#aef", fontFamily: "monospace" }}>{fmt(val)}</span>
                            </div>
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
                                <div style={{ width: `${pct}%`, height: "100%", background: "#aef", borderRadius: 2 }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {currentSim === "atoms" && atomParams && (() => {
                  const colors = ["#f04464", "#20c8e8", "#f2c94c", "#54d66b", "#a56cff"]
                    .slice(0, atomParams.colors ?? 5);
                  const controls = [
                    { key: "particles", label: "particle number", min: 16, max: 300000, step: 16, decimals: 0 },
                    { key: "colors", label: "color types", min: 1, max: 5, step: 1, decimals: 0 },
                    ...(isTouchDevice ? [{ key: "worldScale", label: "world size", min: 0.5, max: 4, step: 0.05, decimals: 2 }] : []),
                    { key: "repel", label: "repel force", min: 0.01, max: 4, step: 0.01, decimals: 2 },
                    { key: "forceFactor", label: "force multiplier", min: 0.01, max: 2, step: 0.01, decimals: 2 },
                    { key: "friction", label: "friction", min: 0, max: 1, step: 0.01, decimals: 2 },
                    { key: "particleSize", label: "particle size", min: 0.1, max: 6, step: 0.1, decimals: 1 },
                  ];
                  return (
                    <div className="orbit-panel-section" style={{ marginTop: 8 }}>
                      <div style={{ padding: "8px 9px", marginBottom: 12, borderRadius: 5, background: "rgba(255,255,255,0.04)", fontSize: 10, lineHeight: 1.55, opacity: 0.65 }}>
                        <div>WebGPU compute · spatial bins · instanced render</div>
                        <div>d &lt; min radius · linear repulsion</div>
                        <div>min–max radius · signed triangular force</div>
                        <div>matrix direction · row reacts to column</div>
                        <div style={{ marginTop: 3 }}>
                          {isTouchDevice ? "pinch · camera zoom / world size · field bounds" : "wheel · world size / left-drag · pan"}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 10 }}>
                        <span style={{ opacity: 0.5 }}>
                          {atomParams.gpu === 1 ? "WebGPU" : atomParams.gpuFailed === 1 || atomParams.gpu === undefined ? "CPU fallback" : "WebGPU loading"}
                          {` · world ${(atomParams.worldScale ?? 1).toFixed(2)}×`}
                        </span>
                        <span style={{ color: "#aef", fontFamily: "monospace" }}>
                          {atomParams.fps ? `${atomParams.fps.toFixed(0)} fps · ` : ""}{atomParams.zoom?.toFixed(2)}×
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, letterSpacing: "0.12em", opacity: 0.45, textTransform: "uppercase" }}>directed force matrix</span>
                        <button
                          style={{ fontSize: 10, padding: "3px 7px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, color: "inherit", cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            appRef.current?.randomiseParams();
                            setAtomParams(appRef.current?.getSimParams() ?? null);
                          }}
                        >
                          randomize
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: `20px repeat(${colors.length}, 1fr)`, gap: 3, marginBottom: 12 }}>
                        <span />
                        {colors.map(color => <span key={`head-${color}`} style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, justifySelf: "center", alignSelf: "center" }} />)}
                        {colors.flatMap((rowColor, i) => [
                          <span key={`row-${rowColor}`} style={{ width: 8, height: 8, borderRadius: "50%", background: rowColor, boxShadow: `0 0 6px ${rowColor}`, alignSelf: "center" }} />,
                          ...colors.map((_, j) => {
                            const rule = atomParams[`matrixRule_${i}_${j}`] ?? 0;
                            const minRadius = atomParams[`matrixMin_${i}_${j}`] ?? 0;
                            const maxRadius = atomParams[`matrixMax_${i}_${j}`] ?? 0;
                            const positive = rule >= 0;
                            return (
                              <span
                                key={`${i}-${j}`}
                                title={`rule ${rule.toFixed(2)}, radius ${minRadius.toFixed(0)}–${maxRadius.toFixed(0)}`}
                                style={{ minWidth: 34, padding: "4px 1px", borderRadius: 3, textAlign: "center", fontFamily: "monospace", fontSize: 8, lineHeight: 1.15, color: positive ? "#9ddcff" : "#ff9dab", background: positive ? "rgba(80,170,255,0.10)" : "rgba(255,80,105,0.11)", border: `1px solid ${positive ? "rgba(100,190,255,0.20)" : "rgba(255,100,120,0.22)"}` }}
                              >
                                <b>{rule >= 0 ? "+" : ""}{rule.toFixed(1)}</b><br />{minRadius.toFixed(0)}–{maxRadius.toFixed(0)}
                              </span>
                            );
                          }),
                        ])}
                      </div>
                      {controls.map(({ key, label, min, max, step, decimals }) => {
                        const value = atomParams[key] ?? min;
                        return (
                          <label key={key} style={{ display: "block", marginBottom: 10 }}>
                            <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                              <span style={{ opacity: 0.5 }}>{label}</span>
                              <span style={{ color: "#aef", fontFamily: "monospace" }}>{value.toFixed(decimals)}</span>
                            </span>
                            <input
                              type="range"
                              min={min}
                              max={max}
                              step={step}
                              value={value}
                              style={{ width: "100%", accentColor: "#aef" }}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                appRef.current?.setSimParam(key, next);
                                setAtomParams(prev => prev ? { ...prev, [key]: next } : prev);
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}

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
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <p style={{ fontSize: 10, letterSpacing: "0.15em", opacity: 0.4, textTransform: "uppercase", margin: 0 }}>
                          parameters · scroll to adjust
                        </p>
                        <button
                          style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            background: "rgba(255,255,255,0.07)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: 4,
                            color: "#fff",
                            cursor: "pointer",
                            letterSpacing: "0.05em",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            appRef.current?.randomiseParams();
                            setGsParams(appRef.current?.getSimParams() ?? null);
                          }}
                        >
                          random
                        </button>
                      </div>
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
