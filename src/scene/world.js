import * as m4 from '../math/mat4.js';
import { Node } from './node.js';

export const PAINTING = {
  artist: 'Seker Ahmed Pasa',
  title: 'Kavunlu Naturmort',
  center: [0, 1.6, -2],
  width: 3.0,
  height: 3.0 * 502 / 720,
};

export function srgb(hex, a = 1) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return [...c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)), a];
}

export function buildWorld(meshes) {
  const T = m4.translation, S = m4.scaling;
  const root = new Node('root');

  root.add(new Node('wall', { local: m4.multiply(T(0, 2.5, -2.08), S(12, 5, 0.1)), mesh: meshes.cube, color: srgb('#3b342d') }));
  root.add(new Node('floor', { local: m4.multiply(T(0, -0.02, 0.5), S(12, 0.04, 9)), mesh: meshes.cube, color: srgb('#4d453b') }));

  const painting = root.add(new Node('painting', {
    local: m4.multiply(T(...PAINTING.center), S(PAINTING.width, PAINTING.height, 1)),
    mesh: meshes.quad,
  }));
  painting.textured = true;
  const fw = PAINTING.width, fh = PAINTING.height, [cx, cy, cz] = PAINTING.center, b = 0.08;
  const frame = root.add(new Node('frame'));
  const wood = srgb('#5c3d1e');
  frame.add(new Node('frameTop', { local: m4.multiply(T(cx, cy + fh / 2 + b / 2, cz), S(fw + 2 * b, b, 0.06)), mesh: meshes.cube, color: wood }));
  frame.add(new Node('frameBottom', { local: m4.multiply(T(cx, cy - fh / 2 - b / 2, cz), S(fw + 2 * b, b, 0.06)), mesh: meshes.cube, color: wood }));
  frame.add(new Node('frameLeft', { local: m4.multiply(T(cx - fw / 2 - b / 2, cy, cz), S(b, fh, 0.06)), mesh: meshes.cube, color: wood }));
  frame.add(new Node('frameRight', { local: m4.multiply(T(cx + fw / 2 + b / 2, cy, cz), S(b, fh, 0.06)), mesh: meshes.cube, color: wood }));

  const table = root.add(new Node('table', { local: T(0, 0, -0.7) }));
  table.add(new Node('tableTop', { local: m4.multiply(T(0, 0.8, 0), S(2.6, 0.06, 1.1)), mesh: meshes.cube, color: srgb('#9a9486') }));
  for (const [x, z] of [[-1.2, -0.45], [1.2, -0.45], [-1.2, 0.45], [1.2, 0.45]]) {
    table.add(new Node('leg', { local: m4.multiply(T(x, 0.385, z), S(0.07, 0.77, 0.07)), mesh: meshes.cube, color: srgb('#6e675c') }));
  }

  const melon = root.add(new Node('melon'));
  melon.add(new Node('melonShape', { local: S(1.4, 0.9, 0.9), mesh: meshes.sphere, color: srgb('#e0ab3c') }));
  root.add(new Node('crate', {
    local: m4.multiplyAll(T(-0.2, 0.92, -0.35), m4.rotationY(0.5), S(0.3, 0.18, 0.22)),
    mesh: meshes.cube, color: srgb('#8a5a2b'),
  }));
  root.add(new Node('jug', {
    local: m4.multiplyAll(T(0.95, 1.0, -0.55), m4.rotationY(0), S(0.2, 0.34, 0.2)),
    mesh: meshes.cylinder, color: srgb('#4f6f8f'),
  }));
  root.add(new Node('vase', { local: T(-0.85, 0.83, -0.6), color: srgb('#8fae5a') }));

  const mobile = root.add(new Node('mobile', { local: T(0, 2.95, -0.75) }));
  mobile.add(new Node('hookString', { local: m4.multiply(T(0, -0.15, 0), S(0.01, 0.3, 0.01)), mesh: meshes.cylinder, color: srgb('#ddd8cc') }));
  const crossbar = mobile.add(new Node('crossbar'));
  crossbar.add(new Node('bar', { local: m4.multiply(T(0, -0.3, 0), S(1.3, 0.035, 0.035)), mesh: meshes.cube, color: srgb('#a0703a') }));
  const fruitColors = { L: srgb('#d9822b'), R: srgb('#7a9a3a') };
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const arm = crossbar.add(new Node('arm' + side, { local: T(sign * 0.6, -0.3, 0) }));
    arm.add(new Node('string' + side, { local: m4.multiply(T(0, -0.27, 0), S(0.008, 0.54, 0.008)), mesh: meshes.cylinder, color: srgb('#ddd8cc') }));
    const fruit = arm.add(new Node('fruit' + side, { local: T(0, -0.62, 0) }));
    fruit.add(new Node('fruitShape' + side, { local: S(0.18, 0.16, 0.18), mesh: meshes.sphere, color: fruitColors[side] }));
    fruit.add(new Node('stem' + side, { local: m4.multiply(T(0, 0.09, 0), S(0.015, 0.05, 0.015)), mesh: meshes.cylinder, color: srgb('#4a3520') }));
  }

  return root;
}

export const mobilePose = (time) => ({ spin: 0.6 * time, swing: 0.35 * Math.sin(1.7 * time) });

export function animateMobile(root, getTime) {
  const crossbar = root.find('crossbar');
  crossbar.update = (n) => { n.local = m4.rotationY(mobilePose(getTime()).spin); };
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    root.find('arm' + side).update = (n) => {
      n.local = m4.multiply(m4.translation(sign * 0.6, -0.3, 0), m4.rotationZ(sign * mobilePose(getTime()).swing));
    };
  }
}
