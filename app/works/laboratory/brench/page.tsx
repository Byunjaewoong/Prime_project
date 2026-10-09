import type { Metadata } from "next";
import BrenchExperience from "./BrenchExperience";

export const metadata: Metadata = {
  title: "Brench — Laboratory",
  description: "A generative tree studio with recursive branching, detailed bark, and draggable growth controls.",
};

export default function BrenchPage() {
  return <BrenchExperience />;
}
