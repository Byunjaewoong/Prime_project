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

        {/* 목차 스타일 링크 목록 */}
        <ul style={{ listStyle: "none", padding: 0, margin: "0 auto", maxWidth: 480, display: "flex", flexDirection: "column", gap: "16px" }}>

          <li>
            <Link href="/works/Fluid" style={{ textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px dotted rgba(26,64,49,0.2)", paddingBottom: "6px" }}>
              <span>1. Fluid</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.3, marginLeft: 12 }}>simulation</span>
            </Link>
          </li>

          <li>
            <Link href="/works/weatherProject" style={{ textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px dotted rgba(26,64,49,0.2)", paddingBottom: "6px" }}>
              <span>2. Weather Project</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.3, marginLeft: 12 }}>3D scene</span>
            </Link>
          </li>

          <li>
            <Link href="/works/Vortex_GPU" style={{ textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px dotted rgba(26,64,49,0.2)", paddingBottom: "6px" }}>
              <span>3. Vortex GPU</span>
              <span style={{ fontSize: "0.75rem", opacity: 0.3, marginLeft: 12 }}>stable fluids (GPU)</span>
            </Link>
          </li>

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
