import type { Metadata } from "next";
import VillageExperience from "./VillageExperience";

export const metadata: Metadata = { title: "Village — Laboratory", description: "Procedural painted houses and overlapping hillside villages." };

export default function VillagePage() { return <VillageExperience />; }
