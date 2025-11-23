// app/page.tsx
"use client";

import Link from "next/link";

export default function HomePage() {
  const preloadOrbit = () => {
    // 🔹 사용자가 링크에 마우스를 올리면 CanvasApp 번들을 미리 로드
    import("@/app/components/CanvasApp");
  };

  return (
    <main className="page page--home">
      <section className="page-content">
        <h1>My Playground</h1>
        <p className="page-desc">Next.js + TypeScript 기반 개인 작업물 모음입니다.</p>

        <h2 className="section-title">작업물</h2>
        <ul className="work-list">
          <li className="work-item">
            <Link
              href="/works/orbit"
              className="work-link"
              onMouseEnter={preloadOrbit}  // ← 여기!
            >
              작업물 orbit – 캔버스 우주
            </Link>
          </li>
          {/* B, C, D 도 나중에 비슷하게 */}
        </ul>
      </section>
    </main>
  );
}
