import type { Metadata } from "next";
import Link from "next/link";
import styles from "./nonFlowers.module.css";

export const metadata: Metadata = {
  title: "Nonflowers — Laboratory",
  description: "Lingdong Huang's procedural Gongbi-style flowers, presented in the Laboratory.",
};

export default function NonFlowersPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/works/laboratory" className={styles.back}>← Laboratory</Link>
      <span className={styles.title}>NONFLOWERS</span>
      <a href="https://github.com/LingDong-/nonflowers" target="_blank" rel="noopener noreferrer" className={styles.source}>
        Lingdong Huang ↗
      </a>
    </header>
    <iframe className={styles.work} src="/nonflowers/index.html" title="Nonflowers interactive flower generator" />
  </main>;
}
