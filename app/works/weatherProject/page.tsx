// app/works/weatherProject/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";

export default function WeatherProjectPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

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

  const toggleFab = () => setFabOpen((prev) => !prev);

  return (
    <main className="full-canvas-page">
      <CanvasApp />

      {/* 왼쪽 슬라이드 패널 */}
      <div
        className={
          "orbit-side-panel" +
          (showPanel ? " orbit-side-panel--visible" : "")
        }
      >
        <Link href="/" className="orbit-side-panel__button">
          go to main
        </Link>
      </div>

      {/* 오른쪽 아래 FAB */}
      <div className="orbit-fab">
        <div
          className={
            "orbit-fab__actions" +
            (fabOpen ? " orbit-fab__actions--open" : "")
          }
        >
          <Link
            href="/"
            className="orbit-fab__action"
            aria-label="메인으로 돌아가기"
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
                  <h4>The Weather Project</h4>
                  <p style={{ fontSize: 12, opacity: 0.8 }}>
                    Olafur Eliasson, 2003
                  </p>
                  <p style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>
                    Move your mouse to explore
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={
            "orbit-fab__main" +
            (fabOpen ? " orbit-fab__main--active" : "")
          }
          onClick={toggleFab}
          aria-label="메뉴 열기"
        >
          M
        </button>
      </div>
    </main>
  );
}