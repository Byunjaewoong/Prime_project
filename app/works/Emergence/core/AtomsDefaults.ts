export const DESKTOP_ATOM_DEFAULTS = {
  particleCount: 15000,
  worldScale: 0.5,
  friction: 0.08,
} as const;

export const MOBILE_ATOM_DEFAULTS = {
  particleCount: 30000,
  worldScale: 1.1,
  friction: 2.0,
} as const;

export type AtomDefaults = {
  particleCount: number;
  worldScale: number;
  friction: number;
};
