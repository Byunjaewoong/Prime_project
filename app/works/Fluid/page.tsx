// app/works/fluid/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import CanvasApp from "./CanvasApp";

export default function FluidPage() {
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    const threshold = 32;
    const hideOffset = threshold + 80;

    const handleMove = (e: MouseEvent) => {
      if (e.clientX <= threshold) {
        setShowPanel(true);
      } else if (e.clientX > hideOffset) {
        setShowPanel(false);
      }
    };

    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <CanvasApp />

      {/* Side Panel */}
      <div
        className={`orbit-side-panel ${showPanel ? "orbit-side-panel--visible" : ""}`}
        style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: '200px',
            background: 'rgba(0,0,0,0.8)',
            transform: showPanel ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}
      >
        <Link href="/" style={{ color: 'white', textDecoration: 'none', border: '1px solid white', padding: '10px 20px' }}>
          go to main
        </Link>
      </div>

      {/* Simple Home Button */}
      <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 10 }}>
        <Link
            href="/"
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 50,
                height: 50,
                borderRadius: '50%',
                background: 'white',
                color: 'black'
            }}
        >
            <Home size={24} />
        </Link>
      </div>
    </main>
  );
}
