import type { Metadata } from "next";
import CharcoalExperience from "./CharcoalExperience";

export const metadata: Metadata = {
  title: "Charcoal — GrimGriGi",
  description: "A procedural graphite line study.",
};

export default function CharcoalPage() {
  return <CharcoalExperience />;
}
