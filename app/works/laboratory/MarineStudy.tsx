"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FishModel } from "./core/FishModel";
import { JellyfishModel } from "./core/JellyfishModel";

type MarineStudyProps = { kind: "jellyfish" | "fish" };

export default function MarineStudy({ kind }: MarineStudyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  const jellyfish = kind === "jellyfish";

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
    scene.add(model.group);
    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const mobile = width < 650;
      const viewHeight = jellyfish ? (mobile ? 8.8 : 5.3) : (mobile ? 9 : 7.3);
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
    const started = performance.now();
    const animate = (now: number) => {
      const time = (now - started) / 1000;
      model.update(time);
      if (jellyfish) model.group.rotation.z = canvas.clientWidth < 650 ? Math.PI / 2 : 0;
      else if (canvas.clientWidth < 650) model.group.rotation.z += 0.5;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.remove(model.group);
      model.dispose();
      renderer.dispose();
    };
  }, [jellyfish]);

  return (
    <main style={{ position: "relative", width: "100%", minHeight: "100dvh", overflow: "hidden", color: jellyfish ? "#a8bbd2" : "#333b3d", background: jellyfish ? "radial-gradient(ellipse at 54% 47%, #111722 0%, #080c12 72%, #05080d 100%)" : "radial-gradient(ellipse at 48% 48%, #fbfbf8 0%, #e9ebe8 75%, #dfe3e0 100%)", fontFamily: "var(--font-courier), monospace" }}>
      <canvas ref={canvasRef} aria-label={jellyfish ? "Animated neon jellyfish drifting under water" : "Animated fish swimming from above"} role="img" style={{ display: "block", width: "100%", height: "100dvh", filter: jellyfish ? "drop-shadow(0 0 3px rgba(0,170,255,0.45))" : undefined }} />
      <div style={{ position: "absolute", inset: "28px 28px auto", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", pointerEvents: "none" }}>
        <Link href="/works/laboratory" style={{ color: "inherit", textDecoration: "none", fontSize: 13, opacity: 0.7, pointerEvents: "auto" }}>← Laboratory</Link>
        <div style={{ textAlign: "right", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.7 }}>
          <div>{jellyfish ? "Jellyfish" : "Ink fish"}</div>
          <div style={{ marginTop: 5, letterSpacing: "0.02em", textTransform: "none", opacity: 0.7 }}>{jellyfish ? "pulse / drift" : "body wave / swim"}</div>
        </div>
      </div>
      {unavailable && <p style={{ position: "absolute", left: 28, bottom: 28, fontSize: 13 }}>WebGL is unavailable on this device.</p>}
    </main>
  );
}
