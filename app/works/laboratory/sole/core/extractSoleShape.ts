export type ExtractedSole = { path: string; pieces: number };

type Point = { x: number; y: number };
type Edge = { from: Point; to: Point; direction: number; used: boolean };

const key = (point: Point) => `${point.x},${point.y}`;
const round = (value: number) => Math.round(value * 10) / 10;

function simplify(points: Point[]): Point[] {
  if (points.length < 4) return points;
  const corners = points.filter((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    return (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x);
  });
  return corners.length >= 3 ? corners : points;
}

/** Turns a high-contrast outsole image into filled SVG contours; no source pixels are rendered. */
export function extractSoleShape(image: ImageData, threshold: number): ExtractedSole {
  const { width, height, data } = image;
  const count = width * height;
  const mask = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    const luminance = (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) * alpha + 255 * (1 - alpha);
    mask[index] = luminance < threshold ? 1 : 0;
  }

  // Remove isolated image noise while retaining disconnected tread blocks.
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  const minimumArea = Math.max(5, Math.round(count * 0.000025));
  let pieces = 0;
  let left = width, top = height, right = -1, bottom = -1;
  for (let start = 0; start < count; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 1;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (tail < minimumArea) {
      for (let index = 0; index < tail; index++) mask[queue[index]] = 0;
      continue;
    }
    pieces++;
    for (let index = 0; index < tail; index++) {
      const x = queue[index] % width;
      const y = Math.floor(queue[index] / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { path: "", pieces: 0 };

  const edges: Edge[] = [];
  const outgoing = new Map<string, number[]>();
  const add = (from: Point, to: Point, direction: number) => {
    const index = edges.length;
    edges.push({ from, to, direction, used: false });
    const origin = key(from);
    const choices = outgoing.get(origin) ?? [];
    choices.push(index);
    outgoing.set(origin, choices);
  };
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const index = y * width + x;
    if (!mask[index]) continue;
    if (y === 0 || !mask[index - width]) add({ x, y }, { x: x + 1, y }, 0);
    if (x + 1 === width || !mask[index + 1]) add({ x: x + 1, y }, { x: x + 1, y: y + 1 }, 1);
    if (y + 1 === height || !mask[index + width]) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 }, 2);
    if (x === 0 || !mask[index - 1]) add({ x, y: y + 1 }, { x, y }, 3);
  }

  const spanX = right - left + 1;
  const spanY = bottom - top + 1;
  const scale = Math.min(392 / spanX, 972 / spanY);
  const offsetX = (420 - spanX * scale) / 2 - left * scale;
  const offsetY = (1000 - spanY * scale) / 2 - top * scale;
  const coordinate = (point: Point) => `${round(point.x * scale + offsetX)} ${round(point.y * scale + offsetY)}`;
  const paths: string[] = [];
  for (let start = 0; start < edges.length; start++) {
    if (edges[start].used) continue;
    const points: Point[] = [];
    let current = start;
    while (!edges[current].used) {
      const edge = edges[current];
      edge.used = true;
      points.push(edge.from);
      if (key(edge.to) === key(edges[start].from)) break;
      const options = outgoing.get(key(edge.to)) ?? [];
      const turnOrder = (direction: number) => {
        const turn = (direction - edge.direction + 4) % 4;
        return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
      };
      const next = options.filter(index => !edges[index].used).sort((a, b) =>
        turnOrder(edges[a].direction) - turnOrder(edges[b].direction))[0];
      if (next === undefined) break;
      current = next;
    }
    if (points.length >= 3) {
      const contour = simplify(points);
      paths.push(`M ${contour.map(coordinate).join(" L ")} Z`);
    }
  }
  return { path: paths.join(" "), pieces };
}
