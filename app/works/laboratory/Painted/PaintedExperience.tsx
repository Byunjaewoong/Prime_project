"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PaintedRenderer } from "./core/PaintedRenderer";
import styles from "./painted.module.css";

export default function PaintedExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PaintedRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new PaintedRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  return <main className={styles.page}>
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      role="button"
      tabIndex={0}
      aria-label="Painted texture. Click, tap, or press Enter to change its color."
      onClick={() => rendererRef.current?.changeColor()}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          rendererRef.current?.changeColor();
        }
      }}
    />
    <div className={styles.menuRoot}>
      {menuOpen && <nav className={styles.menu} aria-label="Painted navigation">
        <span>Painted</span>
        <div className={styles.menuLinks}>
          <Link href="/" aria-label="Home"><Home size={16} /></Link>
          <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={16} /></Link>
        </div>
      </nav>}
      <button className={styles.menuButton} type="button" aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>M</button>
    </div>
  </main>;
}
