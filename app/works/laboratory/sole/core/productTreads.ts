import type { SoleMark } from "./generateSole";

// Twelve original vector studies of recognizable outsole *structures*. The
// product photos and brand marks are not embedded; the traced outer silhouette
// is supplied by generateSole.ts and clips every path in SoleExperience.
export type ProductTread =
  | "air-force-1" | "vans-authentic" | "chuck-taylor" | "samba-og"
  | "superstar" | "speedcross-6" | "moab-3" | "timberland-6"
  | "dr-martens-1460" | "gel-kayano-31" | "cloud-6" | "pegasus-37";

const n = (value: number) => +value.toFixed(1);
const rect = (x: number, y: number, w: number, h: number, r = 0) => {
  const q = Math.min(r, w / 2, h / 2);
  return `M ${n(x + q)} ${n(y)} H ${n(x + w - q)} Q ${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + q)} V ${n(y + h - q)} Q ${n(x + w)} ${n(y + h)} ${n(x + w - q)} ${n(y + h)} H ${n(x + q)} Q ${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - q)} V ${n(y + q)} Q ${n(x)} ${n(y)} ${n(x + q)} ${n(y)} Z`;
};
const disk = (x: number, y: number, r: number) => `M ${n(x - r)} ${n(y)} a ${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0 a ${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0 Z`;
const poly = (points: [number, number][]) => `M ${points.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L ")} Z`;

