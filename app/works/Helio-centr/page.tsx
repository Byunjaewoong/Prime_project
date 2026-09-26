// app/works/orbit2/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";
import { CircleDot, Home } from "lucide-react";

export default function Orbit2Page() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [orbitSpeed, setOrbitSpeed] = useState(1);

  // 왼쪽 슬라이드 패널: 마우스가 좌측 벽 근처로 가면 나타나게
  useEffect(() => {
    const threshold = 32;        // 이 안쪽으로 들어오면 열기
    const hideOffset = threshold + 80; // 이만큼 벗어나면 닫기

    const handleMove = (e: MouseEvent) => {
      if (e.clientX <= threshold) {
        setShowPanel(true);
      } else if (e.clientX > hideOffset) {
        setShowPanel(false);
      }
    };

    window.addEventListener("mousemove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, []);

  const toggleFab = () => setFabOpen((prev) => !prev);

  return (
    <main className="full-canvas-page">
      {/* 전체 화면 캔버스 */}
      <CanvasApp orbitSpeed={orbitSpeed} />

      {/* 🔹 왼쪽 슬라이드 패널 */}
      <div
        className={
          "orbit-side-panel" +
          (showPanel ? " orbit-side-panel--visible" : "")
        }
      >
        <Link href="/" className="orbit-side-panel__button">
          go to main
        </Link>
        {/* <p className="orbit-side-panel__hint">
          마우스를 왼쪽 가장자리 근처로 움직이면 이 패널이 나타납니다.
        </p> */}
      </div>

      {/* 🔹 오른쪽 아래 플로팅 메뉴 */}
      <div className="orbit-fab sailing-fab">
        {fabOpen && (
          <div
            className="orbit-fab__controls sailing-controls sailing-controls--atoms"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="sailing-menu-head">
              <span>Helio-Centr</span>
              <div className="sailing-menu-links">
                <Link href="/" aria-label="Home">
                  <Home size={17} />
                </Link>
                <Link href="/works/Geo-centr" aria-label="Geo-centr">
                  <CircleDot size={17} />
                </Link>
              </div>
            </div>
            <div className="sailing-menu-note">
              <div>click space · create planet</div>
              <div>drag slider · adjust orbit</div>
            </div>
            <section className="sailing-section">
              <h4>Motion</h4>
              <label className="sailing-slider">
                <span>
                  <span>Orbit speed</span>
                  <output>{orbitSpeed.toFixed(2)}×</output>
                </span>
                <div className="sailing-slider-track">
                  <input
                    aria-label="Orbit speed"
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    value={orbitSpeed}
                    onChange={(event) =>
                      setOrbitSpeed(Number(event.currentTarget.value))
                    }
                  />
                </div>
              </label>
            </section>
          </div>
        )}

        {/* 메인 M 버튼 */}
        <button
          type="button"
          className={
            "orbit-fab__main" + (fabOpen ? " orbit-fab__main--active" : "")
          }
          onClick={toggleFab}
          aria-label={fabOpen ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={fabOpen}
        >
          M
        </button>
      </div>
    </main>
  );
}
