function neighbours(knots, i) {
  const last = knots.length - 1;
  return [knots[Math.max(0, i - 1)], knots[i], knots[Math.min(last, i + 1)], knots[Math.min(last, i + 2)]];
}

export function catmullRomSegment(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return b.map((_, k) => 0.5 * (
    2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3));
}

export function catmullRomTangent(a, b, c, d, t) {
  const t2 = t * t;
  return b.map((_, k) => 0.5 * (
    (-a[k] + c[k]) + 2 * (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t + 3 * (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t2));
}

export function evalCatmullRom(knots, T) {
  const n = knots.length - 1;
  const s = Math.min(n - 1e-9, Math.max(0, T) * n);
  const i = Math.floor(s), t = s - i;
  const [a, b, c, d] = neighbours(knots, i);
  return { point: catmullRomSegment(a, b, c, d, t), tangent: catmullRomTangent(a, b, c, d, t), seg: i, t };
}

export function sampleCatmullRom(knots, count) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(evalCatmullRom(knots, i / count).point);
  return out;
}
