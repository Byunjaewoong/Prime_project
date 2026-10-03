// Sampled left/right silhouette bounds from the supplied 691 × 1280 outsole photograph.
// The forefoot leans left, the narrow waist shifts right, and the heel returns left.
// Both the vector outline and tread placement use this same traced profile.
const PHOTO_PROFILE: [number, number, number][] = [
  [27, 293, 325], [40, 250, 376], [55, 227, 405], [80, 207, 431],
  [105, 191, 453], [130, 178, 470], [155, 166, 485], [180, 157, 499],
  [205, 150, 511], [230, 145, 520], [255, 141, 533], [280, 136, 544],
  [305, 135, 552], [330, 134, 559], [355, 135, 566], [380, 140, 568],
  [405, 143, 567], [430, 147, 575], [455, 152, 578], [480, 158, 580],
  [505, 165, 581], [530, 172, 579], [555, 181, 576], [580, 190, 573],
  [605, 197, 570], [630, 206, 567], [655, 214, 564], [680, 223, 560],
  [705, 232, 555], [730, 238, 552], [755, 240, 547], [780, 240, 544],
  [805, 239, 541], [830, 237, 539], [855, 235, 537], [880, 232, 535],
  [905, 228, 534], [930, 225, 533], [955, 220, 533], [980, 217, 533],
  [1005, 213, 528], [1030, 210, 531], [1055, 206, 529], [1080, 203, 528],
  [1105, 202, 522], [1130, 203, 521], [1155, 208, 516], [1180, 216, 496],
  [1205, 228, 498], [1230, 246, 478], [1255, 279, 447],
];

const rounded = (value: number) => Math.round(value * 10) / 10;
const viewX = (x: number) => rounded((x - 94.5) * 0.8);
const viewY = (y: number) => rounded(16 + (y - 27) * 964 / 1252);
const PROFILE = PHOTO_PROFILE.map(([y, left, right]) => ({ y: viewY(y), left: viewX(left), right: viewX(right) }));

type Point = { x: number; y: number };

