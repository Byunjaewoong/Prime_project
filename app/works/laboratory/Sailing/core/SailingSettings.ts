export type SailingPalette = "monochrome" | "deep-blue";
export type SailingQuality = "auto" | "high" | "medium" | "low";

export type SailingSettings = {
  palette: SailingPalette;
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
  vortexGridSize: number;
  vortexOutputSize: number;
  quality: SailingQuality;
};

export const SAILING_DEFAULT_SETTINGS: SailingSettings = {
  palette: "monochrome",
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
  showVectors: false,
  sprayAmount: 1,
  sprayHeight: 1,
  vortexGridSize: 384,
  vortexOutputSize: 1536,
  quality: "high",
};

export const SAILING_MOBILE_DEFAULT_SETTINGS: SailingSettings = {
  ...SAILING_DEFAULT_SETTINGS,
  palette: "monochrome",
  cruiseSpeed: 1.8,
  wakeForce: 1.45,
  waveHeight: 0.9,
  waveSpeed: 0.6,
  waveDamping: 0.45,
  vortexGridSize: 256,
  vortexOutputSize: 1536,
};

export const isMobileSailingDevice = () =>
  typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760);

export const resolveInitialSailingSettings = (): SailingSettings => ({
  ...(isMobileSailingDevice() ? SAILING_MOBILE_DEFAULT_SETTINGS : SAILING_DEFAULT_SETTINGS),
});

export type ResolvedSailingQuality = "high" | "medium" | "low";

export const QUALITY_PRESETS: Record<ResolvedSailingQuality, {
  simulation: number;
  surfaceSegments: number;
  particles: number;
  pressureIterations: number;
}> = {
  high: { simulation: 320, surfaceSegments: 256, particles: 2400, pressureIterations: 10 },
  medium: { simulation: 160, surfaceSegments: 128, particles: 700, pressureIterations: 8 },
  low: { simulation: 128, surfaceSegments: 96, particles: 350, pressureIterations: 6 },
};

export const resolveInitialQuality = (): ResolvedSailingQuality => {
  if (typeof window === "undefined") return "medium";
  return isMobileSailingDevice() ? "medium" : "high";
};
