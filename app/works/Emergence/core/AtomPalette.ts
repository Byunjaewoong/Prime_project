export const MAX_COLOR_TYPES = 15;
export const DEFAULT_COLOR_TYPES = 5;

export const INITIAL_ATOM_COLORS = [
  0xf04464, 0x20c8e8, 0xf2c94c, 0x54d66b, 0xa56cff,
  0xff914d, 0x4d9bff, 0xe674cf, 0xa9d64f, 0x32d5aa,
  0xff6f9c, 0x9a9cf5, 0xdca64f, 0x63d4f5, 0xec7893,
];

export function randomAtomPalette(): number[] {
  const offset = Math.random() * 360;
  const colors = Array.from({ length: MAX_COLOR_TYPES }, (_, index) => {
    const hue = (offset + index * (360 / MAX_COLOR_TYPES) + (Math.random() - 0.5) * 10 + 360) % 360;
    const saturation = 0.68 + Math.random() * 0.2;
    const value = 0.85 + Math.random() * 0.15;
    const chroma = value * saturation;
    const sector = hue / 60;
    const secondary = chroma * (1 - Math.abs(sector % 2 - 1));
    const match = value - chroma;
    const [r, g, b] = sector < 1 ? [chroma, secondary, 0]
      : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary]
      : sector < 4 ? [0, secondary, chroma]
      : sector < 5 ? [secondary, 0, chroma]
      : [chroma, 0, secondary];
    return (Math.round((r + match) * 255) << 16)
      | (Math.round((g + match) * 255) << 8)
      | Math.round((b + match) * 255);
  });
  for (let index = colors.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [colors[index], colors[other]] = [colors[other], colors[index]];
  }
  return colors;
}

export function atomColorCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
