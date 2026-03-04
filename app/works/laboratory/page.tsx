// app/works/laboratory/page.tsx
import Link from "next/link";

export default function LaboratoryPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#fcfcfc",
        color: "#1a4031",
        fontFamily: "var(--font-courier), monospace",
        padding: "60px 20px",
        fontSize: "0.95rem",
        lineHeight: "1.6",
        overflowX: "hidden",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto", width: "100%" }}>

        {/* 뒤로 가기 */}
        <div style={{ marginBottom: "60px" }}>
          <Link href="/" style={{ textDecoration: "none", color: "inherit", opacity: 0.4 }}>
            ← back
          </Link>
        </div>

        {/* 타이틀 */}
        <h2 style={{
          textAlign: "center",
          fontSize: "1rem",
          fontWeight: "bold",
          marginBottom: "20%",
          letterSpacing: "0.05em",
          opacity: 0.2
        }}>
          Laboratory
        </h2>

        {/* 실험 프로젝트 링크 목록 */}
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "60px" }}>

          {/* 실험 프로젝트 링크를 여기에 추가하세요 */}
          {/* 예시:
          <li style={{ marginLeft: "10%", width: "fit-content" }}>
            <Link href="/works/laboratory/experiment-1" style={{ textDecoration: "none", color: "inherit" }}>
              <span>Experiment 1</span>
            </Link>
          </li>
          */}

        </ul>

        {/* 하단 푸터 */}
        <div style={{ marginTop: "250px", fontSize: "0.85rem", opacity: 0.2 }}>
          <div style={{ textAlign: "right" }}>
            GrimGriGi
          </div>
        </div>

      </div>
    </main>
  );
}
