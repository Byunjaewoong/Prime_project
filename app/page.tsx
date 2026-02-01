// app/page.tsx
import Link from "next/link";

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
          
          {/* 1. Geocentrism: 왼쪽 살짝 (기존 20px -> 2%) */}
          <li style={{ marginLeft: "2%", width: "fit-content" }}>
            <Link href="/works/orbit" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Geo-centr</span>
            </Link>
          </li>

          {/* 2. Heliocentrism: 오른쪽 끝 (기존 720px -> 60%) 
              모바일 안전을 위해 60~65% 정도가 적당합니다. */}
          <li style={{ marginLeft: "60%", width: "fit-content" }}>
            <Link href="/works/orbit2" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Helio-centr</span>
            </Link>
          </li>

          {/* 3. ASCII Donut: 중간 (기존 370px -> 35%) */}
          <li style={{ marginLeft: "35%", width: "fit-content" }}>
            <Link href="/works/donut" style={{ textDecoration: "none", color: "inherit" }}>
              <span>ASCII Donut</span>
            </Link>
          </li>

          {/* 4. Perlin noise: 왼쪽 중간 (기존 110px -> 15%) */}
          <li style={{ marginLeft: "15%", width: "fit-content" }}>
            <Link href="/works/perlin_noise" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Perlin noise</span>
            </Link>
          </li>

          {/* 5. Snow walker: 다시 오른쪽 (기존 720px -> 55%) */}
          <li style={{ marginLeft: "55%", width: "fit-content" }}>
            <Link href="/works/snow_walk" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Snow walker</span>
            </Link>
          </li>

          {/* 6.fluid: 다시 오른쪽 (기존 720px -> 55%) */}
          <li style={{ marginLeft: "15%", width: "fit-content" }}>
            <Link href="/works/Fluid" style={{ textDecoration: "none", color: "inherit" }}>
              <span>fluid</span>
            </Link>
          </li>

          {/* 6.fluid: 다시 오른쪽 (기존 720px -> 55%) */}
          <li style={{ marginLeft: "15%", width: "fit-content" }}>
            <Link href="/works/weatherProject" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Weather Project</span>
            </Link>
          </li>

        </ul>
        

        {/* 하단 푸터 영역 */}
        <div style={{ marginTop: "250px", fontSize: "0.85rem", opacity: 0.2 }}>
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
