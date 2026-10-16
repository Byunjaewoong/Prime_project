export const villagePalettes = {
  painted: {
    label: "컬러풀", swatches: ["#e9918a", "#086d98", "#087568"],
    walls: ["#e9918a", "#e8b2a0", "#f0d7a6", "#efe2bd", "#d6676c", "#c3464b", "#58b9b0", "#dbac8e", "#f0c3b0", "#853e34"],
    roofs: ["#086d98", "#135070", "#2789ad", "#3c6070", "#72c7bb", "#8bbfc4"],
    ink: "#603e36", hue: 0, saturation: 1, lightness: 0,
  },
  tropical: {
    label: "트로피컬", swatches: ["#f4a340", "#087eaa", "#ec6673"],
    walls: ["#f4a340", "#f8c36a", "#f7df96", "#f5e9c5", "#ec6673", "#d84c68", "#52c9bd", "#f1a06d", "#f6b6aa", "#8c415e"],
    roofs: ["#087eaa", "#07587e", "#209fc3", "#125d78", "#58b8bc", "#82d0ca"],
    ink: "#654447", hue: -8, saturation: 1.1, lightness: 0,
  },
  candy: {
    label: "캔디", swatches: ["#e897bd", "#7664ad", "#f6cf72"],
    walls: ["#e897bd", "#f2b3b7", "#f6cf72", "#f9e5ad", "#ba83cf", "#df6ea0", "#8bd6cc", "#efaf91", "#e5b7e1", "#785a9f"],
    roofs: ["#7664ad", "#554c98", "#9577c1", "#617bb6", "#72b9cf", "#a2a8d4"],
    ink: "#684969", hue: 18, saturation: .95, lightness: .015,
  },
  carnival: {
    label: "카니발", swatches: ["#e03f56", "#006f82", "#f3b832"],
    walls: ["#e03f56", "#f06840", "#f3b832", "#f4db8a", "#b63f89", "#cb3958", "#21a6a0", "#e57c4c", "#ef9b75", "#683a76"],
    roofs: ["#006f82", "#075365", "#22579d", "#543f7e", "#168f8e", "#6fb8a7"],
    ink: "#503749", hue: -4, saturation: 1.18, lightness: -.015,
  },
  mediterranean: {
    label: "지중해", swatches: ["#f5c151", "#175ca0", "#e88b7d"],
    walls: ["#e88b7d", "#f1b9a2", "#f5c151", "#f6e5bd", "#d8706d", "#ba5c62", "#63bfc4", "#e9a978", "#f6cdb5", "#8a6476"],
    roofs: ["#175ca0", "#123e7c", "#2986ba", "#346a9b", "#70bfc4", "#9bd5d4"],
    ink: "#604954", hue: 7, saturation: 1.05, lightness: 0,
  },
  sunset: {
    label: "석양", swatches: ["#db796e", "#68415b", "#838351"],
    walls: ["#d98177", "#e9b299", "#e7c68d", "#f0d6b4", "#ae5c63", "#c77657", "#b7a18c", "#c79883", "#e8b6aa", "#70445a"],
    roofs: ["#68415b", "#824c62", "#a96566", "#6e5366", "#c48170", "#9c7178"],
    ink: "#553743", hue: -22, saturation: .86, lightness: 0,
  },
  coast: {
    label: "해안", swatches: ["#f1e5d1", "#207d9c", "#4d9c86"],
    walls: ["#e9d7c5", "#f0e9d5", "#f3dfae", "#f5ebd8", "#a6bec1", "#6fa6b2", "#a7d2c6", "#d8c9b6", "#dbe6d9", "#526d7a"],
    roofs: ["#126480", "#154d69", "#2d8aaa", "#607c8b", "#70aaa8", "#a4ced0"],
    ink: "#3b5966", hue: 15, saturation: .82, lightness: .02,
  },
  earth: {
    label: "흙빛", swatches: ["#b87950", "#5a6655", "#81854c"],
    walls: ["#c58965", "#d7a480", "#dfc392", "#e9d4ab", "#a65e4c", "#9b5848", "#a8a679", "#c09070", "#d8af8d", "#684b40"],
    roofs: ["#576657", "#45574e", "#758063", "#6d6657", "#9b9470", "#a8ab85"],
    ink: "#524334", hue: -28, saturation: .72, lightness: -.01,
  },
  ink: {
    label: "잉크", swatches: ["#b8a792", "#514c48", "#777d70"],
    walls: ["#c1b5a3", "#d8cbb7", "#e6d8bd", "#eee3d0", "#a79a8c", "#89786e", "#b3b6a3", "#c6b49e", "#d7c7ae", "#615751"],
    roofs: ["#4e5050", "#41484a", "#696c68", "#73736e", "#969a8e", "#b5b8aa"],
    ink: "#49433f", hue: -25, saturation: .18, lightness: -.015,
  },
} as const;

export type VillagePaletteId = keyof typeof villagePalettes;

// The remaining hand-painted details keep their original value and opacity,
// while following the selected palette's hue and saturation.
export function tintVillageColor(hex: string, paletteId: VillagePaletteId) {
  if (paletteId === "painted") return hex;
  const palette = villagePalettes[paletteId];
  // Semantic wall, roof and contour colours are already selected for this
  // palette. Only the shared details and foliage need a hue adjustment.
  if ((palette.walls as readonly string[]).includes(hex) ||
      (palette.roofs as readonly string[]).includes(hex) || hex === palette.ink) return hex;
  const value = hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = ((hue * 60 + palette.hue) % 360 + 360) % 360;
  const light = (max + min) / 2;
  const sat = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
  const adjustedLight = Math.max(0, Math.min(1, light + palette.lightness));
  return `hsl(${hue.toFixed(1)} ${Math.min(100, sat * palette.saturation * 100).toFixed(1)}% ${(adjustedLight * 100).toFixed(1)}% / ${alpha.toFixed(3)})`;
}
