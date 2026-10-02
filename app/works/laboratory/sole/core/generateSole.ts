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

// White is recessed rubber, black is raised contact; the photo itself is never rendered.
export const SOLE_OUTLINE = traceOutline();

export type SoleFamily = "trail" | "chevron" | "waffle" | "segmented";
export type SoleMark = {
  d: string;
  tone: "ink" | "paper";
  transform?: string;
  strokeWidth?: number;
};

export const SOLE_FAMILIES: { value: SoleFamily; label: string }[] = [
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

export function generateSole(seed: number, family: SoleFamily): SoleMark[] {
  const next = randomSource(seed);
  const random = (min: number, max: number) => min + (max - min) * next();
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

  if (family === "trail") {
    // Longitudinal edge lugs, staggered contact pods, and isolated traction studs.
    for (const start of [154, 734]) {
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
    for (let row = 0; row < 6; row++) {
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
      const y = index < 5 ? random(190, 505) : random(768, 910);
      const x = random(boundsAt(y).left + 88, boundsAt(y).right - 88);
      stud(x, y, random(9, 15), next() > 0.35);
    }
    // A few diagonal arch bars break the repeating forefoot/heel rhythm.
    for (let index = 0; index < 3; index++) {
      const y = 552 + index * 43;
      stroke(`M ${rounded(128 + index * 8)} ${y} L ${rounded(285 + index * 4)} ${y + 66}`, random(13, 20));
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
    for (const x of [151, 207, 265]) {
      stroke(`M ${x - 17} 530 Q ${x + 15} 606 ${x - 8} 693`, random(13, 19));
    }
    for (let row = 0; row < 4; row++) {
      const y = 172 + row * 99 + random(-9, 9);
      sideLug(-1, y, random(37, 52), random(31, 39), false);
      sideLug(1, y + 18, random(37, 52), random(31, 39), false);
    }
    stroke("M 209 102 L 209 451", random(5, 7), "paper");
    stroke("M 209 752 L 209 942", random(5, 7), "paper");
  } else if (family === "waffle") {
    // Dense separated contact cells, with the arch left sparse for flex.
    for (const [start, end, pitch] of [[80, 495, 43], [525, 680, 48], [730, 965, 42]]) {
      for (let y = start, row = 0; y < end; y += pitch, row++) {
        const { left, right } = boundsAt(y);
        const inset = start === 525 ? 54 : 14;
        const offset = row % 2 ? pitch * 0.45 : 0;
        for (let x = left + inset + offset; x < right - inset - 25; x += pitch) {
          if (next() < (start === 525 ? 0.72 : 0.94)) {
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
    for (let index = 0; index < 4; index++) {
      const y = 540 + index * 41;
      stroke(`M ${142 + index * 6} ${y} L ${286 - index * 7} ${y + 35}`, random(11, 16));
    }
    for (const y of [104, 371, 771, 902]) stud(210 + random(-15, 15), y, random(8, 13), true);
  }

  return [...ink, ...cuts];
}
