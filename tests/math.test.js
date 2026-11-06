import { describe, it, expect } from 'vitest';
import * as m4 from '../src/math/mat4.js';
import * as q from '../src/math/quat.js';
import * as bz from '../src/curves/bezier.js';
import { evalCatmullRom } from '../src/curves/catmullRom.js';
import { fitCubicBezier } from '../src/curves/fit.js';

const close = (a, b, eps = 1e-5) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThan(eps));

describe('mat4 basics', () => {
  it('stores matrices column-major with translation in elements 12..14', () => {
    const T = m4.translation(1, 2, 3);
    expect([T[12], T[13], T[14]]).toEqual([1, 2, 3]);
  });

  it('identity is neutral for multiply', () => {
    const A = m4.multiplyAll(m4.translation(1, 2, 3), m4.rotationY(0.4), m4.scaling(2));
    expect(m4.equals(m4.multiply(A, m4.identity()), A)).toBe(true);
    expect(m4.equals(m4.multiply(m4.identity(), A), A)).toBe(true);
  });

  it('rotations follow the right-hand rule', () => {
    close(m4.transformPoint(m4.rotationZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]);
    close(m4.transformPoint(m4.rotationX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
    close(m4.transformPoint(m4.rotationY(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
  });

  it('T*R*S and S*R*T give different results', () => {
    const T = m4.translation(2, 0, 0), R = m4.rotationY(Math.PI / 2), S = m4.scaling(3);
    const trs = m4.transformPoint(m4.multiplyAll(T, R, S), [0, 0, 0]);
    const srt = m4.transformPoint(m4.multiplyAll(S, R, T), [0, 0, 0]);
    close(trs, [2, 0, 0]);
    close(srt, [0, 0, -6]);
  });

  it('transpose twice gives the original', () => {
    const A = m4.multiply(m4.rotationX(0.3), m4.translation(4, 5, 6));
    expect(m4.equals(m4.transpose(m4.transpose(A)), A)).toBe(true);
  });

  it('invertRigid undoes a rotation plus translation', () => {
    const A = m4.multiplyAll(m4.translation(1, -2, 3), m4.rotationY(0.7), m4.rotationX(-0.3));
    expect(m4.equals(m4.multiply(m4.invertRigid(A), A), m4.identity())).toBe(true);
    expect(m4.equals(m4.multiply(A, m4.invertRigid(A)), m4.identity())).toBe(true);
  });

  it('general invert works for non-rigid and projective matrices', () => {
    const A = m4.multiplyAll(m4.perspective(1, 1.5, 0.1, 50), m4.translation(1, 2, -3), m4.scaling(2, 3, 0.5));
    expect(m4.equals(m4.multiply(A, m4.invert(A)), m4.identity(), 1e-4)).toBe(true);
  });
});

describe('camera', () => {
  it('lookAt sends the eye to the origin and the target onto -z', () => {
    const eye = [3, 2, 5], target = [0, 1, 0];
    const V = m4.lookAt(eye, target, [0, 1, 0]);
    close(m4.transformPoint(V, eye), [0, 0, 0]);
    const t = m4.transformPoint(V, target);
    close([t[0], t[1]], [0, 0]);
    expect(t[2]).toBeLessThan(0);
  });

  it('lookAt is a rigid transform', () => {
    const V = m4.lookAt([1, 4, 2], [0, 0, 0], [0, 1, 0]);
    expect(m4.equals(m4.multiply(m4.invertRigid(V), V), m4.identity())).toBe(true);
  });

  it('lookAt survives up parallel to the view direction', () => {
    const V = m4.lookAt([0, 5, 0], [0, 0, 0], [0, 1, 0]);
    expect(Array.from(V).every(Number.isFinite)).toBe(true);
    const t = m4.transformPoint(V, [0, 0, 0]);
    close([t[0], t[1], t[2]], [0, 0, -5]);
  });

  it('perspective maps near to depth 0 and far to depth 1', () => {
    const P = m4.perspective(Math.PI / 3, 1.6, 0.5, 20);
    expect(m4.transformPoint(P, [0, 0, -0.5])[2]).toBeCloseTo(0, 6);
    expect(m4.transformPoint(P, [0, 0, -20])[2]).toBeCloseTo(1, 6);
  });

  it('orthographic maps near to 0, far to 1 and the box edges to +-1', () => {
    const P = m4.orthographic(-2, 2, -1, 1, 0.5, 20);
    expect(m4.transformPoint(P, [0, 0, -0.5])[2]).toBeCloseTo(0, 6);
    expect(m4.transformPoint(P, [0, 0, -20])[2]).toBeCloseTo(1, 6);
    close(m4.transformPoint(P, [2, 1, -5]).slice(0, 2), [1, 1]);
  });
});

describe('quaternions', () => {
  it('rotate agrees with the matrix form', () => {
    const r = q.fromAxisAngle([0, 1, 0], 0.8);
    close(q.rotate(r, [1, 2, 3]), m4.transformPoint(q.toMat4(r), [1, 2, 3]));
    close(m4.transformPoint(q.toMat4(r), [1, 0, 0]), m4.transformPoint(m4.rotationY(0.8), [1, 0, 0]));
  });

  it('slerp hits both ends and the halfway angle', () => {
    const a = q.fromAxisAngle([0, 1, 0], 0), b = q.fromAxisAngle([0, 1, 0], 1.2);
    close(q.slerp(a, b, 0), a);
    close(q.slerp(a, b, 1), b);
    close(q.slerp(a, b, 0.5), q.fromAxisAngle([0, 1, 0], 0.6));
  });
});

describe('curves', () => {
  const P = [[0, 0], [1, 2], [3, 2], [4, 0]];

  it('Bernstein weights sum to one', () => {
    for (const t of [0, 0.2, 0.5, 0.9, 1]) expect(bz.bernstein(t).reduce((a, b) => a + b)).toBeCloseTo(1, 12);
  });

  it('Bezier starts at P0 and ends at P3', () => {
    close(bz.bezierPoint(...P, 0), P[0]);
    close(bz.bezierPoint(...P, 1), P[3]);
  });

  it('de Casteljau agrees with the Bernstein form', () => {
    for (const t of [0.1, 0.37, 0.8]) {
      const levels = bz.deCasteljau(P, t);
      close(levels[3][0], bz.bezierPoint(...P, t));
    }
  });

  it('enforceC1 makes the joints C1', () => {
    const pts = [[0, 0], [1, 1], [2, 1], [3, 0], [4, 3], [5, 1], [6, 0], [7, 5], [8, 2], [9, 0]];
    expect(bz.c1Error(pts)).toBeGreaterThan(0.1);
    bz.enforceC1(pts);
    expect(bz.c1Error(pts)).toBeLessThan(1e-9);
  });

  it('Catmull-Rom passes through every knot', () => {
    const K = [[0, 0], [1, 2], [3, 1], [4, 4]];
    close(evalCatmullRom(K, 0).point, K[0]);
    close(evalCatmullRom(K, 1 / 3).point, K[1]);
    close(evalCatmullRom(K, 2 / 3).point, K[2]);
    close(evalCatmullRom(K, 1).point, K[3], 1e-6);
  });

  it('least-squares fit recovers a cubic it was sampled from', () => {
    const samples = [];
    for (let i = 0; i <= 40; i++) samples.push(bz.bezierPoint(...P, i / 40));
    const fit = fitCubicBezier(samples, 50);
    expect(fit.rms).toBeLessThan(1e-3);
    close(fit.control[1], P[1], 1e-3);
    close(fit.control[2], P[2], 1e-3);
  });
});
