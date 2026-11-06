export function cube() {
  const faces = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const positions = [], normals = [], indices = [];
  faces.forEach(({ n, u, v }, f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...[0, 1, 2].map((k) => 0.5 * (n[k] + a * u[k] + b * v[k])));
      normals.push(...n);
    }
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, indices };
}

export function sphere(rows = 24, cols = 36) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i <= rows; i++) {
    const th = (i / rows) * Math.PI;
    for (let j = 0; j <= cols; j++) {
      const ph = (j / cols) * Math.PI * 2;
      const p = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      positions.push(...p.map((x) => x * 0.5));
      normals.push(...p);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + cols + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions, normals, indices };
}

export function cylinder(slices = 32) {
  const positions = [], normals = [], indices = [];
  for (let j = 0; j <= slices; j++) {
    const a = (j / slices) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    positions.push(0.5 * c, -0.5, 0.5 * s, 0.5 * c, 0.5, 0.5 * s);
    normals.push(c, 0, s, c, 0, s);
  }
  for (let j = 0; j < slices; j++) {
    const a = 2 * j;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (const y of [-0.5, 0.5]) {
    const centre = positions.length / 3;
    positions.push(0, y, 0); normals.push(0, Math.sign(y), 0);
    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * Math.PI * 2;
      positions.push(0.5 * Math.cos(a), y, 0.5 * Math.sin(a));
      normals.push(0, Math.sign(y), 0);
    }
    for (let j = 0; j < slices; j++) indices.push(centre, centre + 1 + j, centre + 2 + j);
  }
  return { positions, normals, indices };
}

export function arrow() {
  const positions = [], normals = [], indices = [];
  const tip = [1, 0, 0], back = [-0.6, 0, 0];
  const ring = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([-0.2, 0.42 * Math.cos(a), 0.18 * Math.sin(a)]);
  }
  const tri = (a, b, c) => {
    const e1 = b.map((x, k) => x - a[k]), e2 = c.map((x, k) => x - a[k]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...nn) || 1;
    const o = positions.length / 3;
    for (const p of [a, b, c]) { positions.push(...p); normals.push(...nn.map((x) => x / l)); }
    indices.push(o, o + 1, o + 2);
  };
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    tri(tip, b, a);
    tri(back, a, b);
  }
  return { positions, normals, indices };
}
