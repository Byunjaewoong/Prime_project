// app/works/orbit2/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "./CanvasApp";
import { Home } from "lucide-react";

export default function Orbit2Page() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

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
      <CanvasApp />

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
      <div className="orbit-fab">
        {/* 펼쳐지는 작은 동그란 버튼들 */}
        <div
          className={
            "orbit-fab__actions" +
            (fabOpen ? " orbit-fab__actions--open" : "")
          }
        >
          {/* 1. 메인으로 */}
          <Link
            href="/"
            className="orbit-fab__action"
            aria-label="메인으로 돌아가기"
          >
            <Home size={20} strokeWidth={2} />
          </Link>

          {/* 2. orbit 작업물로 이동 (예시) */}
          <Link
            href="/works/orbit"
            className="orbit-fab__action"
            aria-label="작업물 A (orbit)"
          >
            A
          </Link>

          {/* 3. orbit2 자기 자신 (예시: 리셋 느낌) */}
          <Link
            href="/works/orbit2"
            className="orbit-fab__action"
            aria-label="작업물 B (orbit2)"
          >
            B
          </Link>

          {/* 4. 나중에 다른 작업물 추가하거나 placeholder로 사용 */}
          <button
            type="button"
            className="orbit-fab__action"
            aria-label="추가 메뉴"
          >
            ⋯
          </button>
        </div>

        {/* 메인 M 버튼 */}
        <button
          type="button"
          className={
            "orbit-fab__main" + (fabOpen ? " orbit-fab__main--active" : "")
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
