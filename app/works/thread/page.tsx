import type { Metadata } from "next";
import ThreadExperience from "./ThreadExperience";

export const metadata: Metadata = {
  title: "Thread — GrimGriGi",
  description: "An interactive thread physics study.",
};

export default function ThreadPage() {
  return <ThreadExperience />;
}