export function generateProductTread(seed: number, product: ProductTread): SoleMark[] {
  const marks: SoleMark[] = [];
  // A seed changes the molding pitch a little; the product's tread grammar remains legible.
  const variation = ((seed >>> 0) % 17 - 8) / 8;
  const pitch = (base: number) => base * (1 + variation * 0.035);
  const add = (d: string, tone: SoleMark["tone"] = "ink", transform?: string) => marks.push({ d, tone, transform });
  const line = (d: string, width: number, tone: SoleMark["tone"] = "paper") => marks.push({ d, tone, strokeWidth: width });
  const field = () => add(rect(0, 0, 420, 1000));
  const pivot = (x: number, y: number, radii: number[], width: number) => {
    for (const radius of radii) line(disk(x, y, radius), width);
    add(disk(x, y, 7), "paper");
  };
  const horizontalSipes = (x: number, y: number, w: number, count: number, gap: number) => {
    for (let i = 0; i < count; i++) line(`M ${n(x)} ${n(y + i * gap)} H ${n(x + w)}`, 3.3);
  };

  switch (product) {
    case "air-force-1": {
      field();
      pivot(216, 285, [29, 51, 73, 96, 119, 143], 5);
      pivot(205, 844, [25, 47, 69, 91, 113], 5);
      for (let y = 474; y < 715; y += 24) line(`M 72 ${y} Q 205 ${y - 24} 355 ${y + 2}`, 5);
      for (let y = 59; y < 160; y += 19) line(`M 86 ${y} Q 205 ${y - 34} 350 ${y + 6}`, 4);
      break;
    }
    case "vans-authentic": {
      field();
      // The Authentic's compact waffle recesses cover the entire rubber base.
      for (let y = 42; y < 974; y += pitch(30)) {
        for (let x = 42; x < 390; x += pitch(30)) {
          add(rect(x, y, 23, 23, 2), "paper");
          add(rect(x + 4, y + 4, 15, 15, 2), "gray");
        }
      }
      break;
    }
    case "chuck-taylor": {
      field();
      // Repeating diamond pockets, with a longitudinal center break.
      for (let y = 54; y < 972; y += pitch(28)) {
        for (let x = 36; x < 400; x += pitch(28)) {
          add(poly([[x, y - 12], [x + 12, y], [x, y + 12], [x - 12, y]]), "paper");
        }
      }
      line("M 207 44 C 183 330 224 620 211 967", 8);
      break;
    }
    case "samba-og": {
      field();
      pivot(219, 315, [23, 39, 56, 73, 90], 3.4);
      pivot(205, 816, [21, 37, 53, 69], 3.4);
      for (let y = 105; y < 540; y += pitch(16)) {
        line(`M 38 ${y} Q 109 ${y - 9} 154 ${y + 4}`, 3);
        line(`M 275 ${y - 3} Q 344 ${y - 13} 407 ${y + 7}`, 3);
      }
      for (let y = 585; y < 755; y += 17) line(`M 91 ${y} L 335 ${y - 20}`, 3);
      break;
    }
    case "superstar": {
      field();
      for (let y = 58; y < 978; y += pitch(22)) {
        line(`M 18 ${y - 16} L 210 ${y + 17} L 402 ${y - 16}`, 5);
      }
      line("M 210 38 L 210 984", 6);
      break;
    }
    case "speedcross-6": {
      // Deep, widely spaced directional mud lugs, reversing at the heel.
      for (let y = 78; y < 970; y += pitch(59)) {
        const reverse = y > 710 ? -1 : 1;
        for (const side of [-1, 1]) {
          const x = side < 0 ? 126 : 284;
          const cy = y + (side < 0 ? 0 : 20);
          add(poly([[x - 55, cy - 19 * reverse], [x + 14, cy - 24 * reverse], [x + 56, cy + 6 * reverse], [x - 10, cy + 25 * reverse]]), "ink");
          line(`M ${x - 35} ${cy - 12 * reverse} L ${x + 17} ${cy + 13 * reverse}`, 3);
        }
      }
      break;
    }
    case "moab-3": {
      // Broad asymmetric Vibram-style hiking blocks and open evacuation channels.
      for (let y = 85, row = 0; y < 958; y += pitch(67), row++) {
        for (let column = 0; column < 3; column++) {
          const x = 84 + column * 119 + (row % 2 ? 17 : -6);
          add(poly([[x - 42, y - 22], [x + 24, y - 29], [x + 47, y - 7], [x + 33, y + 26], [x - 33, y + 29], [x - 48, y + 4]]));
          line(`M ${x - 27} ${y + 2} L ${x + 23} ${y - 7}`, 3);
        }
      }
      break;
    }
    case "timberland-6": {
      for (let y = 64, row = 0; y < 980; y += pitch(83), row++) {
        for (const side of [-1, 1]) {
          const x = side < 0 ? 30 : 255;
          const offset = row % 2 ? 17 : 0;
          add(rect(x, y + offset, 136, 60, 10));
          line(`M ${x + 25} ${y + offset + 16} L ${x + 105} ${y + offset + 44}`, 3);
        }
        add(rect(177, y + 15, 66, 39, 8));
      }
      break;
    }
    case "dr-martens-1460": {
      field();
      // DMS-inspired 5/3 cleat cadence with a quiet medial waist.
      for (let y = 56; y < 505; y += pitch(56)) {
        for (let col = 0; col < 5; col++) add(rect(53 + col * 69, y, 46, 35, 8), "paper");
      }
      for (let y = 530; y < 715; y += 34) line(`M 48 ${y} Q 215 ${y - 9} 375 ${y + 1}`, 4);
      for (let y = 745; y < 969; y += pitch(63)) {
        for (let col = 0; col < 3; col++) add(rect(76 + col * 105, y, 75, 42, 9), "paper");
      }
      break;
    }
    case "gel-kayano-31": {
      // Split rubber contact zones, offset pods, and short grip sipes.
      for (let y = 80, row = 0; y < 965; y += pitch(78), row++) {
        const fore = y < 540;
        const leftW = fore ? 119 : 91;
        const rightW = fore ? 136 : 111;
        const leftX = fore ? 57 : 92;
        const rightX = fore ? 231 : 222;
        add(rect(leftX, y, leftW, 57, 18), "ink", `rotate(${-8 + row % 3 * 3} ${leftX + leftW / 2} ${y + 28})`);
        add(rect(rightX, y + (row % 2 ? 11 : -5), rightW, 54, 18), "ink");
        horizontalSipes(leftX + 17, y + 15, leftW - 34, 3, 12);
        horizontalSipes(rightX + 18, y + 15, rightW - 34, 3, 12);
      }
      break;
    }
    case "cloud-6": {
      // Connected lengthwise CloudTec-style pods with open channels.
      for (let row = 0; row < 9; row++) {
        const y = 67 + row * pitch(105);
        for (const side of [-1, 1]) {
          const x = side < 0 ? 89 : 252;
          add(rect(x - 55, y, 124, 80, 34));
          add(rect(x - 31, y + 15, 73, 49, 23), "paper");
        }
        if (row < 8) add(rect(176, y + 68, 54, 39, 13));
      }
      break;
    }
    case "pegasus-37": {
      field();
      // Nike's catalog describes horizontal lugs and a perforated perimeter.
      for (let y = 82; y < 951; y += pitch(43)) {
        add(rect(73, y, 285, 24, 7), "paper");
        for (let col = 0; col < 3; col++) add(rect(91 + col * 94, y + 6, 53, 12, 4), "gray");
      }
      for (let y = 78; y < 950; y += 27) {
        add(disk(43, y, 5), "paper");
        add(disk(381, y + 11, 5), "paper");
      }
      break;
    }
  }
  return marks;
}
