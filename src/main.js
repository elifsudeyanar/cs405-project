import * as m4 from './math/mat4.js';
import * as v3 from './math/vec3.js';
import { Renderer } from './render/renderer.js';
import { cube, sphere, cylinder, arrow } from './scene/meshes.js';
import { buildWorld, animateMobile, PAINTING, srgb } from './scene/world.js';
import { OrbitCamera } from './scene/camera.js';
import { CurveLayer } from './scene/curveLayer.js';
import { surfaceOfRevolution, profileFromCurve } from './curves/revolve.js';
import { samplePiecewise, c1Error } from './curves/bezier.js';
import { InfoPanel, pre, fmtVec } from './ui/panel.js';
import { buildControls } from './ui/controls.js';
import { attachInput } from './ui/input.js';

const DEFAULT_PART_A = { order: 'TRS', tx: 0.45, ty: 1.0, tz: -0.42, axis: 'y', angle: 0.6, scale: 0.3 };

async function main() {
  const canvas = document.getElementById('gpu');
  const renderer = await Renderer.create(canvas);
  const texture = await renderer.loadTexture(import.meta.env.BASE_URL + 'kavunlu.jpg');

  const meshes = {
    cube: renderer.createMesh(cube()),
    sphere: renderer.createMesh(sphere()),
    cylinder: renderer.createMesh(cylinder()),
    arrow: renderer.createMesh(arrow()),
    quad: renderer.createQuad(),
  };

  const state = {
    view: 'split',
    animate: true,
    timeScale: 1,
    time: 0,
    leaf: 'fruitL',
    partA: { ...DEFAULT_PART_A },
    debug: { axes: false, grid: true, frustum: true, panel: true },
    bonus: { vase: true, ribbon: true, ribbonHeight: 0.04 },
  };

  const root = buildWorld(meshes);
  animateMobile(root, () => state.time);
  root.updateWorld(0);

  const camera = new OrbitCamera({ yaw: 0.35, pitch: 0.18, distance: 4.6, target: [0, 1.35, -0.9], fovDeg: 50, near: 0.1, far: 8 });
  const inspection = { eye: [9.5, 7.5, 9.0], target: [0, 1.0, -0.2], fovDeg: 50, near: 0.1, far: 80 };
  const curve = new CurveLayer(root.find('painting'));

  const app = {
    canvas, renderer, state, camera, curve, root,
    mainViewProj: m4.identity(),
    ribbonDirty: true,
    bookmarks: {
      front: { yaw: 0.35, pitch: 0.18, distance: 4.6, target: [0, 1.35, -0.9] },
      painting: { yaw: 0, pitch: 0, distance: 2.6, target: [0, 1.6, -2] },
      table: { yaw: -0.9, pitch: 0.45, distance: 3.0, target: [0, 0.95, -0.6] },
      top: { yaw: 0, pitch: Math.PI / 2, distance: 5.5, target: [0, 0.8, -0.8] },
    },
    reset() {
      Object.assign(state.partA, DEFAULT_PART_A);
      Object.assign(state, { animate: true, timeScale: 1, time: 0 });
      camera.reset();
      curve.reset();
      curve.version++;
      this.ribbonDirty = true;
    },
    mainRect() {
      if (state.view === 'split') return [0, 0, 0.5, 1];
      return [0, 0, 1, 1];
    },
    exportCurve() {
      const json = JSON.stringify(curve.toJSON({ artist: PAINTING.artist, title: PAINTING.title }), null, 2);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'curve.json';
      a.click();
    },
  };
  window.app = app;

  const panel = new InfoPanel(document.getElementById('info'));
  panel.section('perf', 'E . Performance');
  panel.section('a', 'A . Transformations', false);
  panel.section('b', 'B . Scene graph', false);
  panel.section('c', 'C . Camera', false);
  panel.section('d', 'D . Curves', false);
  buildControls(app);
  attachInput(app);

  let vaseMesh = null, vaseVersion = -1, ribbonVersion = -1;
  function refreshCurveGeometry() {
    if (state.bonus.vase && vaseVersion !== curve.version) {
      if (vaseMesh) vaseMesh.destroy();
      const profile = profileFromCurve(samplePiecewise(curve.points, 80));
      vaseMesh = renderer.createMesh(surfaceOfRevolution(profile, 48));
      vaseVersion = curve.version;
    }
    if (state.bonus.ribbon && (ribbonVersion !== curve.version || app.ribbonDirty)) {
      renderer.updateRibbon(curve.points.map((p) => curve.toWorld(p, 0.004)), curve.normalWorld(), state.bonus.ribbonHeight);
      ribbonVersion = curve.version;
      app.ribbonDirty = false;
    }
  }

  function partAMatrices() {
    const { tx, ty, tz, axis, angle, scale } = state.partA;
    const T = m4.translation(tx, ty, tz), R = m4.rotationAxis(axis, angle), S = m4.scaling(scale);
    return { TRS: m4.multiplyAll(T, R, S), SRT: m4.multiplyAll(S, R, T) };
  }

  function drawAxes(M, len = 0.22) {
    const o = m4.transformPoint(M, [0, 0, 0]);
    const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((d) => v3.scale(v3.normalize(m4.transformDirection(M, d)), len));
    renderer.line(o, v3.add(o, dirs[0]), [0.95, 0.2, 0.2, 1]);
    renderer.line(o, v3.add(o, dirs[1]), [0.2, 0.9, 0.3, 1]);
    renderer.line(o, v3.add(o, dirs[2]), [0.25, 0.5, 1, 1]);
  }

  // unproject the 8 ndc corners with inverse(P*V)
  function drawFrustum(VP, eye, target) {
    const inv = m4.invert(VP);
    if (!inv) return;
    const corner = (x, y, z) => m4.transformPoint(inv, [x, y, z]);
    const n = [corner(-1, -1, 0), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0)];
    const f = [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)];
    const col = [1, 0.45, 0.2, 1];
    renderer.polyline(n, col, 1, true);
    renderer.polyline(f, col, 1, true);
    for (let i = 0; i < 4; i++) renderer.line(n[i], f[i], [1, 0.45, 0.2, 0.6], 1);
    renderer.line(n[2], n[3], [1, 1, 0.3, 1], 1);
    renderer.line(eye, target, [0.8, 0.8, 0.8, 0.8], 1);
    const s = 0.06;
    for (const d of [[s, 0, 0], [0, s, 0], [0, 0, s]]) renderer.line(v3.sub(eye, d), v3.add(eye, d), [1, 1, 1, 1], 1);
  }

  function drawGrid() {
    const c = [0.35, 0.33, 0.3, 0.55];
    for (let i = -6; i <= 6; i++) {
      renderer.line([i * 0.5, 0.002, -2], [i * 0.5, 0.002, 4], c);
      renderer.line([-3, 0.002, -2 + (i + 6) * 0.5], [3, 0.002, -2 + (i + 6) * 0.5], c);
    }
  }

  let lastTime = performance.now(), frameMs = 16, cpuMs = 0, lastPanel = 0;
  let fpsFrames = 0, fpsStart = performance.now(), fps = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    frameMs += ((now - lastTime) - frameMs) * 0.08;
    lastTime = now;
    fpsFrames++;
    if (now - fpsStart > 500) { fps = (fpsFrames * 1000) / (now - fpsStart); fpsFrames = 0; fpsStart = now; }
    const cpuStart = performance.now();

    camera.tick(dt);
    if (state.animate) state.time += dt * state.timeScale;
    if (curve.animate) curve.t = (curve.t + dt * curve.speed) % 1;

    // part A object
    const A = partAMatrices();
    root.find('melon').local = A[state.partA.order];
    root.updateWorld(state.time);

    renderer.resize();
    const W = renderer.width, H = renderer.height;
    const rect = app.mainRect();
    const mainAspect = (rect[2] * W) / (rect[3] * H);
    const V = camera.viewMatrix(), P = camera.projectionMatrix(mainAspect);
    const VP = m4.multiply(P, V);
    app.mainViewProj = VP;
    const inspRect = state.view === 'split' ? [0.5, 0, 0.5, 1] : [0, 0, 1, 1];
    const inspV = m4.lookAt(inspection.eye, inspection.target, [0, 1, 0]);
    const inspP = m4.perspective((inspection.fovDeg * Math.PI) / 180, (inspRect[2] * W) / (inspRect[3] * H), inspection.near, inspection.far);
    const views = [];
    if (state.view !== 'inspect') views.push({ rect, viewProj: VP, eye: camera.eye, overlays: false });
    if (state.view !== 'main') views.push({ rect: inspRect, viewProj: m4.multiply(inspP, inspV), eye: inspection.eye, overlays: true });

    refreshCurveGeometry();
    renderer.beginFrame();
    root.traverse((n) => {
      if (!n.visible) return;
      if (n.textured) renderer.drawTextured(n.mesh, n.world, texture.bindGroup);
      else if (n.mesh) renderer.drawMesh(n.mesh, n.world, n.color, { unlit: n.unlit });
    });
    if (state.bonus.vase && vaseMesh) renderer.drawMesh(vaseMesh, root.find('vase').world, root.find('vase').color);
    if (state.bonus.ribbon) renderer.drawMesh(renderer.ribbonMesh, m4.identity(), srgb('#ffcc33'));
    renderer.drawMesh(meshes.arrow, curve.riderMatrix(), srgb('#e8452c'));
    curve.draw(renderer);
    if (state.debug.grid) drawGrid();
    if (state.debug.axes) {
      drawAxes(m4.identity(), 0.5);
      // local axes of every node in the tree
      root.traverse((n) => {
        if (n !== root) drawAxes(n.world, n.name === 'painting' ? 0.3 : 0.22);
      });
    }
    if (state.debug.frustum) drawFrustum(VP, camera.eye, camera.target);

    renderer.render(views, { drawRibbon: state.bonus.ribbon });
    cpuMs += ((performance.now() - cpuStart) - cpuMs) * 0.08;

    if (now - lastPanel > 120) {
      lastPanel = now;
      updatePanel({ A, V, P, W, H });
      updateLabels();
    }
    requestAnimationFrame(frame);
  }

  function updatePanel({ A, V, P, W, H }) {
    const s = renderer.stats;
    panel.set('perf', pre(
      `frame time  ${frameMs.toFixed(2)} ms   ${fps.toFixed(0)} fps\n` +
      `cpu build   ${cpuMs.toFixed(2)} ms\n` +
      `vertices    ${s.vertices.toLocaleString()} per frame\n` +
      `draw calls  ${s.drawCalls}\n` +
      `canvas      ${W} x ${H}, 4x MSAA\n` +
      `gpu         ${renderer.gpuName}` +
      (renderer.gammaInShader ? '\nsRGB        encoded in shader' : '\nsRGB        hardware view')));

    const { order } = state.partA;
    panel.set('a',
      `<div class="pair"><div><span class="tag ${order === 'TRS' ? 'on' : 'muted'}">M = T*R*S${order === 'TRS' ? ' active' : ''}</span>${pre(m4.format(A.TRS))}</div>` +
      `<div><span class="tag ${order === 'SRT' ? 'on' : 'muted'}">M = S*R*T${order === 'SRT' ? ' active' : ''}</span>${pre(m4.format(A.SRT))}</div></div>` +
      `<span class="tag">The rest of the code uses T*R*S: scale, then rotate, then place.</span>`);

    const leaf = root.find(state.leaf);
    const chain = leaf.path().slice(1).map((n) => n.name).join(' * ');
    let tree = '';
    root.find('mobile').traverse((n, d) => { tree += '  '.repeat(d) + (d ? '- ' : '') + n.name + (n.mesh ? '' : ' *') + '\n'; });
    panel.set('b', pre(
      `${tree}* transform-only node\n\nworld(${state.leaf}) = ${chain}\n${m4.format(leaf.world, 3)}\n` +
      `position ${fmtVec(m4.getTranslation(leaf.world), 3)}\ntime ${state.time.toFixed(2)} s`));

    const eye = camera.eye;
    const w = v3.normalize(v3.sub(eye, camera.target));
    const degenerate = v3.length(v3.cross(camera.up, w)) < 1e-6;
    panel.set('c', pre(
      `projection ${camera.perspective ? 'perspective' : 'orthographic'}\n` +
      `eye    ${fmtVec(eye)}\ntarget ${fmtVec(camera.target)}\nup     ${fmtVec(camera.up)}${degenerate ? '  parallel, fallback used' : ''}\n` +
      `fov ${camera.fovDeg.toFixed(0)} deg  near ${camera.near.toFixed(2)}  far ${camera.far.toFixed(1)}  far/near ${(camera.far / camera.near).toFixed(0)}\n\n` +
      `V = lookAt(eye, target, up)\n${m4.format(V)}\n\nP\n${m4.format(P, 3)}`));

    const e = curve.evaluate(curve.t);
    panel.set('d', pre(
      `curve      ${curve.mode === 'catmull' ? 'Catmull-Rom' : curve.mode === 'both' ? 'Bezier + Catmull-Rom' : 'piecewise cubic Bezier'}\n` +
      `segments   ${(curve.points.length - 1) / 3}\n` +
      `t          ${curve.t.toFixed(3)}  segment ${e.seg}  local ${e.t.toFixed(3)}\n` +
      `C(t)       ${fmtVec(e.point, 4)}\n` +
      `C1 error   ${c1Error(curve.points).toExponential(1)}\n` +
      (curve.fit ? `fit rms    ${curve.fit.rms.toExponential(2)} over ${curve.sketch.length} samples\n` : 'shift + drag on the painting to sketch\n') +
      `drag diamonds = knots, squares = handles`));
  }

  const labels = document.getElementById('viewLabels');
  function updateLabels() {
    const L = [];
    if (state.view === 'main') L.push(['Main camera', 0]);
    if (state.view === 'inspect') L.push(['Inspection camera, fixed', 0]);
    if (state.view === 'split') L.push(['Main camera', 0], ['Inspection camera, fixed', 50]);
    const html = L.map(([t, x]) => `<span style="left:calc(${x}% + ${x ? 10 : 400}px)">${t}</span>`).join('');
    if (labels.__html !== html) { labels.innerHTML = html; labels.__html = html; }
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const box = document.getElementById('error');
  box.hidden = false;
  box.textContent = 'Could not start WebGPU.\n\n' + err.message + '\n\nUse a current Chrome, Edge, Safari or Firefox with WebGPU enabled.';
});
