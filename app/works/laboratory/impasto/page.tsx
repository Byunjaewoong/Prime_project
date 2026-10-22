import type { Metadata } from "next";
import ImpastoExperience from "./ImpastoExperience";

export const metadata: Metadata = {
  title: "Impasto — Laboratory",
  description: "A tactile oil paint study: plastic deformation, bristle tracks, lifted paint and self-shadowed relief.",
};

export default function ImpastoPage() { return <ImpastoExperience />; }
