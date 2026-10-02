"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { generateSole, SOLE_FAMILIES, SOLE_OUTLINE, type SoleFamily } from "./core/generateSole";
import styles from "./sole.module.css";

type Design = { seed: number; family: SoleFamily };
const INITIAL_DESIGN: Design = { seed: 24637, family: "trail" };

export default function SoleExperience() {
  const [design, setDesign] = useState<Design>(INITIAL_DESIGN);
  const marks = useMemo(() => generateSole(design.seed, design.family), [design]);
  const familyName = SOLE_FAMILIES.find(option => option.value === design.family)?.label ?? "Outsole";

  const regenerate = () => {
    const nextSeed = Math.floor(Math.random() * 0xffffffff);
    const familyAdvance = 1 + Math.floor(Math.random() * (SOLE_FAMILIES.length - 1));
    setDesign(previous => {
      const index = SOLE_FAMILIES.findIndex(option => option.value === previous.family);
      return {
        seed: nextSeed,
        family: SOLE_FAMILIES[(index + familyAdvance) % SOLE_FAMILIES.length].value,
      };
    });
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/works/laboratory" className={styles.back}>← laboratory</Link>
      <span className={styles.title}>SOLE</span>
      <button type="button" className={styles.regenerate} onClick={regenerate}>
        <RefreshCw size={15} strokeWidth={1.7} aria-hidden="true" />
        <span>new pattern</span>
      </button>
    </header>
    <section className={styles.stage} aria-label="Procedurally generated black and white outsole">
      <svg className={styles.sole} viewBox="0 0 420 1000" role="img"
        aria-label={`${familyName} shoe sole. Black areas are raised tread; white areas are recessed.`}>
        <defs>
          <clipPath id="sole-outline-clip"><path d={SOLE_OUTLINE} /></clipPath>
        </defs>
        <g clipPath="url(#sole-outline-clip)">
          {marks.map((mark, index) => <path key={index} d={mark.d} transform={mark.transform}
            fill={mark.strokeWidth ? "none" : mark.tone === "ink" ? "#111111" : "#ffffff"}
            stroke={mark.strokeWidth ? mark.tone === "ink" ? "#111111" : "#ffffff" : undefined}
            strokeWidth={mark.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
        </g>
        <path d={SOLE_OUTLINE} fill="none" stroke="#111111" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      </svg>
    </section>
    <footer className={styles.footer} aria-live="polite">
      <span>{familyName}</span>
      <span>{design.seed.toString(16).padStart(8, "0")}</span>
    </footer>
  </main>;
}
