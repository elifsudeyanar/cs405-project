import * as m4 from '../math/mat4.js';
import * as v3 from '../math/vec3.js';
import * as bz from '../curves/bezier.js';
import { evalCatmullRom, sampleCatmullRom } from '../curves/catmullRom.js';
import { fitCubicBezier } from '../curves/fit.js';

// traced the top edge of the melon, knot handle handle knot ...
export const DEFAULT_POINTS = [
  [0.297, 0.7652], [0.3364, 0.8304], [0.4167, 0.8739],
  [0.5076, 0.887], [0.5985, 0.9], [0.6894, 0.8739],
  [0.7652, 0.8217], [0.8409, 0.7696], [0.8818, 0.7],
  [0.8848, 0.613],
];

const LIFT = 0.006;

export class CurveLayer {
  constructor(paintingNode) {
    this.painting = paintingNode;
    this.reset();
  }

  reset() {
    this.points = DEFAULT_POINTS.map((p) => p.slice());
    bz.enforceC1(this.points);
    this.mode = 'bezier';
    this.t = 0.35;
    this.animate = true;
    this.speed = 0.12;
    this.showConstruction = true;
    this.showPolygon = true;
    this.selected = -1;
    this.sketch = null;
    this.fit = null;
    this.version = 0;
  }

  knots() { return this.points.filter((_, i) => bz.isKnot(i)); }

  toWorld([u, v], lift = LIFT) {
    return m4.transformPoint(this.painting.world, [u - 0.5, v - 0.5, lift]);
  }

  dirToWorld([du, dv]) {
    return v3.normalize(m4.transformDirection(this.painting.world, [du, dv, 0]));
  }

  normalWorld() {
    return v3.normalize(m4.transformDirection(m4.normalMatrix(this.painting.world), [0, 0, 1]));
  }

  evaluate(T) {
    return this.mode === 'catmull' ? evalCatmullRom(this.knots(), T) : bz.evalPiecewise(this.points, T);
  }

  pick(rayA, rayB) {
    const inv = m4.invert(this.painting.world);
    const a = m4.transformPoint(inv, rayA), b = m4.transformPoint(inv, rayB);
    const dz = b[2] - a[2];
    if (Math.abs(dz) < 1e-9) return null;
    const s = (LIFT - a[2]) / dz;
    if (s < 0) return null;
    return [a[0] + (b[0] - a[0]) * s + 0.5, a[1] + (b[1] - a[1]) * s + 0.5];
  }

  // when a knot moves its handles move with it
  movePoint(i, uv) {
    const p = this.points[i];
    if (bz.isKnot(i)) {
      const d = [uv[0] - p[0], uv[1] - p[1]];
      for (const j of [i - 1, i + 1]) {
        if (j >= 0 && j < this.points.length) { this.points[j][0] += d[0]; this.points[j][1] += d[1]; }
      }
    }
    p[0] = uv[0]; p[1] = uv[1];
    if (this.mode !== 'catmull') bz.enforceC1(this.points, i);
    this.version++;
  }

  beginSketch(uv) { this.sketch = [uv]; this.fit = null; }
  addSketch(uv) {
    const last = this.sketch[this.sketch.length - 1];
    if (Math.hypot(uv[0] - last[0], uv[1] - last[1]) > 0.004) this.sketch.push(uv);
  }
  endSketch() {
    if (this.sketch && this.sketch.length > 3) this.fit = fitCubicBezier(this.sketch);
  }

