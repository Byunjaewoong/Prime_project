"use client";

import Link from "next/link";
import { FlaskConical, Home, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlanetRenderer } from "./core/PlanetRenderer";
import styles from "./planet.module.css";

export default function PlanetExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PlanetRenderer | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [generation, setGeneration] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new PlanetRenderer(canvas);
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  const regenerate = () => {
    rendererRef.current?.regenerate();
    setGeneration((current) => current + 1);
  };

  return (
    <main className={styles.page}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="A large procedural planet rendered at physical-pixel resolution"
      />

      <div className={styles.menuRoot}>
        {menuOpen && (
          <div className={styles.menu} onPointerDown={(event) => event.stopPropagation()}>
            <div className={styles.menuHeader}>
              <span>Planet</span>
              <div className={styles.menuLinks}>
                <Link href="/" aria-label="Home"><Home aria-hidden="true" size={16} /></Link>
                <Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical aria-hidden="true" size={16} /></Link>
              </div>
            </div>
            <section className={styles.menuSection}>
              <h2>Generation</h2>
              <button className={styles.refreshButton} type="button" onClick={regenerate}>
                <span>Regenerate</span>
                <RefreshCw aria-hidden="true" size={16} />
              </button>
              <output className={styles.generation} aria-live="polite">
                #{generation.toString().padStart(2, "0")}
              </output>
            </section>
          </div>
        )}

        <button
          type="button"
          className={`${styles.menuButton} ${menuOpen ? styles.menuButtonActive : ""}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          M
        </button>
      </div>
    </main>
  );
}
