import type { Metadata } from "next";
import EarthExperience from "./EarthExperience";
export const metadata: Metadata = { title: "Earth — Laboratory", description: "Unified atmospheric and volumetric cloud scattering, from the surface to orbit." };
export default function EarthPage() { return <EarthExperience />; }
