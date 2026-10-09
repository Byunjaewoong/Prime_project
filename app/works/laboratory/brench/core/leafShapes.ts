/** Shape names describe the reference photograph, rather than claiming a species. */
export const LEAF_TYPES = [
  { id: "oval", label: "타원 · 단풍", detail: "뾰족한 끝 · 구릿빛 얼룩", color: "#ae542a" },
  { id: "round", label: "둥근 잎", detail: "둥근 잎몸 · 황갈색 잎맥", color: "#b9953f" },
  { id: "heart", label: "하트 잎", detail: "패인 밑부분 · 부드러운 녹색", color: "#66852f" },
  { id: "lobed", label: "갈래 · 톱니", detail: "세 갈래 끝 · 날카로운 톱니", color: "#68a12b" },
  { id: "lance", label: "긴 잎", detail: "가늘고 긴 잎몸 · 짙은 광택", color: "#365e27" },
  { id: "palmate", label: "손바닥 겹잎", detail: "일곱 소엽 · 방사형 잎자루", color: "#427432" },
  { id: "variegated", label: "무늬 겹잎", detail: "다섯 소엽 · 불규칙한 노란 무늬", color: "#82953b" },
  { id: "pinnate", label: "깃꼴 겹잎", detail: "마주 난 소엽 · 가을빛 반점", color: "#9c713f" },
] as const;

export type LeafType = typeof LEAF_TYPES[number]["id"];
export type BladeShape = "oval" | "round" | "heart" | "lobed" | "lance" | "cotyledon";
export type LeafSurfaceType = LeafType | "cotyledon";
export type Leaflet = { x: number; y: number; angle: number; length: number; width: number; shape: BladeShape };

export function leaflets(type: LeafSurfaceType): Leaflet[] {
  if (type === "palmate" || type === "variegated") {
    const count = type === "palmate" ? 7 : 5;
    return Array.from({ length: count }, (_, i) => ({ x: 0, y: .27,
      angle: (i - (count - 1) / 2) * (type === "palmate" ? .77 : 1.04),
      length: .69 - Math.abs(i - (count - 1) / 2) * .052,
      width: .83, shape: "lance" }));
  }
  if (type === "pinnate") {
    const blades: Leaflet[] = [{ x: 0, y: .91, angle: 0, length: .34, width: .9, shape: "oval" }];
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) blades.push({
      x: 0, y: .13 + i * .22 + (side === 1 ? .018 : 0), angle: side * (1.3 - i * .035),
      length: .34 - Math.abs(i - 1) * .028, width: .9, shape: "oval",
    });
    return blades;
  }
  return [{ x: 0, y: 0, angle: 0, length: 1, width: 1, shape: type }];
}

/** The same boundary drives the mesh and the menu specimen drawings. */
export function bladePoint(shape: BladeShape, v: number, across: number): [number, number] {
  const sine = Math.max(0, Math.sin(Math.PI * v));
  let width = Math.pow(sine, .78) * .36;
  if (shape === "lance") width = Math.pow(sine, 1.08) * .235 * (1.16 - v * .36);
  if (shape === "round") width = Math.pow(sine, .55) * .46;
  if (shape === "cotyledon") width = Math.pow(sine, .6) * .37;
  if (shape === "heart") width = Math.pow(sine, .52) * .52 * (1.18 - v * .6);
  if (shape === "lobed") width = Math.pow(sine, .85) * (.17 + .36 * Math.max(0, 1 - Math.abs(v - .49) / .21));
  if (shape === "oval" || shape === "lobed" || shape === "round") {
    const tooth = 1 - Math.abs(((v * (shape === "lobed" ? 19 : 25)) % 1) * 2 - 1);
    width *= 1 - tooth * (shape === "lobed" ? .16 : .045);
  }
  const x = across * width * (1 + .025 * across * Math.sin(v * 14));
  const y = v - (shape === "heart" ? .30 * Math.pow(sine, .55) * Math.pow(1 - v, 3) * Math.pow(Math.abs(across), 1.5) : 0);
  return [x, y];
}

export function bladeOutline(shape: BladeShape) {
  const points: [number, number][] = [];
  for (let i = 0; i <= 96; i++) points.push(bladePoint(shape, i / 96, 1));
  for (let i = 96; i >= 0; i--) points.push(bladePoint(shape, i / 96, -1));
  return `M${points.map(([x, y]) => `${x.toFixed(4)},${(-y).toFixed(4)}`).join("L")}Z`;
}
