import * as v3 from './vec3.js';

// column major, index = col*4 + row (same as wgsl)

export function identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function fromValues(...values) {
  return new Float32Array(values);
}

export function clone(m) {
  return new Float32Array(m);
}

export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function multiplyAll(...ms) {
  return ms.reduce((acc, m) => multiply(acc, m));
}

export function translation(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scaling(x, y = x, z = x) {
  const m = identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function rotationX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return fromValues(1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1);
}

export function rotationY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return fromValues(c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1);
}

export function rotationZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return fromValues(c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
}

export function rotationAxis(axis, a) {
  if (axis === 'x') return rotationX(a);
  if (axis === 'z') return rotationZ(a);
  return rotationY(a);
}

export function transpose(m) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[r * 4 + c] = m[c * 4 + r];
  return o;
}

// only for rotation + translation: inverse is [R^T, -R^T t]
export function invertRigid(m) {
  const o = identity();
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 4 + r] = m[r * 4 + c];
  const tx = m[12], ty = m[13], tz = m[14];
  for (let r = 0; r < 3; r++) {
    o[12 + r] = -(m[r * 4 + 0] * tx + m[r * 4 + 1] * ty + m[r * 4 + 2] * tz);
  }
  return o;
}

// gauss jordan, needed for picking and the frustum
export function invert(m) {
  const a = [];
  for (let r = 0; r < 4; r++) {
    const row = [];
    for (let c = 0; c < 4; c++) row.push(m[c * 4 + r]);
    for (let c = 0; c < 4; c++) row.push(r === c ? 1 : 0);
    a.push(row);
  }
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let r = col + 1; r < 4; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    for (let c = 0; c < 8; c++) a[col][c] /= p;
    for (let r = 0; r < 4; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f !== 0) for (let c = 0; c < 8; c++) a[r][c] -= f * a[col][c];
    }
  }
  const o = new Float32Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = a[r][c + 4];
  return o;
}

export function normalMatrix(m) {
  const inv = invert(m);
  return inv ? transpose(inv) : identity();
}

// w points backwards, camera looks down -w
export function lookAt(eye, target, up = [0, 1, 0]) {
  let w = v3.sub(eye, target);
  if (v3.length(w) < 1e-9) w = [0, 0, 1];
  w = v3.normalize(w);
  let u = v3.cross(up, w);
  // up parallel to view dir -> cross is 0, pick another axis
  if (v3.length(u) < 1e-6) {
    const helper = Math.abs(w[2]) < 0.9 ? [0, 0, -1] : [0, 1, 0];
    u = v3.cross(helper, w);
  }
  u = v3.normalize(u);
  const v = v3.cross(w, u);
  return fromValues(
    u[0], v[0], w[0], 0,
    u[1], v[1], w[1], 0,
    u[2], v[2], w[2], 0,
    -v3.dot(u, eye), -v3.dot(v, eye), -v3.dot(w, eye), 1,
  );
}

// depth -near -> 0, -far -> 1 (webgpu, not opengl)
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return fromValues(
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, near * far * nf, 0,
  );
}

export function orthographic(left, right, bottom, top, near, far) {
  const nf = 1 / (near - far);
  return fromValues(
    2 / (right - left), 0, 0, 0,
    0, 2 / (top - bottom), 0, 0,
    0, 0, nf, 0,
    -(right + left) / (right - left), -(top + bottom) / (top - bottom), near * nf, 1,
  );
}

export function transformPoint4(m, p) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

export function transformPoint(m, p) {
  const q = transformPoint4(m, p);
  return [q[0] / q[3], q[1] / q[3], q[2] / q[3]];
}

export function transformDirection(m, d) {
  return [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
}

export const getTranslation = (m) => [m[12], m[13], m[14]];

export function fromBasis(x, y, z, origin) {
  return fromValues(x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1);
}

export function equals(a, b, eps = 1e-5) {
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > eps) return false;
  return true;
}

export function format(m, digits = 2) {
  const rows = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let c = 0; c < 4; c++) {
      let v = m[c * 4 + r];
      if (Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
      cells.push(v.toFixed(digits).padStart(digits + 5));
    }
    rows.push(cells.join(''));
  }
  return rows.join('\n');
}
