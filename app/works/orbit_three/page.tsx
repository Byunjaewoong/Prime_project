"use client";

import dynamic from "next/dynamic";

const CanvasApp = dynamic(() => import("./CanvasApp"), {
  ssr: false,
});

export default function OrbitThreePage() {
  return (
    <main
      style={{
        padding: "2rem",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          marginBottom: "1rem",
        }}
      >
        Orbit Three (three.js)
      </h1>

      <CanvasApp />
    </main>
  );
}
