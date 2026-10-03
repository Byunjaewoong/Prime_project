import type { Metadata } from "next";
import TraceExperience from "./TraceExperience";

export const metadata: Metadata = {
  title: "Trace — GrimGriGi",
  description: "A shoe steps into a snow surface and leaves a different sole impression each time.",
};

export default function TracePage() { return <TraceExperience />; }
