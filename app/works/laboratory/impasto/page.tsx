import type { Metadata } from "next";
import ImpastoExperience from "./ImpastoExperience";

export const metadata: Metadata = {
  title: "Impasto — Laboratory",
  description: "Extrude 3D viscoplastic paint and spread it with brushes and palette knives using a particle fluid solver.",
};

export default function ImpastoPage() { return <ImpastoExperience />; }
