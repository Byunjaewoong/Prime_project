import type { Metadata } from "next";
import ImpastoExperience from "./ImpastoExperience";

export const metadata: Metadata = {
  title: "Impasto — Laboratory",
  description: "Sculpt layered white impasto with sharp palette-knife ridges, fine dragged grain, and volumetric paint.",
};

export default function ImpastoPage() { return <ImpastoExperience />; }
