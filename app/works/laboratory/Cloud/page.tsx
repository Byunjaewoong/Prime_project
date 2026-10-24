import type { Metadata } from "next";
import CloudExperience from "./CloudExperience";

export const metadata: Metadata = { title: "Cloud — Laboratory", description: "Tileable volume noise cloud raymarching study." };
export default function CloudPage() { return <CloudExperience />; }