  toJSON(meta) {
    return {
      painting: meta,
      coordinates: 'normalised painting coordinates, u to the right and v up, both in [0, 1]',
      type: 'piecewise cubic Bezier',
      segments: bz.segmentCount(this.points),
      continuity: 'C1',
      c1Error: +bz.c1Error(this.points).toExponential(2),
      controlPoints: this.points.map(([u, v], i) => ({ u: +u.toFixed(4), v: +v.toFixed(4), role: bz.isKnot(i) ? 'knot' : 'handle' })),
      catmullRomKnots: this.knots().map(([u, v]) => ({ u: +u.toFixed(4), v: +v.toFixed(4) })),
      leastSquaresFit: this.fit ? {
        control: this.fit.control.map(([u, v]) => ({ u: +u.toFixed(4), v: +v.toFixed(4) })),
        rms: +this.fit.rms.toExponential(3),
      } : null,
    };
  }

  draw(r) {
    const W = (p, lift) => this.toWorld(p, lift);
    const yellow = [1, 0.75, 0.1, 1], cyan = [0.2, 0.8, 1, 1], white = [1, 1, 1, 0.75];
    if (this.mode !== 'catmull') r.polyline(bz.samplePiecewise(this.points, 240).map((p) => W(p)), yellow);
    if (this.mode !== 'bezier') r.polyline(sampleCatmullRom(this.knots(), 240).map((p) => W(p)), cyan);

    if (this.showPolygon && this.mode !== 'catmull') {
      r.polyline(this.points.map((p) => W(p)), white);
    }
    this.points.forEach((p, i) => {
      if (this.mode === 'catmull' && !bz.isKnot(i)) return;
      const s = bz.isKnot(i) ? 0.012 : 0.008;
      const col = i === this.selected ? [1, 0.2, 0.2, 1] : bz.isKnot(i) ? [0.95, 0.35, 0.1, 1] : [1, 1, 1, 1];
      const ring = bz.isKnot(i)
        ? [[p[0] + s, p[1]], [p[0], p[1] + s * 1.43], [p[0] - s, p[1]], [p[0], p[1] - s * 1.43]]
        : [[p[0] - s, p[1] - s * 1.43], [p[0] + s, p[1] - s * 1.43], [p[0] + s, p[1] + s * 1.43], [p[0] - s, p[1] + s * 1.43]];
      r.polyline(ring.map((q) => W(q, LIFT * 2)), col, 0, true);
    });

    if (this.showConstruction && this.mode !== 'catmull') {
      const { seg, t } = bz.locate(this.points, this.t);
      const levels = bz.deCasteljau(bz.segmentPoints(this.points, seg), t);
      const colors = [[0.45, 0.75, 1, 1], [0.5, 0.9, 0.5, 1], [1, 0.45, 0.3, 1]];
      for (let d = 1; d < levels.length; d++) {
        const lv = levels[d];
        if (lv.length > 1) r.polyline(lv.map((p) => W(p, LIFT * 1.5)), colors[d - 1]);
        for (const p of lv) {
          const s = 0.005;
          r.polyline([[p[0] - s, p[1]], [p[0], p[1] + s * 1.43], [p[0] + s, p[1]], [p[0], p[1] - s * 1.43]].map((q) => W(q, LIFT * 1.5)), colors[d - 1], 0, true);
        }
      }
    }

    if (this.sketch) r.polyline(this.sketch.map((p) => W(p)), [1, 0.3, 0.8, 1]);
    if (this.fit) {
      const c = this.fit.control;
      const pts = [];
      for (let i = 0; i <= 80; i++) pts.push(bz.bezierPoint(...c, i / 80));
      r.polyline(pts.map((p) => W(p, LIFT * 1.2)), [0.3, 1, 0.5, 1]);
      r.polyline(c.map((p) => W(p, LIFT * 1.2)), [0.3, 1, 0.5, 0.5]);
    }
  }

  // x = tangent, z = painting normal, y = z cross x
  riderMatrix(size = 0.07) {
    const e = this.evaluate(this.t);
    const x = this.dirToWorld(e.tangent);
    const z = this.normalWorld();
    const y = v3.cross(z, x);
    const origin = v3.add(this.toWorld(e.point), v3.scale(z, 0.03));
    return m4.multiply(m4.fromBasis(x, y, z, origin), m4.scaling(size));
  }
}
