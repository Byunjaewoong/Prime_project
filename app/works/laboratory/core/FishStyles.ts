export const FISH_STYLE_OPTIONS = [
  { id: "solid", label: "1. Solid Minimal" },
  { id: "contour", label: "2. Contour Line" },
  { id: "layered", label: "3. Monochrome Layer" },
  { id: "glass", label: "4. Glass Body" },
  { id: "ribbon", label: "5. Ribbon Structure" },
  { id: "cutout", label: "6. Graphic Cutout" },
] as const;

export type FishStyle = (typeof FISH_STYLE_OPTIONS)[number]["id"];

export function fishStyleIndex(style: FishStyle) {
  return FISH_STYLE_OPTIONS.findIndex(option => option.id === style);
}
