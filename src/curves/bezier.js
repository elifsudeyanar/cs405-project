const lin = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const comb = (ws, ps) => ps[0].map((_, k) => ws.reduce((s, w, j) => s + w * ps[j][k], 0));

export function bernstein(t) {
  const u = 1 - t;
  return [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
}

export function bezierPoint(p0, p1, p2, p3, t) {
  return comb(bernstein(t), [p0, p1, p2, p3]);
}

export function bezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return p0.map((_, k) =>
    3 * u * u * (p1[k] - p0[k]) + 6 * u * t * (p2[k] - p1[k]) + 3 * t * t * (p3[k] - p2[k]));
}

export function bezierSecond(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return p0.map((_, k) =>
    6 * u * (p2[k] - 2 * p1[k] + p0[k]) + 6 * t * (p3[k] - 2 * p2[k] + p1[k]));
}

export function deCasteljau(points, t) {
  const levels = [points.map((p) => p.slice())];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i + 1 < prev.length; i++) next.push(lin(prev[i], prev[i + 1], t));
    levels.push(next);
  }
  return levels;
}

// piecewise: K H H K H H K ... segment s uses points 3s..3s+3
export const isKnot = (i) => i % 3 === 0;
export const segmentCount = (points) => Math.floor((points.length - 1) / 3);

export function locate(points, T) {
  const n = segmentCount(points);
  const s = Math.min(n - 1e-9, Math.max(0, T) * n);
  const seg = Math.floor(s);
  return { seg, t: s - seg };
}

export function segmentPoints(points, seg) {
  return points.slice(seg * 3, seg * 3 + 4);
}

export function evalPiecewise(points, T) {
  const { seg, t } = locate(points, T);
  const [a, b, c, d] = segmentPoints(points, seg);
  return { point: bezierPoint(a, b, c, d, t), tangent: bezierTangent(a, b, c, d, t), seg, t };
}

export function samplePiecewise(points, count) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(evalPiecewise(points, i / count).point);
  return out;
}

// C1: handle after the knot = 2K - handle before
export function enforceC1(points, movedIndex = -1) {
  for (let k = 3; k < points.length - 1; k += 3) {
    const K = points[k], before = points[k - 1], after = points[k + 1];
    if (movedIndex === k + 1) {
      for (let i = 0; i < K.length; i++) before[i] = 2 * K[i] - after[i];
    } else {
      for (let i = 0; i < K.length; i++) after[i] = 2 * K[i] - before[i];
    }
  }
  return points;
}

export function c1Error(points) {
  let worst = 0;
  for (let s = 0; s + 1 < segmentCount(points); s++) {
    const A = segmentPoints(points, s), B = segmentPoints(points, s + 1);
    const dIn = bezierTangent(...A, 1), dOut = bezierTangent(...B, 0);
    worst = Math.max(worst, Math.hypot(...dIn.map((x, i) => x - dOut[i])));
  }
  return worst;
}
