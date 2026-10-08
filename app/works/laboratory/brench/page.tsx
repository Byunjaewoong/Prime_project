import type { Metadata } from "next";
import BrenchExperience from "./BrenchExperience";

export const metadata: Metadata = {
  title: "Brench — Laboratory",
  description: "A procedural study of branching silhouettes, curvature, and bark texture.",
};

export default function BrenchPage() {
  return <BrenchExperience />;
}
