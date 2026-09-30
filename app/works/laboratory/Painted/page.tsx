import type { Metadata } from "next";
import PaintedExperience from "./PaintedExperience";

export const metadata: Metadata = {
  title: "Painted — GrimGriGi",
  description: "A tactile painted surface with shifting muted colors.",
};

export default function PaintedPage() {
  return <PaintedExperience />;
}
