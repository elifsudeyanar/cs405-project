import * as m4 from '../math/mat4.js';

const PICK_RADIUS = 14;

export function attachInput(app) {
  const { canvas, camera, curve } = app;
  let mode = null, last = null;

  function locate(e) {
    const r = canvas.getBoundingClientRect();
    const [fx, fy, fw, fh] = app.mainRect();
    const x = e.clientX - r.left - fx * r.width, y = e.clientY - r.top - fy * r.height;
    const w = fw * r.width, h = fh * r.height;
    return { x, y, w, h, inside: x >= 0 && y >= 0 && x <= w && y <= h, ndc: [(x / w) * 2 - 1, 1 - (y / h) * 2] };
  }

  function rayUV(p) {
    const inv = m4.invert(app.mainViewProj);
    if (!inv) return null;
    const a = m4.transformPoint(inv, [p.ndc[0], p.ndc[1], 0]);
    const b = m4.transformPoint(inv, [p.ndc[0], p.ndc[1], 1]);
    return curve.pick(a, b);
  }

  function nearestControlPoint(p) {
    let best = -1, bestD = PICK_RADIUS;
    curve.points.forEach((q, i) => {
      if (curve.mode === 'catmull' && i % 3 !== 0) return;
      const c = m4.transformPoint4(app.mainViewProj, curve.toWorld(q));
      if (c[3] <= 0) return;
      const sx = (c[0] / c[3] * 0.5 + 0.5) * p.w, sy = (0.5 - c[1] / c[3] * 0.5) * p.h;
      const d = Math.hypot(sx - p.x, sy - p.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = locate(e);
    if (!p.inside || app.state.view === 'inspect') return;
    canvas.setPointerCapture(e.pointerId);
    last = p;
    const hit = nearestControlPoint(p);
    if (hit >= 0) { mode = 'drag'; curve.selected = hit; return; }
    if (e.shiftKey) {
      const uv = rayUV(p);
      if (uv && uv[0] >= 0 && uv[0] <= 1 && uv[1] >= 0 && uv[1] <= 1) { mode = 'sketch'; curve.beginSketch(uv); return; }
    }
    mode = 'orbit';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const p = locate(e);
    if (mode === 'orbit') {
      camera.orbit(-(p.x - last.x) * 0.008, (p.y - last.y) * 0.008);
    } else {
      const uv = rayUV(p);
      if (uv) {
        const clamped = [Math.min(1, Math.max(0, uv[0])), Math.min(1, Math.max(0, uv[1]))];
        if (mode === 'drag') curve.movePoint(curve.selected, clamped);
        else curve.addSketch(clamped);
      }
    }
    last = p;
  });

  const end = () => {
    if (mode === 'sketch') curve.endSketch();
    if (mode === 'drag') curve.selected = -1;
    mode = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom(Math.exp(e.deltaY * 0.001));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const marks = { 1: 'front', 2: 'painting', 3: 'table', 4: 'top' };
    if (marks[e.key]) camera.goTo(app.bookmarks[marks[e.key]]);
    else if (e.key === 'v' || e.key === 'V') {
      const order = ['main', 'split', 'inspect'];
      app.state.view = order[(order.indexOf(app.state.view) + 1) % order.length];
    } else if (e.key === 'r' || e.key === 'R') app.reset();
    else if (e.key === ' ') { app.state.animate = !app.state.animate; e.preventDefault(); }
  });
}
