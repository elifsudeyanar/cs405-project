export function surfaceOfRevolution(profile, slices = 48) {
  const rings = profile.length;
  const positions = [], normals = [], indices = [];
  let sign = 0;
  for (let i = 0; i < rings; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(rings - 1, i + 1)];
    sign += b[1] - a[1];
  }
  const flip = sign < 0 ? -1 : 1;
  for (let i = 0; i < rings; i++) {
    const a = profile[Math.max(0, i - 1)], b = profile[Math.min(rings - 1, i + 1)];
    let nr = (b[1] - a[1]) * flip, ny = -(b[0] - a[0]) * flip;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l; ny /= l;
    const [r, y] = profile[i];
    for (let j = 0; j <= slices; j++) {
      const phi = (j / slices) * Math.PI * 2;
      const c = Math.cos(phi), s = Math.sin(phi);
      positions.push(r * c, y, r * s);
      normals.push(nr * c, ny, nr * s);
    }
  }
  const row = slices + 1;
  for (let i = 0; i + 1 < rings; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, normals, indices };
}

export function profileFromCurve(samples, height = 0.26, radiusScale = 1.5) {
  const u0 = samples[0][0], u1 = samples[samples.length - 1][0];
  const span = Math.abs(u1 - u0) || 1;
  const vBase = Math.min(samples[0][1], samples[samples.length - 1][1]);
  const prof = samples.map(([u, v]) => [
    Math.max(0.004, (v - vBase) * radiusScale * height / span),
    (Math.abs(u - u0) / span) * height,
  ]);
  return [[0, prof[0][1]], ...prof, [0, prof[prof.length - 1][1]]];
}
