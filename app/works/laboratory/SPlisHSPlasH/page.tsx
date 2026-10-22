import type { Metadata } from "next";
import SPlisHSPlasHExperience from "./SPlisHSPlasHExperience";

export const metadata: Metadata = {
  title: "SPlisHSPlasH — Laboratory",
  description: "An interactive browser study of SPlisHSPlasH's 3D position-based SPH fluid method.",
};

export default function SPlisHSPlasHPage() {
  return <SPlisHSPlasHExperience />;
}
