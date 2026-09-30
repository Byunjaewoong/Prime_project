import type { PlanetAppearance } from "./TrioSimulation";

export function channelFromDistance(distance: number, coefficient: number) {
  const value = coefficient > 0
    ? (distance / coefficient) * 255
    : 255 + (distance / coefficient) * 255;
  return Math.max(0, Math.min(255, value));
}

export function appearanceAccentColor(appearance: PlanetAppearance) {
  // A bright mid-latitude band uses the same palette mapping as the sphere.
  const distance = 0.78;
  const channels = [appearance.palette.red, appearance.palette.green, appearance.palette.blue];
  return `#${channels.map(coefficient => Math.round(channelFromDistance(distance, coefficient))
    .toString(16).padStart(2, "0")).join("")}`;
}
