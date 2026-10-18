import type { Metadata } from "next";
import TennisExperience from "./TennisExperience";

export const metadata: Metadata = { title: "Tennis — Laboratory", description: "An aerial tennis court. Move, time your swing, and shape the ball with spin." };
export default function TennisPage() { return <TennisExperience />; }
