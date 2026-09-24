import type { Metadata } from "next";
import FFTExperience from "./FFTExperience";

export const metadata: Metadata = {
  title: "FFT — GrimGriGi",
  description: "A real-time frequency spectrum study.",
};

export default function FFTPage() {
  return <FFTExperience />;
}
