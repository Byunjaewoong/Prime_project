export type WakePalette = "monochrome" | "deep-blue";
export type WakeQuality = "auto" | "high" | "medium" | "low";

export type WakeSettings = {
  palette: WakePalette;
  cruiseSpeed: number;
  wakeForce: number;
  waveHeight: number;
  waveSpeed: number;
  waveDamping: number;
  reflectionIntensity: number;
  lightDirection: number;
  vorticity: number;
  dyeDecay: number;
  force: number;
  drag: number;
  viscosity: number;
  saturation: number;
  brightness: number;
  backgroundDyeRatio: number;
  showVectors: boolean;
  sprayAmount: number;
  sprayHeight: number;
  quality: WakeQuality;
};

export const DEFAULT_WAKE_SETTINGS: WakeSettings = {
  palette: "monochrome",
  cruiseSpeed: 1,
  wakeForce: 1,
  waveHeight: 0.8,
  waveSpeed: 1,
  waveDamping: 1.25,
  reflectionIntensity: 1,
  lightDirection: 145,
  vorticity: 6,
  dyeDecay: 0.988,
  force: 0.1,
  drag: 0.97,
  viscosity: 0.00002,
  saturation: 0.9,
  brightness: 0.6,
  backgroundDyeRatio: 0,
  showVectors: false,
  sprayAmount: 1,
  sprayHeight: 1,
  quality: "auto",
};

export const WAKE2_DEFAULT_SETTINGS: WakeSettings = {
  ...DEFAULT_WAKE_SETTINGS,
  cruiseSpeed: 1.85,
  wakeForce: 1.4,
  waveHeight: 0.45,
  waveSpeed: 0.45,
  waveDamping: 0.9,
  reflectionIntensity: 5.1,
  lightDirection: 225,
  vorticity: 6.5,
  dyeDecay: 0.995,
  force: 0.088,
  drag: 0.92,
  viscosity: 0.00001,
  saturation: 1.1,
  brightness: 1.3,
  backgroundDyeRatio: 0,
};

export type ResolvedWakeQuality = "high" | "medium" | "low";

export const QUALITY_PRESETS: Record<ResolvedWakeQuality, {
  simulation: number;
  surfaceSegments: number;
  particles: number;
  pressureIterations: number;
}> = {
  high: { simulation: 320, surfaceSegments: 256, particles: 2400, pressureIterations: 10 },
  medium: { simulation: 160, surfaceSegments: 128, particles: 700, pressureIterations: 8 },
  low: { simulation: 128, surfaceSegments: 96, particles: 350, pressureIterations: 6 },
};

export const resolveInitialQuality = (): ResolvedWakeQuality => {
  if (typeof window === "undefined") return "medium";
  return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760 ? "medium" : "high";
};
