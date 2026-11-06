import { bernstein, bezierPoint, bezierTangent, bezierSecond } from './bezier.js';

const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

export function chordLengthParams(samples) {
  const d = [0];
  for (let i = 1; i < samples.length; i++) d.push(d[i - 1] + dist(samples[i], samples[i - 1]));
  const total = d[d.length - 1] || 1;
  return d.map((x) => x / total);
}

// P0 and P3 fixed, solve the 2x2 normal equations for P1 P2
function solveHandles(samples, ts, P0, P3) {
  let a11 = 0, a12 = 0, a22 = 0;
  const r1 = P0.map(() => 0), r2 = P0.map(() => 0);
  samples.forEach((s, i) => {
    const [b0, b1, b2, b3] = bernstein(ts[i]);
    a11 += b1 * b1; a12 += b1 * b2; a22 += b2 * b2;
    for (let k = 0; k < s.length; k++) {
      const r = s[k] - b0 * P0[k] - b3 * P3[k];
      r1[k] += b1 * r; r2[k] += b2 * r;
    }
  });
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) {
    return [P0.map((x, k) => x + (P3[k] - x) / 3), P0.map((x, k) => x + (2 * (P3[k] - x)) / 3)];
  }
  const P1 = r1.map((x, k) => (a22 * x - a12 * r2[k]) / det);
  const P2 = r2.map((x, k) => (a11 * x - a12 * r1[k]) / det);
  return [P1, P2];
}

// newton step to move each t closer to its sample
function reparameterise(ctrl, samples, ts) {
  return ts.map((t, i) => {
    const d = bezierPoint(...ctrl, t).map((x, k) => x - samples[i][k]);
    const d1 = bezierTangent(...ctrl, t), d2 = bezierSecond(...ctrl, t);
    const num = d.reduce((s, x, k) => s + x * d1[k], 0);
    const den = d1.reduce((s, x, k) => s + x * x + d[k] * d2[k], 0);
    if (Math.abs(den) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - num / den));
  });
}

export function fitCubicBezier(samples, iterations = 20) {
  if (samples.length < 2) return null;
  const P0 = samples[0], P3 = samples[samples.length - 1];
  let ts = chordLengthParams(samples);
  let ctrl = [P0, ...solveHandles(samples, ts, P0, P3), P3];
  for (let it = 0; it < iterations; it++) {
    ts = reparameterise(ctrl, samples, ts);
    ctrl = [P0, ...solveHandles(samples, ts, P0, P3), P3];
  }
  const sq = samples.reduce((s, p, i) => s + dist(bezierPoint(...ctrl, ts[i]), p) ** 2, 0);
  return { control: ctrl, params: ts, rms: Math.sqrt(sq / samples.length) };
}
