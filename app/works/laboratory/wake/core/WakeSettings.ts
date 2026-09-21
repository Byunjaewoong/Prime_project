export type WakePalette = "monochrome" | "deep-blue";
export type WakeQuality = "auto" | "high" | "medium" | "low";

export type WakeSettings = {
  palette: WakePalette;
  cruiseSpeed: number;
  wakeForce: number;
  waveHeight: number;
  vorticity: number;
  foamSensitivity: number;
  foamPersistence: number;
  sprayAmount: number;
  sprayHeight: number;
  quality: WakeQuality;
};

export const DEFAULT_WAKE_SETTINGS: WakeSettings = {
  palette: "monochrome",
  cruiseSpeed: 1,
  wakeForce: 1,
  waveHeight: 0.8,
  vorticity: 4,
  foamSensitivity: 0.55,
  foamPersistence: 4,
  sprayAmount: 1,
  sprayHeight: 1,
  quality: "auto",
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
