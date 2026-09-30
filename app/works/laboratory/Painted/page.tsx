import type { Metadata } from "next";
import PaintedExperience from "./PaintedExperience";

export const metadata: Metadata = {
  title: "Painted — GrimGriGi",
  description: "A single-color painted surface shaded from a procedural Perlin-noise height field.",
};

export default function PaintedPage() {
  return <PaintedExperience />;
}
