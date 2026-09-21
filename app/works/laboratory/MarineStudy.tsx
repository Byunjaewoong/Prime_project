"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Home } from "lucide-react";
import * as THREE from "three";
import { FishModel } from "./core/FishModel";
import { FISH_STYLE_OPTIONS, type FishStyle } from "./core/FishStyles";
import { JellyfishModel } from "./core/JellyfishModel";

type MarineStudyProps = { kind: "jellyfish" | "fish" };

export default function MarineStudy({ kind }: MarineStudyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fishRef = useRef<FishModel | null>(null);
  const fishStyleRef = useRef<FishStyle>("contour");
  const [menuOpen, setMenuOpen] = useState(false);
  const [fishStyle, setFishStyle] = useState<FishStyle>("contour");
  const [unavailable, setUnavailable] = useState(false);
  const jellyfish = kind === "jellyfish";

  const selectFishStyle = (style: FishStyle) => {
    fishStyleRef.current = style;
    setFishStyle(style);
    fishRef.current?.setStyle(style);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch {
      const timer = window.setTimeout(() => setUnavailable(true), 0);
      return () => window.clearTimeout(timer);
    }
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(jellyfish ? 0xdce8ed : 0xffffff, jellyfish ? 1.1 : 1.5));
    const key = new THREE.DirectionalLight(jellyfish ? 0xe8f5ff : 0xffffff, jellyfish ? 2.0 : 1.5);
    key.position.set(-3, 4, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(jellyfish ? 0x8ca7b9 : 0xa6a7a8, 0.9);
    rim.position.set(3, -2, -1);
    scene.add(rim);

    const model = jellyfish ? new JellyfishModel() : new FishModel();
    if (model instanceof FishModel) {
      fishRef.current = model;
      model.setStyle(fishStyleRef.current);
    }
    scene.add(model.group);
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const mobile = width < 650;
      const viewHeight = jellyfish ? (mobile ? 8.8 : 5.3) : (mobile ? 11.5 : 4.8);
      const viewWidth = viewHeight * width / height;
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let frame = 0;
    let started: number | null = null;
    const animate = (now: number) => {
      if (started === null) started = now;
      const time = (now - started) / 1000;
      model.update(time);
      if (jellyfish) model.group.rotation.z = canvas.clientWidth < 650 ? Math.PI / 2 : 0;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.remove(model.group);
      model.dispose();
      fishRef.current = null;
      renderer.dispose();
    };
  }, [jellyfish]);

  return (
    <main style={{ position: "relative", width: "100%", minHeight: "100dvh", overflow: "hidden", color: "#a8bbd2", background: jellyfish ? "radial-gradient(ellipse at 54% 47%, #111722 0%, #080c12 72%, #05080d 100%)" : "#111014", fontFamily: "var(--font-courier), monospace" }}>
      <canvas ref={canvasRef} aria-label={jellyfish ? "Animated neon jellyfish drifting under water" : "A single flat fish swimming from above, its body following its path"} role="img" style={{ display: "block", width: "100%", height: "100dvh", filter: jellyfish ? "drop-shadow(0 0 3px rgba(0,170,255,0.45))" : undefined }} />
      <div className="orbit-fab">
        <div className={"orbit-fab__actions" + (menuOpen ? " orbit-fab__actions--open" : "")}>
          <Link href="/" className="orbit-fab__action" aria-label="Go to main">
            <Home size={20} strokeWidth={2} />
          </Link>
          {menuOpen && (
            <div className="orbit-fab__controls" onClick={event => event.stopPropagation()}>
              <div className="orbit-panel-container">
                <div className="orbit-panel-section">
                  <h4>{jellyfish ? "Jellyfish" : "Ink fish"}</h4>
                  <Link href="/works/laboratory" style={{ color: "inherit", fontSize: 12, opacity: 0.75, textDecoration: "none" }}>← Laboratory</Link>
                  {!jellyfish && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                      <span style={{ fontSize: 11, opacity: 0.65 }}>Fish style</span>
                      {FISH_STYLE_OPTIONS.map(option => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={fishStyle === option.id}
                          onClick={() => selectFishStyle(option.id)}
                          style={{
                            color: "#e5e7eb", textAlign: "left", cursor: "pointer", fontSize: 12,
                            padding: "9px 12px", borderRadius: 8,
                            border: fishStyle === option.id ? "1px solid rgba(125,203,235,0.7)" : "1px solid rgba(255,255,255,0.15)",
                            background: fishStyle === option.id ? "rgba(70,155,190,0.25)" : "rgba(255,255,255,0.04)",
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          className={"orbit-fab__main" + (menuOpen ? " orbit-fab__main--active" : "")}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(open => !open)}
        >
          M
        </button>
      </div>
      {unavailable && <p style={{ position: "absolute", left: 28, bottom: 28, fontSize: 13 }}>WebGL is unavailable on this device.</p>}
    </main>
  );
}
