import type { Metadata } from "next";
import PathtracingExperience from "./PathtracingExperience";

export const metadata: Metadata = { title: "Pathtracing — Laboratory", description: "Progressive Cornell box path tracing study." };
export default function PathtracingPage() { return <PathtracingExperience />; }
