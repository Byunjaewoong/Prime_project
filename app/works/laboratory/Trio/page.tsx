import type { Metadata } from "next";
import TrioExperience from "./TrioExperience";

export const metadata: Metadata = {
  title: "Trio — GrimGriGi",
  description: "Three gravitational bodies and their luminous trails.",
};

export default function TrioPage() {
  return <TrioExperience />;
}
