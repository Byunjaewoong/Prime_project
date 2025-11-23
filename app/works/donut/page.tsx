// app/works/donut/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import CanvasApp from "./CanvasApp";
import type { App as DonutCoreApp } from "./core/App";

export default function DonutPage() {
  const [showPanel, setShowPanel] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [donutApp, setDonutApp] = useState<DonutCoreApp | null>(null);

  // 🔧 도넛 크기 / 거리 / 속도
  const [size, setSize] = useState(0.5);
  const [distance, setDistance] = useState(0.5);
  const [speed, setSpeed] = useState(0.5);

  // 🔧 회전 방향
  const [rotX, setRotX] = useState(0.7);
  const [rotY, setRotY] = useState(0.8);
  const [rotZ, setRotZ] = useState(0.6);

  // 🔦 빛 방향
  const [lightX, setLightX] = useState(-1 / Math.sqrt(3));
  const [lightY, setLightY] = useState(-1 / Math.sqrt(3));
  const [lightZ, setLightZ] = useState(1 / Math.sqrt(3));

  // 🔺 Δ 모드 (회전/빛 자동 변화)
  const [deltaMode, setDeltaMode] = useState(false);
  const lightTweenFrameRef = useRef<number | null>(null);

  // 🎨 글자 색 모드
  const [paintMode, setPaintMode] = useState(false);
  const [paintSeed, setPaintSeed] = useState(0);

  const deltaVelRef = useRef({
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    lightX: 0,
    lightY: 0,
    lightZ: 0,
  });
  const deltaFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // 왼쪽 슬라이드 패널 (마우스 왼쪽 벽 근처)
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

  // 🔧 코어에 상태 전달
  const updateDonut = (patch: Partial<{
    size: number;
    distance: number;
    speed: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    lightX: number;
    lightY: number;
    lightZ: number;
    colorMode: boolean;
    colorSeed: number;
  }>) => {
    donutApp?.updateConfig(patch as any);
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.min(max, Math.max(min, v));

  // 🔺 Δ 버튼 토글
  const toggleDelta = () => {
    setDeltaMode((prev) => !prev);
  };

// 🔺 Δ 모드: 회전은 2초마다 랜덤, 빛은 4초 동안 서서히 바뀜
useEffect(() => {
  if (!donutApp) return;

  // Δ OFF → 모든 타이머/애니메이션 정리
  if (!deltaMode) {
    if (lightTweenFrameRef.current !== null) {
      cancelAnimationFrame(lightTweenFrameRef.current);
      lightTweenFrameRef.current = null;
    }
    return;
  }

  const rand = (min: number, max: number) =>
    Math.random() * (max - min) + min;
  const randSigned = (minAbs: number, maxAbs: number) =>
    (Math.random() < 0.5 ? -1 : 1) * rand(minAbs, maxAbs);

  // ✅ 1) 회전: 2초마다 각도 방향 바꿔줌
  const rotationTimerId = window.setInterval(() => {
    const nextRotX = randSigned(0.4, 1.0);
    const nextRotY = randSigned(0.4, 1.0);
    const nextRotZ = randSigned(0.3, 0.9);

    setRotX(nextRotX);
    setRotY(nextRotY);
    setRotZ(nextRotZ);

    donutApp.updateConfig({
      rotX: nextRotX,
      rotY: nextRotY,
      rotZ: nextRotZ,
    } as any);
  }, 2000); // 2초마다

  // ✅ 2) 빛: 4초 동안 서서히 target 방향으로 보간
  const makeRandomLightDir = () => {
    let x = randSigned(0.25, 1.0);
    let y = randSigned(0.25, 1.0);
    let z = randSigned(0.25, 1.0);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-3) {
      x = 0.0;
      y = -1.0;
      z = 0.0;
    } else {
      x /= len;
      y /= len;
      z /= len;
    }
    return { x, y, z };
  };

  // 시작값은 현재 lightX/Y/Z 기준
  let start = { x: lightX, y: lightY, z: lightZ };
  let target = makeRandomLightDir();
  let startTime = performance.now();
  const DURATION = 4000; // 4초

  const step = (now: number) => {
    const t = Math.min(1, (now - startTime) / DURATION);

    const curX = start.x + (target.x - start.x) * t;
    const curY = start.y + (target.y - start.y) * t;
    const curZ = start.z + (target.z - start.z) * t;

    setLightX(curX);
    setLightY(curY);
    setLightZ(curZ);

    donutApp.updateConfig({
      lightX: curX,
      lightY: curY,
      lightZ: curZ,
    } as any);

    // 4초 경과 → 새 타겟으로 다시 4초간 보간
    if (t >= 1) {
      start = { x: curX, y: curY, z: curZ };
      target = makeRandomLightDir();
      startTime = now;
    }

    lightTweenFrameRef.current = requestAnimationFrame(step);
  };

  lightTweenFrameRef.current = requestAnimationFrame(step);

  // cleanup
  return () => {
    window.clearInterval(rotationTimerId);
    if (lightTweenFrameRef.current !== null) {
      cancelAnimationFrame(lightTweenFrameRef.current);
      lightTweenFrameRef.current = null;
    }
  };
}, [deltaMode, donutApp]);


  // 🎨 페인트 버튼 클릭 핸들러
  const togglePaint = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation(); // 캔버스 클릭 이벤트 막기

    const nextMode = !paintMode;
    const nextSeed = Date.now(); // 매번 다른 시드

    setPaintMode(nextMode);
    setPaintSeed(nextSeed);

    updateDonut({
      colorMode: nextMode,
      colorSeed: nextSeed,
    });
  };

  return (
    <main className="full-canvas-page">
      {/* 전체 화면 캔버스 */}
      <CanvasApp onReady={setDonutApp} />

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

      {/* 🔹 오른쪽 아래 FAB + 컨트롤 패널 */}
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

          {/* 🔧 M 버튼 열렸을 때 나오는 컨트롤 패널 */}
          {fabOpen && (
            <div
              className="orbit-fab__controls"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="orbit-panel-container">
                {/* 1. Donut Size / Distance / Speed */}
                <div className="orbit-panel-section">
                  <h4>Donut Size / Distance / Speed</h4>
                  <label>
                    size
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={size}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSize(v);
                        updateDonut({ size: v });
                      }}
                    />
                  </label>
                  <label>
                    distance
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={distance}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setDistance(v);
                        updateDonut({ distance: v });
                      }}
                    />
                  </label>
                  <label>
                    speed
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={speed}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setSpeed(v);
                        updateDonut({ speed: v });
                      }}
                    />
                  </label>
                </div>

                {/* 2. Rotation */}
                <div className="orbit-panel-section">
                  <h4>Rotation</h4>
                  <label>
                    rotX
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={rotX}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRotX(v);
                        updateDonut({ rotX: v });
                      }}
                    />
                  </label>
                  <label>
                    rotY
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={rotY}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRotY(v);
                        updateDonut({ rotY: v });
                      }}
                    />
                  </label>
                  <label>
                    rotZ
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={rotZ}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setRotZ(v);
                        updateDonut({ rotZ: v });
                      }}
                    />
                  </label>
                </div>

                {/* 3. Light Direction */}
                <div className="orbit-panel-section">
                  <h4>Light Direction</h4>
                  <label>
                    lightX
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={lightX}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLightX(v);
                        updateDonut({ lightX: v });
                      }}
                    />
                  </label>
                  <label>
                    lightY
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={lightY}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLightY(v);
                        updateDonut({ lightY: v });
                      }}
                    />
                  </label>
                  <label>
                    lightZ
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={lightZ}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLightZ(v);
                        updateDonut({ lightZ: v });
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* 🔺 Δ 모드 토글 버튼 */}
              <button
                type="button"
                className={
                  "orbit-fab__delta-button" +
                  (deltaMode ? " orbit-fab__delta-button--active" : "")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDelta();
                }}
                aria-label="랜덤 회전/빛 변화 토글"
              >
                Δ
              </button>

              {/* 🎨 페인트(글자 색) 토글 버튼 */}
              <button
                type="button"
                className={
                  "orbit-fab__delta-button paint-button" +
                  (paintMode ? " orbit-fab__delta-button--active" : "")
                }
                onClick={togglePaint}
                aria-label="글자 색 랜덤 팔레트 토글"
              >
                🎨
              </button>
            </div>
          )}
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
