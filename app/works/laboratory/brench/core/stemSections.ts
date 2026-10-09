/** Continuous, seeded value noise. Sampling by arc length keeps swelling and
 * twisted growth ridges coherent along the wood instead of jittering each ring. */
function noise(x: number, seed: number) {
  const lattice = (i: number) => {
    let n = Math.imul(i ^ seed, 374761393);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const i = Math.floor(x), t = x - i;
  const blend = t * t * t * (t * (t * 6 - 15) + 10);
  return lattice(i) * (1 - blend) + lattice(i + 1) * blend;
}

/** Unit-radius cross sections, cached once per stem. Their true perimeter also
 * drives UVs, retaining physical bark density on oval, lobed and swollen wood. */
export function createStemSections(length: number, radius: number, segments: number, sides: number, seed: number, amount = 1) {
  const stride = sides + 1;
  const x = new Float32Array((segments + 1) * stride);
  const y = new Float32Array(x.length);
  const u = new Float32Array(x.length);
  const girth = new Float32Array(segments + 1);
  const perimeter = new Float32Array(segments + 1);
  const scale = Math.max(.28, radius * 5.5);
  const phase = (seed >>> 0) / 4294967296 * Math.PI * 2;
  for (let i = 0; i <= segments; i++) {
    const distance = i / segments * length / scale;
    const twist = phase + distance * .18 + noise(distance * .47 + 5, seed + 11) * 1.3;
    const oval = .20 + noise(distance * .61 + 13, seed + 23) * .07;
    const lobe = .10 + noise(distance * .83 + 7, seed + 37) * .045;
    const offsetX = noise(distance * .74 + 29, seed + 59) * .065;
    const offsetY = noise(distance * .68 + 41, seed + 71) * .065;
    girth[i] = 1 + amount * (noise(distance * .72 + 3, seed + 83) * .18
      + noise(distance * 1.83 + 17, seed + 97) * .085
      + noise(distance * 4.1 + 31, seed + 109) * .03);
    const base = i * stride;
    for (let j = 0; j < sides; j++) {
      const angle = j / sides * Math.PI * 2 - Math.PI / 2;
      const relative = angle - twist;
      const profile = 1 + amount * (oval * Math.cos(relative * 2)
        + lobe * Math.cos(relative * 3 + noise(distance * .51, seed + 127))
        + .035 * Math.cos(relative * 5 + noise(distance * 1.3 + 2, seed + 149)));
      x[base + j] = profile * Math.cos(angle) + offsetX * amount;
      y[base + j] = profile * Math.sin(angle) + offsetY * amount;
    }
    x[base + sides] = x[base];
    y[base + sides] = y[base];
    let circumference = 0;
    for (let j = 1; j <= sides; j++) {
      circumference += Math.hypot(x[base + j] - x[base + j - 1], y[base + j] - y[base + j - 1]);
      u[base + j] = circumference;
    }
    perimeter[i] = circumference;
    for (let j = 1; j <= sides; j++) u[base + j] /= circumference;
    u[base + sides] = 1;
  }
  return { x, y, u, girth, perimeter };
}
