import type { Metadata } from "next";
import DashboardExperience from "./DashboardExperience";

export const metadata: Metadata = {
  title: "Dashboard — GrimGriGi",
  description: "A shared drawing canvas where every visitor can add a line.",
};

export default function DashboardPage() {
  return <DashboardExperience />;
}
