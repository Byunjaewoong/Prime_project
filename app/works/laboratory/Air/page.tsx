import type { Metadata } from "next";
import AirExperience from "./AirExperience";

export const metadata: Metadata = {
  title: "Air — Laboratory",
  description: "Eric Bruneton's precomputed atmospheric scattering, rendered in WebGL2.",
};

export default function AirPage() {
  return <AirExperience />;
}
