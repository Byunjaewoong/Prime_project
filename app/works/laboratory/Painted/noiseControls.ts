import type { NoiseParams } from "./core/PaintedRenderer";

export const PAINTED_NOISE_CONTROLS: { key: keyof NoiseParams; label: string; min: number; max: number; step: number }[] = [
  { key: "scale", label: "Noise scale", min: 3, max: 40, step: 1 },
  { key: "octaves", label: "Detail layers", min: 1, max: 6, step: 1 },
  { key: "roughness", label: "Detail strength", min: 0.1, max: 0.85, step: 0.05 },
  { key: "relief", label: "Height / relief", min: 0, max: 15, step: 0.25 },
  { key: "seed", label: "Pattern seed", min: 0, max: 100, step: 1 },
];
