// app/works/fluid/CanvasApp.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { App as FluidApp } from "./core/App";

// ✨ 사용할 이미지들의 파일명 목록
const POT_IMAGES = [
  "/pot.jpg", "/pot2.jpg", "/pot3.jpg", "/pot4.jpg", "/pot5.jpg",
  "/pot6.jpg", "/pot7.jpg", "/pot8.jpg", "/pot9.jpg", "/pot10.jpg",
];

// ✨ 순차적으로 변경할 블렌드 모드 목록
const BLEND_MODES = [
  "overlay",
  "hue",  
  "screen",
  "multiply",
  "color-dodge",
  "exclusion",
  "difference"
] as const;

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<FluidApp | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 재생 상태
  const [isPlaying, setIsPlaying] = useState(false);
  // 배경 이미지 상태
  const [currentBg, setCurrentBg] = useState(POT_IMAGES[0]);
  
  // ✨ 현재 블렌드 모드 상태 (초기값: 0번 인덱스 'screen')
  const [blendModeIndex, setBlendModeIndex] = useState(0);

  // 0. 이미지 프리로딩
  useEffect(() => {
    POT_IMAGES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // 1. 캔버스 앱 초기화 & 애니메이션 제어
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!appRef.current) {
      appRef.current = new FluidApp(canvas);
    }
    const app = appRef.current;

    // isPlaying 상태에 따라 App.ts 내부 루프 제어
    app.setIsRunning(isPlaying);

  }, [isPlaying]);

  // 2. 배경 이미지 랜덤 변경 로직
  useEffect(() => {
    if (!isPlaying) return;
    const intervalId = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * POT_IMAGES.length);
      setCurrentBg(POT_IMAGES[randomIndex]);
    }, 120);
    return () => clearInterval(intervalId);
  }, [isPlaying]);

  // 3. 클릭 핸들러 (Toggle + Blend Mode Change)
  const toggleInteraction = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);

    // ✨ "재생"이 시작될 때만 블렌드 모드를 다음 순서로 변경
    if (nextState) {
      setBlendModeIndex((prevIndex) => (prevIndex + 1) % BLEND_MODES.length);
    }

    // 오디오 제어
    if (audioRef.current) {
      if (nextState) {
        audioRef.current.volume = 0.5;
        audioRef.current.play().catch((e) => console.error(e));
      } else {
        audioRef.current.pause();
      }
    }
  };

  // 현재 적용될 블렌드 모드 문자열 가져오기
  const currentBlendMode = BLEND_MODES[blendModeIndex];

  return (
    <>
      <style jsx global>{`
        @keyframes shake {
          0% { transform: translate(0px, 1px) rotate(0deg); }
          10% { transform: translate(0px, -1px) rotate(-0.01deg); }
          50% { transform: translate(-1px, 0px) rotate(-0.01deg); }
          100% { transform: translate(1px, -1px) rotate(-0.01deg); }
        }
      `}</style>

      <div 
        onClick={toggleInteraction}
        style={{ 
          width: "100vw", 
          height: "100vh", 
          overflow: "hidden", 
          backgroundColor: "#000",
          cursor: "pointer"
        }}
      >
        <audio ref={audioRef} src="/sounds/washsound.mp3" loop />

        <div 
          style={{
            width: "100%",
            height: "100%",
            animation: isPlaying ? "shake 0.2s linear infinite" : "none",
            transform: "scale(1.02)", 
            transformOrigin: "center center"
          }}
        >
          <img
            src={currentBg} 
            alt="Pot Background"
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center", zIndex: 1,
            }}
          />

          <div 
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 2,
              filter: "blur(5px) contrast(1.2)",
              // ✨ 동적으로 변경되는 mixBlendMode 적용
              mixBlendMode: currentBlendMode 
            }}
          >
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
        </div>

        {/* 현재 모드 표시 (디버깅용, 원치 않으면 삭제 가능) */}
        {!isPlaying && (
          <div style={{
            position: 'absolute', bottom: '50px', width: '100%', textAlign: 'center',
            color: 'white', zIndex: 10, pointerEvents: 'none', opacity: 0.8,
            textShadow: '0 0 5px black', fontSize: '14px'
          }}>
            Tap to Play (Next Mode: {BLEND_MODES[(blendModeIndex + 1) % BLEND_MODES.length]})
          </div>
        )}
        
        {/* 재생 중일 때 현재 모드 표시 */}
        {isPlaying && (
           <div style={{
            position: 'absolute', top: '20px', right: '20px', 
            color: 'rgba(255,255,255,0.5)', zIndex: 10, pointerEvents: 'none',
            fontSize: '12px', fontFamily: 'monospace'
          }}>
            MODE: {currentBlendMode.toUpperCase()}
          </div>
        )}
      </div>
    </>
  );
}
