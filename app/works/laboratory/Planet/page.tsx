import type { Metadata } from "next";
import PlanetExperience from "./PlanetExperience";

export const metadata: Metadata = {
  title: "Planet — GrimGriGi",
  description: "A high-resolution procedural planet study.",
};

export default function PlanetPage() {
  return <PlanetExperience />;
}
