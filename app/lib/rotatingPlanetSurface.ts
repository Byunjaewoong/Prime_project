type Vec3 = { x: number; y: number; z: number };

export type SurfaceRotation = {
  axis: Vec3;
  sine: number;
  cosine: number;
};

export function surfaceRotation(polarX: number, polarY: number, polarZ: number, angle: number): SurfaceRotation {
  const length = Math.hypot(polarX, polarY, polarZ) || 1;
  return {
    axis: { x: polarX / length, y: polarY / length, z: polarZ / length },
    sine: Math.sin(-angle),
    cosine: Math.cos(-angle),
  };
}

// Match Trio's rotating, axis-banded surface while leaving each work's lighting intact.
export function rotatingSurfaceDistance(
  x: number,
  y: number,
  z: number,
  radius: number,
  rotation: SurfaceRotation,
  seed: number
) {
  const nx = x / radius;
  const ny = y / radius;
  const nz = z / radius;
  const { axis, sine, cosine } = rotation;
  const axisDot = nx * axis.x + ny * axis.y + nz * axis.z;
  const crossX = axis.y * nz - axis.z * ny;
  const crossY = axis.z * nx - axis.x * nz;
  const crossZ = axis.x * ny - axis.y * nx;
  const localX = nx * cosine + crossX * sine + axis.x * axisDot * (1 - cosine);
  const localY = ny * cosine + crossY * sine + axis.y * axisDot * (1 - cosine);
  const localZ = nz * cosine + crossZ * sine + axis.z * axisDot * (1 - cosine);
  const band = Math.sqrt(Math.max(0, 1 - axisDot * axisDot));
  const detail = Math.sin(localX * 9 + Math.sin(localY * 7 + seed) * 1.8)
    + Math.sin(localY * 13 + localZ * 5 + seed * 1.7) * 0.5;
  return Math.max(0, Math.min(1, band + detail * 0.08));
}