function curveThrough(points: Point[]) {
  return points.slice(1).map((point, index) => {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = point;
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1x = rounded(p1.x + (p2.x - p0.x) / 6);
    const c1y = rounded(p1.y + (p2.y - p0.y) / 6);
    const c2x = rounded(p2.x - (p3.x - p1.x) / 6);
    const c2y = rounded(p2.y - (p3.y - p1.y) / 6);
    return `C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }).join(" ");
}

function traceOutline() {
  const left = PROFILE.map(({ left: x, y }) => ({ x, y }));
  const right = PROFILE.map(({ right: x, y }) => ({ x, y })).reverse();
  const bottomLeft = left[left.length - 1];
  const bottomRight = right[0];
  const bottomCenter = rounded((bottomLeft.x + bottomRight.x) / 2);
  const topRight = right[right.length - 1];
  const topLeft = left[0];
  return `M ${topLeft.x} ${topLeft.y} ${curveThrough(left)}
    C ${rounded(bottomLeft.x + 12)} 984 ${rounded(bottomCenter - 31)} 996 ${bottomCenter} 996
    C ${rounded(bottomCenter + 31)} 996 ${rounded(bottomRight.x - 12)} 984 ${bottomRight.x} ${bottomRight.y}
    ${curveThrough(right)} C ${rounded(topRight.x - 6)} 14 ${rounded(topLeft.x + 6)} 14 ${topLeft.x} ${topLeft.y} Z`;
}

// White is recessed rubber, black is raised contact, gray is the low-load waist.
export const SOLE_OUTLINE = traceOutline();

export type SoleFamily = "imprint" | "trail" | "chevron" | "waffle" | "segmented";
export type SoleMark = {
  d: string;
  tone: "ink" | "paper" | "gray";
  transform?: string;
  strokeWidth?: number;
};

export const SOLE_FAMILIES: { value: SoleFamily; label: string }[] = [
  { value: "imprint", label: "Imprint shapes" },
  { value: "trail", label: "Trail lugs" },
  { value: "chevron", label: "Chevron grip" },
  { value: "waffle", label: "Waffle grid" },
  { value: "segmented", label: "Segmented road" },
];

function boundsAt(y: number) {
  for (let index = 1; index < PROFILE.length; index++) {
    const next = PROFILE[index];
    if (y <= next.y) {
      const previous = PROFILE[index - 1];
      const t = (y - previous.y) / (next.y - previous.y);
      return { left: previous.left + (next.left - previous.left) * t, right: previous.right + (next.right - previous.right) * t };
    }
  }
  const last = PROFILE[PROFILE.length - 1];
  return { left: last.left, right: last.right };
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const x2 = x + width;
  const y2 = y + height;
  return `M ${rounded(x + r)} ${rounded(y)} H ${rounded(x2 - r)} Q ${rounded(x2)} ${rounded(y)} ${rounded(x2)} ${rounded(y + r)} V ${rounded(y2 - r)} Q ${rounded(x2)} ${rounded(y2)} ${rounded(x2 - r)} ${rounded(y2)} H ${rounded(x + r)} Q ${rounded(x)} ${rounded(y2)} ${rounded(x)} ${rounded(y2 - r)} V ${rounded(y + r)} Q ${rounded(x)} ${rounded(y)} ${rounded(x + r)} ${rounded(y)} Z`;
}

function circle(cx: number, cy: number, radius: number) {
  return `M ${rounded(cx - radius)} ${rounded(cy)} a ${rounded(radius)} ${rounded(radius)} 0 1 0 ${rounded(radius * 2)} 0 a ${rounded(radius)} ${rounded(radius)} 0 1 0 ${rounded(-radius * 2)} 0 Z`;
}

function polygon(points: [number, number][]) {
  return `M ${points.map(([x, y]) => `${rounded(x)} ${rounded(y)}`).join(" L ")} Z`;
}

function rotated(angle: number, x: number, y: number) {
  return `rotate(${rounded(angle)} ${rounded(x)} ${rounded(y)})`;
}

function softPod(cx: number, cy: number, width: number, height: number, taper: number) {
  const left = cx - width / 2;
  const right = cx + width / 2;
  const top = cy - height / 2;
  const bottom = cy + height / 2;
  return `M ${rounded(left + width * 0.14)} ${rounded(top)}
    C ${rounded(cx - width * 0.17)} ${rounded(top - height * 0.12)} ${rounded(right - width * 0.12)} ${rounded(top + height * 0.08)} ${rounded(right)} ${rounded(cy - height * taper)}
    Q ${rounded(right + width * 0.08)} ${rounded(bottom - height * 0.06)} ${rounded(right - width * 0.22)} ${rounded(bottom)}
    C ${rounded(cx - width * 0.09)} ${rounded(bottom + height * 0.08)} ${rounded(left - width * 0.11)} ${rounded(bottom - height * 0.1)} ${rounded(left)} ${rounded(cy + height * 0.04)}
    Q ${rounded(left - width * 0.03)} ${rounded(top + height * 0.2)} ${rounded(left + width * 0.14)} ${rounded(top)} Z`;
}

function crescent(cx: number, y: number, width: number, height: number, upsideDown = false) {
  const transform = upsideDown ? `translate(0 ${rounded(2 * y + height)}) scale(1 -1)` : undefined;
  const d = `M ${rounded(cx - width / 2)} ${rounded(y + height * 0.66)}
    C ${rounded(cx - width * 0.43)} ${rounded(y + height * 0.17)} ${rounded(cx - width * 0.21)} ${rounded(y)} ${rounded(cx)} ${rounded(y)}
    C ${rounded(cx + width * 0.21)} ${rounded(y)} ${rounded(cx + width * 0.43)} ${rounded(y + height * 0.17)} ${rounded(cx + width / 2)} ${rounded(y + height * 0.66)}
    Q ${rounded(cx + width * 0.47)} ${rounded(y + height * 0.91)} ${rounded(cx + width * 0.28)} ${rounded(y + height * 0.78)}
    Q ${rounded(cx + width * 0.12)} ${rounded(y + height * 0.53)} ${rounded(cx)} ${rounded(y + height * 0.7)}
    Q ${rounded(cx - width * 0.12)} ${rounded(y + height * 0.53)} ${rounded(cx - width * 0.28)} ${rounded(y + height * 0.78)}
    Q ${rounded(cx - width * 0.47)} ${rounded(y + height * 0.91)} ${rounded(cx - width / 2)} ${rounded(y + height * 0.66)} Z`;
  return { d, transform };
}

function generateImprint(seed: number): SoleMark[] {
  const next = randomSource(seed);
  const random = (min: number, max: number) => min + (max - min) * next();
  const integer = (min: number, max: number) => Math.floor(random(min, max + 1));
  const marks: SoleMark[] = [];
  const solid = (d: string, transform?: string) => marks.push({ d, transform, tone: "ink" });
  const motif = integer(0, 3);
  const toe = integer(0, 2);
  const heel = integer(0, 2);
  const center = random(196, 224);
  const lean = random(-18, 18);
  const toeWidth = random(174, 254);
  const heelWidth = random(145, 220);

  if (toe === 0) {
    const cap = crescent(center + lean * 0.35, random(38, 57), toeWidth, random(78, 111));
    solid(cap.d);
  } else if (toe === 1) {
    for (const side of [-1, 1]) {
      const x = center + side * toeWidth * 0.29;
      solid(softPod(x, 87, toeWidth * 0.38, random(65, 88), side * 0.12), rotated(side * random(8, 17), x, 87));
    }
  } else {
    for (let index = 0; index < 3; index++) {
      const x = center + (index - 1) * toeWidth * 0.32;
      solid(softPod(x, 85 + (index === 1 ? -10 : 14), toeWidth * 0.25, random(58, 80), 0.12),
        rotated((index - 1) * random(8, 15), x, 85));
    }
  }

  const forefootRows = motif === 1 ? integer(4, 5) : integer(4, 7);
  const forefootStart = random(173, 203);
  const forefootEnd = random(458, 492);
  const forefootPitch = (forefootEnd - forefootStart) / (forefootRows - 1);
  const forefootWidth = random(255, 300);
  for (let row = 0; row < forefootRows; row++) {
    const progress = row / Math.max(1, forefootRows - 1);
    const y = forefootStart + (forefootEnd - forefootStart) * progress;
    const rowCenter = center + lean * (progress - 0.3) + random(-6, 6);
    const width = forefootWidth * (0.94 + Math.sin(progress * Math.PI) * 0.08);
    if (motif === 1) {
      // Two long diagonal blades form a V-shaped, herringbone contact zone.
      for (const side of [-1, 1]) {
        const x = rowCenter + side * random(53, 69);
        solid(softPod(x, y + random(-5, 5), random(78, 96), random(22, 31), side * 0.12),
          rotated(side * random(22, 36), x, y));
      }
      if (row % 2 === 0) solid(circle(rowCenter, y + random(-5, 5), random(7, 12)));
      continue;
    }
    if (motif === 2) {
      // Staggered, separated pebble pads change both the column count and offset.
      const columns = row % 2 ? 4 : 3;
      for (let column = 0; column < columns; column++) {
        const x = rowCenter + (column - (columns - 1) / 2) * (width / (columns + 0.25));
        const cy = y + random(-4, 4);
        const size = random(43, 64);
        solid(softPod(x, cy, size, random(28, Math.min(43, forefootPitch * 0.72)), random(-0.15, 0.2)), rotated(random(-16, 16), x, cy));
      }
      continue;
    }
    if (motif === 3) {
      // Repeating broad arcs make a distinct segmented wave tread.
      const band = crescent(rowCenter, y - 19, width * random(0.59, 0.75), random(35, 43));
      solid(band.d);
      continue;
    }
    const sideWidth = random(48, 66);
    for (const side of [-1, 1]) {
      const x = rowCenter + side * (width / 2 - sideWidth / 2);
      const sy = y + random(-5, 5);
      const height = random(29, Math.min(52, forefootPitch * 0.72));
      const angle = side * random(4, 20);
      solid(softPod(x, sy, sideWidth, height, side * random(-0.08, 0.19)), rotated(angle, x, sy));
    }
    const innerCount = row % 3 === 1 ? 1 : 2;
    for (let index = 0; index < innerCount; index++) {
      const side = innerCount === 1 ? 0 : index ? 1 : -1;
      const x = rowCenter + side * random(26, 35);
      const iy = y + random(-6, 6);
      const size = random(26, 39);
      solid(softPod(x, iy, size, random(20, Math.min(33, forefootPitch * 0.65)), side * 0.16), rotated(side * random(34, 56), x, iy));
    }
  }

  // The open waist is deliberate: a small number of marks can vary without filling the arch.
  if (next() < 0.45) {
    const waistCount = integer(1, 3);
    for (let index = 0; index < waistCount; index++) {
      const y = 565 + index * 47 + random(-13, 13);
      const x = center + random(-64, 64);
      solid(softPod(x, y, random(24, 49), random(12, 23), 0.1), rotated(random(-35, 35), x, y));
    }
  }

  const heelRows = integer(2, 4);
  const heelPitch = 116 / Math.max(1, heelRows - 1);
  for (let row = 0; row < heelRows; row++) {
    const y = 764 + row * heelPitch + random(-5, 5);
    const rowCenter = center - lean * 0.5 + random(-7, 7);
    const width = heelWidth * random(0.78, 0.98);
    for (const side of [-1, 1]) {
      const x = rowCenter + side * width * 0.3;
      const padWidth = width * random(0.33, 0.39);
      const padHeight = random(23, Math.min(42, heelPitch * 0.75));
      if (heel === 1) solid(roundedRect(x - padWidth / 2, y - padHeight / 2, padWidth, padHeight, padHeight * 0.36),
        rotated(side * random(1, 12), x, y));
      else solid(softPod(x, y, padWidth, padHeight, side * 0.12), rotated(side * random(3, 18), x, y));
    }
    if (heel !== 2 || row % 2 === 0) {
      const dotCount = integer(1, 2);
      for (let index = 0; index < dotCount; index++) {
        const x = rowCenter + (index - (dotCount - 1) / 2) * 12;
        solid(circle(x, y + random(-4, 4), random(3, 6)));
      }
    }
  }
  if (heel === 0) {
    const cap = crescent(center - lean * 0.5, 908, heelWidth, random(70, 91), true);
    solid(cap.d, cap.transform);
  } else if (heel === 1) {
    solid(softPod(center - lean * 0.5, 958, heelWidth * 0.86, random(43, 57), 0.04));
  } else {
    for (const side of [-1, 1]) {
      const x = center - lean * 0.5 + side * heelWidth * 0.23;
      solid(softPod(x, 960, heelWidth * 0.44, random(39, 55), side * 0.11), rotated(side * 9, x, 960));
    }
  }
  return marks;
}

export function generateSole(seed: number, family: SoleFamily): SoleMark[] {
  if (family === "imprint") return generateImprint(seed);
  const next = randomSource(seed);
  const random = (min: number, max: number) => min + (max - min) * next();
  const archNext = randomSource(seed ^ 0x9e3779b9);
  const archRandom = (min: number, max: number) => min + (max - min) * archNext();
  const gray: SoleMark[] = [];
  const ink: SoleMark[] = [];
  const cuts: SoleMark[] = [];
  const solid = (d: string, transform?: string) => ink.push({ d, tone: "ink", transform });
  const cut = (d: string, transform?: string) => cuts.push({ d, tone: "paper", transform });
  const stroke = (d: string, width: number, tone: "ink" | "paper" = "ink") =>
    (tone === "ink" ? ink : cuts).push({ d, tone, strokeWidth: width });

  const sideLug = (side: -1 | 1, y: number, width: number, height: number, slotted = true) => {
    const { left, right } = boundsAt(y);
    const x = side < 0 ? left + 2 : right - width - 2;
    const angle = side * random(4, 13);
    const transform = rotated(angle, x + width / 2, y);
    solid(roundedRect(x, y - height / 2, width, height, height * 0.31), transform);
    if (slotted) {
      for (let groove = 0; groove < 5; groove++) {
        const grooveX = x + width * (side < 0 ? 0.07 + groove * 0.075 : 0.62 + groove * 0.075);
        cut(roundedRect(grooveX, y - height * 0.34, 3.3, height * 0.68, 1.6), transform);
      }
    }
  };

  const stud = (x: number, y: number, radius: number, hollow = false) => {
    solid(circle(x, y, radius));
    if (hollow) cut(circle(x + random(-1.2, 1.2), y + random(-1.2, 1.2), radius * random(0.23, 0.34)));
  };

  // Let the outline clip the midfoot plate so gray reaches both outer edges.
  // Its slanted shoulders and recessed flex cuts still change with each seed.
  const top = archRandom(502, 530);
  const bottom = archRandom(695, 730);
  const middle = (top + bottom) / 2;
  const middleBounds = boundsAt(middle);
  const middleLeft = middleBounds.left + archRandom(4, 11);
  const middleRight = middleBounds.right - archRandom(4, 12);
  const center = archRandom(225, 244);
  const topSlope = archRandom(18, 46) * (archNext() < 0.5 ? -1 : 1);
  const bottomSlope = archRandom(18, 44) * (archNext() < 0.5 ? -1 : 1);
  const topLeftY = top - topSlope / 2 + archRandom(-5, 5);
  const topRightY = top + topSlope / 2 + archRandom(-5, 5);
  const bottomLeftY = bottom - bottomSlope / 2 + archRandom(-6, 6);
  const bottomRightY = bottom + bottomSlope / 2 + archRandom(-6, 6);
  gray.push({
    tone: "gray",
    d: `M -20 ${rounded(topLeftY)}
      Q ${rounded(center + archRandom(-18, 18))} ${rounded(top + archRandom(-13, 15))} 440 ${rounded(topRightY)}
      L 440 ${rounded(bottomRightY)}
      Q ${rounded(center + archRandom(-17, 17))} ${rounded(bottom + archRandom(-19, 13))} -20 ${rounded(bottomLeftY)} Z`,
  });
  const archVariant = Math.floor(archNext() * 3);
  if (archVariant === 0) {
    const offset = archRandom(-22, 22);
    stroke(`M ${rounded(center + offset)} ${rounded(top + 9)} C ${rounded(center - 25 + offset)} ${rounded(middle - 30)} ${rounded(center + 29 + offset)} ${rounded(middle + 20)} ${rounded(center + offset)} ${rounded(bottom - 8)}`,
      archRandom(10, 19), "paper");
  } else if (archVariant === 1) {
    for (let index = 0; index < 3; index++) {
      const y = top + 46 + index * (bottom - top - 75) / 2;
      stroke(`M ${rounded(middleLeft + 16)} ${rounded(y - 16)} L ${rounded(middleRight - 17)} ${rounded(y + 20)}`,
        archRandom(7, 12), "paper");
    }
  } else {
    for (let index = 0; index < 4; index++) {
      const y = top + 38 + index * (bottom - top - 65) / 3;
      const x = center + (index % 2 ? 33 : -29) + archRandom(-8, 8);
      cut(roundedRect(x - archRandom(13, 19), y - 8, archRandom(26, 40), archRandom(14, 22), 8));
    }
  }

  if (family === "trail") {
    // Longitudinal edge lugs, staggered contact pods, and isolated traction studs.
    for (const start of [154, 752]) {
      const rows = start === 154 ? 6 : 4;
      for (let row = 0; row < rows; row++) {
        const y = start + row * (start === 154 ? 63 : 55) + random(-8, 8);
        sideLug(-1, y, random(92, 112), random(43, 54));
        sideLug(1, y + random(-16, 17), random(92, 112), random(43, 54));
      }
    }
    stroke("M 112 116 Q 210 11 310 113", 18);
    stroke("M 115 934 Q 210 1017 306 932", 19);
    for (const y of [68, 117, 919, 953]) {
      const { left, right } = boundsAt(y);
      const count = y < 200 ? 2 : 3;
      for (let index = 0; index < count; index++) {
        const x = left + 20 + (right - left - 40) * (index + 0.5) / count;
        stud(x, y + random(-7, 7), random(13, 19), true);
      }
    }
    for (let row = 0; row < 5; row++) {
      const y = 199 + row * 60 + random(-8, 8);
      const x = 209 + (row % 2 ? 26 : -23) + random(-12, 12);
      const w = random(70, 90);
      const h = random(43, 55);
      const angle = random(-18, 18);
      const pad = row % 2
        ? polygon([[x - w * 0.35, y - h / 2], [x + w * 0.31, y - h / 2], [x + w / 2, y],
          [x + w * 0.33, y + h / 2], [x - w * 0.32, y + h / 2], [x - w / 2, y]])
        : roundedRect(x - w / 2, y - h / 2, w, h, h * 0.43);
      solid(pad, rotated(angle, x, y));
      if (next() > 0.2) cut(circle(x + random(-12, 12), y + random(-5, 5), random(3.3, 5.2)));
    }
    for (let index = 0; index < 8; index++) {
      const y = index < 5 ? random(190, 480) : random(768, 910);
      const x = random(boundsAt(y).left + 88, boundsAt(y).right - 88);
      stud(x, y, random(9, 15), next() > 0.35);
    }
    stud(245, 848, 12, true);
  } else if (family === "chevron") {
    // Repeating opposing V ribs, with a quieter flex channel through the waist.
    let y = 82;
    for (let row = 0; row < 12; row++, y += random(31, 35)) {
      const { left, right } = boundsAt(y);
      const center = 209 + random(-11, 11);
      stroke(`M ${rounded(left + 21)} ${rounded(y - 8)} L ${rounded(center)} ${rounded(y + 16)} L ${rounded(right - 21)} ${rounded(y - 8)}`, random(10, 15));
    }
    y = 743;
    for (let row = 0; row < 7; row++, y += random(31, 35)) {
      const { left, right } = boundsAt(y);
      const center = 208 + random(-9, 9);
      stroke(`M ${rounded(left + 19)} ${rounded(y + 12)} L ${rounded(center)} ${rounded(y - 14)} L ${rounded(right - 19)} ${rounded(y + 12)}`, random(12, 16));
    }
    for (let row = 0; row < 4; row++) {
      const y = 172 + row * 99 + random(-9, 9);
      sideLug(-1, y, random(37, 52), random(31, 39), false);
      sideLug(1, y + 18, random(37, 52), random(31, 39), false);
    }
    stroke("M 209 102 L 209 451", random(5, 7), "paper");
    stroke("M 209 752 L 209 942", random(5, 7), "paper");
  } else if (family === "waffle") {
    // Dense separated contact cells at the two load-bearing ends.
    for (const [start, end, pitch] of [[80, 495, 43], [730, 965, 42]]) {
      for (let y = start, row = 0; y < end; y += pitch, row++) {
        const { left, right } = boundsAt(y);
        const inset = 14;
        const offset = row % 2 ? pitch * 0.45 : 0;
        for (let x = left + inset + offset; x < right - inset - 25; x += pitch) {
          if (next() < 0.94) {
            const cell = random(28, 35);
            const cellX = x + random(-3, 3);
            const cellY = y + random(-3, 3);
            const transform = rotated(random(-6, 6), cellX + cell / 2, cellY + cell * 0.41);
            solid(roundedRect(cellX, cellY, cell, cell * 0.82, random(4, 7)), transform);
            if (next() < 0.23) cut(roundedRect(cellX + cell * 0.43, cellY + 4, 3, cell * 0.57, 1), transform);
          }
        }
      }
    }
    for (const y of [205, 365, 805, 895]) {
      sideLug(-1, y, 28, 45, false);
      sideLug(1, y + 12, 28, 45, false);
    }
  } else {
    // Offset rubber bars and shallow sipe cuts echo road-running outsole modules.
    for (const [start, end, pitch] of [[84, 485, 63], [739, 944, 59]]) {
      for (let y = start, row = 0; y < end; y += pitch, row++) {
        const { left, right } = boundsAt(y);
        const center = 205 + random(-12, 12);
        const gap = random(10, 16);
        const height = random(40, 49);
        const leftX = left + random(7, 17);
        const rightX = center + gap;
        const leftW = center - gap - leftX;
        const rightW = right - random(7, 17) - rightX;
        const leftTransform = rotated(random(-7, -2), leftX + leftW / 2, y);
        const rightTransform = rotated(random(2, 7), rightX + rightW / 2, y);
        solid(roundedRect(leftX, y - height / 2, leftW, height, random(7, 12)), leftTransform);
        solid(roundedRect(rightX, y - height / 2, rightW, height, random(7, 12)), rightTransform);
        for (const [x, w, transform] of [[leftX, leftW, leftTransform], [rightX, rightW, rightTransform]] as const) {
          for (let slot = 1; slot <= 3; slot++) {
            const slotX = x + w * slot / 4;
            cut(roundedRect(slotX, y - height * 0.31, 3.4, height * 0.62, 1.7), transform);
          }
        }
      }
    }
    for (const y of [104, 371, 771, 902]) stud(210 + random(-15, 15), y, random(8, 13), true);
  }

  return [...gray, ...ink, ...cuts];
}
