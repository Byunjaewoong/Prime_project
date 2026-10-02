import type { Metadata } from "next";
import StepExperience from "./StepExperience";

export const metadata: Metadata = {
  title: "To step on — GrimGriGi",
  description: "One foot, a passing silhouette, a trace. An interactive three-dimensional stepping study.",
};

export default function ToStepOnPage() { return <StepExperience />; }
