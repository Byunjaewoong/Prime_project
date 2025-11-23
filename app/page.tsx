// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px",
        maxWidth: 960,
        margin: "0 auto",
        color: "#f9fafb",
        background: "#050816",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: 8 }}>My Playground</h1>
      {/* <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Next.js + TypeScript 기반 개인 작업물 모음입니다.
      </p> */}

      <h2 style={{ fontSize: "1.4rem", marginBottom: 12 }}>Works</h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        <li style={{ marginBottom: 8 }}>
          <Link href="/works/orbit">Geocentrism</Link>
        </li>
        <li style={{ marginBottom: 8 }}>
          <Link href="/works/orbit2">Heliocentrism</Link>
        </li>
        <li style={{ marginBottom: 8 }}>
          <Link href="/works/donut">ASCII Donut</Link>
        </li>
        <li style={{ marginBottom: 8 }}>
          <Link href="/works/d">작업물 D</Link>
        </li>
      </ul>
    </main>
  );
}