// app/works/orbit/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CanvasApp from "@/app/works/orbit/CanvasApp";
import { Home } from "lucide-react";

export default function WorkOrbitPage() {
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
    return () => {
      window.removeEventListener("mousemove", handleMove);
    };
  }, []);

  const toggleFab = () => {
    setFabOpen((prev) => !prev);
  };

  return (
    <main className="full-canvas-page">
      {/* 캔버스 전체 화면 */}
      <CanvasApp />

      {/* 왼쪽 슬라이드 패널 */}
      <div
        className={
          "orbit-side-panel" +
          (showPanel ? " orbit-side-panel--visible" : "")
        }
      >
        <Link href="/" className="orbit-side-panel__button">
          ← go to main
        </Link>
        {/* <p className="orbit-side-panel__hint">
          마우스를 왼쪽 가장자리 근처로 움직이면 이 패널이 나타납니다.
        </p> */}
      </div>

      {/* 🔥 오른쪽 아래 플로팅 메뉴 */}
      <div className="orbit-fab">
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
          {/* 2~4는 나중에 기능 채우면 됨 */}
          <button
            type="button"
            className="orbit-fab__action"
            aria-label="작업물 리스트"
          >
            ★
          </button>
          <button
            type="button"
            className="orbit-fab__action"
            aria-label="설정"
          >
            ⚙
          </button>
          <button
            type="button"
            className="orbit-fab__action"
            aria-label="정보"
          >
            ?
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
