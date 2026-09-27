import type { Metadata } from "next";
import RealTimeExperience from "./RealTimeExperience";

export const metadata: Metadata = {
  title: "Real Time — GrimGriGi",
  description: "A real-time audio waveform study in the time domain.",
};

export default function RealTimePage() {
  return <RealTimeExperience />;
}
