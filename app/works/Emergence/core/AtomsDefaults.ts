export const DESKTOP_ATOM_DEFAULTS = {
  particleCount: 15000,
  worldScale: 0.5,
  friction: 0.08,
  depthMode: false,
  focusLayer: 1,
} as const;

export const MOBILE_ATOM_DEFAULTS = {
  particleCount: 30000,
  worldScale: 0.5,
  friction: 0.2,
  depthMode: true,
  focusLayer: 1,
} as const;

export type AtomDefaults = {
  particleCount: number;
  worldScale: number;
  friction: number;
  depthMode: boolean;
  focusLayer: 0 | 1;
};
