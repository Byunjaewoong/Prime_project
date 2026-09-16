// app/page.tsx
import Link from "next/link";
import styles from "./page.module.css";

const emergenceWorks = [
  { label: "Lenia", href: "/works/Emergence/lenia", position: styles.emergenceLenia },
  { label: "Boids", href: "/works/Emergence/boids", position: styles.emergenceBoids },
  { label: "Gray-Scott", href: "/works/Emergence/gray-scott", position: styles.emergenceGrayScott },
  { label: "Physarum", href: "/works/Emergence/physarum", position: styles.emergencePhysarum },
  { label: "Atoms", href: "/works/Emergence/atoms", position: styles.emergenceAtoms },
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#fcfcfc",
        color: "#1a4031",
        fontFamily: "var(--font-courier), monospace",
        // 모바일에서도 여백이 너무 크지 않도록 조정 (상하 60, 좌우 20)
        padding: "60px 20px", 
        fontSize: "0.95rem",
        lineHeight: "1.6",
        overflowX: "hidden", // 가로 스크롤 방지
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        
        {/* 상단 헤더 영역 (빈 공간 유지) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "24px" }}>
              {/* GrimGriGi */}
            </h1>
          </div>
        </div>

        {/* 중앙 타이틀 */}
        <h2 style={{ 
          textAlign: "center", 
          fontSize: "1rem", 
          fontWeight: "bold", 
          marginBottom: "20%",
          letterSpacing: "0.05em",
          opacity: 0.2
        }}>
          Work Archives
        </h2>

        {/* 
           [핵심 수정 사항]
           1. paddingLeft(px) -> marginLeft(%) 로 변경하여 화면 비율에 따라 이동
           2. width: "fit-content" 추가 (글자 크기만큼만 영역 차지)
           3. 모바일에서 너무 오른쪽으로 가지 않도록 최대 % 조절 (최대 60% 정도 추천)
        */}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "60px" }}>

          <li style={{ marginLeft: "2%", width: "fit-content" }}>
            <Link href="/works/Geo-centr" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Geo-centr</span>
            </Link>
          </li>

          <li style={{ marginLeft: "60%", width: "fit-content" }}>
            <Link href="/works/Helio-centr" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Helio-centr</span>
            </Link>
          </li>

          <li style={{ marginLeft: "35%", width: "fit-content" }}>
            <Link href="/works/ASCII-Donut" style={{ textDecoration: "none", color: "inherit" }}>
              <span>ASCII Donut</span>
            </Link>
          </li>

          <li style={{ marginLeft: "15%", width: "fit-content" }}>
            <Link href="/works/Perlin-noise" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Perlin noise</span>
            </Link>
          </li>

          <li style={{ marginLeft: "55%", width: "fit-content" }}>
            <Link href="/works/Snow-walker" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Snow walker</span>
            </Link>
          </li>

          <li className={styles.emergenceItem}>
            <section className={styles.emergenceField} aria-labelledby="emergence-title">
              <svg
                className={styles.emergenceBoundary}
                viewBox="0 0 100 100"
                aria-hidden="true"
              >
                <path d="M 50 2 L 66 4 L 81 12 L 92 27 L 97 43 L 95 60 L 87 77 L 73 91 L 55 97 L 37 96 L 20 88 L 8 74 L 3 57 L 4 39 L 12 23 L 27 10 L 42 4 Z" />
              </svg>
              <h3 id="emergence-title" className={styles.emergenceTitle}>
                Emergence
              </h3>
              <nav aria-label="Emergence works">
                {emergenceWorks.map((work) => (
                  <Link
                    key={work.href}
                    href={work.href}
                    className={`${styles.emergenceLink} ${work.position}`}
                  >
                    {work.label}
                  </Link>
                ))}
              </nav>
            </section>
          </li>

          <li style={{ marginLeft: "25%", width: "fit-content" }}>
            <Link href="/works/Vortex" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Vortex</span>
            </Link>
          </li>

        </ul>

        {/* Laboratory — :) 바로 위, 이탤릭 */}
        <div style={{ textAlign: "left", marginTop: "120px" }}>
          <Link href="/works/laboratory" style={{ textDecoration: "none", color: "inherit", fontStyle: "italic" }}>
            Laboratory
          </Link>
        </div>

        {/* 하단 푸터 영역 */}
        <div style={{ marginTop: "10px", fontSize: "0.85rem", opacity: 0.2 }}>
          <div style={{ marginBottom: "10px" }}>:)</div>
          <div>2025 11 23</div>
          <div style={{ textAlign: "right", marginTop: "20px" }}>
            GrimGriGi
          </div>
        </div>

      </div>
    </main>
  );
}
