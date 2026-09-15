// app/works/snow_walk/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import CanvasApp from "./CanvasApp";
import type { CameraFilters } from "./core/CameraFilter";

const FILTER_LABELS: Array<[keyof CameraFilters, string]> = [
  ["haze", "Haze"], ["grain", "Film grain"], ["vignette", "Vignette"], ["tone", "Tone curve"],
];

export default function SnowWalkPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [cameraFilters, setCameraFilters] = useState<CameraFilters>({ haze: false, grain: false, vignette: false, tone: true });

  // 왼쪽 끝으로 마우스 가면 go to main 슬라이드
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
      {/* 전체 화면 캔버스 */}
      <CanvasApp cameraFilters={cameraFilters} />

      {/* 🔹 왼쪽 슬라이드 패널 (메인으로) */}
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

      {/* 🔹 오른쪽 아래 FAB + (간단한) 컨트롤 패널 */}
      <div className="orbit-fab">
        <div
          className={
            "orbit-fab__actions" +
            (fabOpen ? " orbit-fab__actions--open" : "")
          }
        >
          {/* 홈 버튼 */}
          <Link
            href="/"
            className="orbit-fab__action"
            aria-label="메인으로 돌아가기"
            onClick={(e) => e.stopPropagation()}
          >
            <Home size={20} strokeWidth={2} />
          </Link>

          {/* M 버튼 열렸을 때 나오는 간단한 안내 패널 */}
          {fabOpen && (
            <div
              className="orbit-fab__controls"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="orbit-panel-container">
                <div className="orbit-panel-section">
                  <h4>Snow walker</h4>
                  <p style={{ fontSize: 12, opacity: 0.8 }}>
                    Left click / tap: change field
                  </p>
                  <ul style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>
                    <li>Snow → Green grass → Golden grass</li>
                    <li>Right click: plant a tree</li>
                  </ul>
                  <div style={{ marginTop: 12, fontSize: 11, opacity: 0.65 }}>Camera filters</div>
                  {FILTER_LABELS.map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, fontSize: 12 }}>
                      <input type="checkbox" checked={cameraFilters[key]}
                        onChange={(e) => setCameraFilters(current => ({ ...current, [key]: e.target.checked }))} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 메인 M 버튼 */}
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
