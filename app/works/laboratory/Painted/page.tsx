import type { Metadata } from "next";
import PaintedExperience from "./PaintedExperience";

export const metadata: Metadata = {
  title: "Painted — GrimGriGi",
  description: "A painted surface with adjustable light-based color zones and procedural Perlin-noise relief.",
};

export default function PaintedPage() {
  return <PaintedExperience />;
}
