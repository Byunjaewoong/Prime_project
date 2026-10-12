import type { Metadata } from "next";
import styles from "./nonFlowers.module.css";

export const metadata: Metadata = {
  title: "Nonflowers — Laboratory",
  description: "A full-screen vintage wildflower pattern based on Lingdong Huang's Nonflowers, with custom paper tones and random compositions.",
};

export default function NonFlowersPage() {
  return <main className={styles.page}>
    <iframe className={styles.work} src="/nonflowers/index.html" title="Nonflowers 빈티지 꽃 패턴 생성기" />
  </main>;
}
