import GUI from 'lil-gui';

export function buildControls(app) {
  const { state, camera, curve } = app;
  const gui = new GUI({ title: 'CS405 Project 1' });

  const view = gui.addFolder('View');
  view.add(state, 'view', { 'Main camera': 'main', 'Inspection camera': 'inspect', 'Split screen': 'split' }).name('view');
  const bookmarks = {
    front: () => camera.goTo(app.bookmarks.front),
    painting: () => camera.goTo(app.bookmarks.painting),
    table: () => camera.goTo(app.bookmarks.table),
    top: () => camera.goTo(app.bookmarks.top),
    reset: () => app.reset(),
  };
  view.add(bookmarks, 'front').name('1 . Front view');
  view.add(bookmarks, 'painting').name('2 . Painting close-up');
  view.add(bookmarks, 'table').name('3 . Table');
  view.add(bookmarks, 'top').name('4 . Top, up parallel to view');
  view.add(bookmarks, 'reset').name('Reset scene');
  view.add(state, 'animate').name('animate scene').listen();

  const a = gui.addFolder('A . Transformations');
  a.add(state.partA, 'order', ['TRS', 'SRT']).name('M = ').listen();
  a.add(state.partA, 'tx', -1.5, 1.5, 0.01).name('translate x').listen();
  a.add(state.partA, 'ty', 0, 2.5, 0.01).name('translate y').listen();
  a.add(state.partA, 'tz', -1.8, 1.0, 0.01).name('translate z').listen();
  a.add(state.partA, 'axis', ['x', 'y', 'z']).name('rotation axis').listen();
  a.add(state.partA, 'angle', -Math.PI, Math.PI, 0.01).name('rotation angle').listen();
  a.add(state.partA, 'scale', 0.05, 1.5, 0.01).name('scale').listen();

  const b = gui.addFolder('B . Scene graph');
  b.add(state, 'timeScale', 0, 3, 0.05).name('animation speed');
  b.add(state.debug, 'axes').name('draw node axes').listen();
  b.add(state, 'leaf', ['fruitL', 'fruitR', 'stemL', 'stemR', 'melonShape']).name('leaf for matrix').listen();

  const c = gui.addFolder('C . Camera and projection');
  c.add(camera, 'perspective').name('perspective, off = ortho').listen();
  c.add(camera, 'fovDeg', 15, 110, 1).name('fov y').listen();
  c.add(camera, 'near', 0.01, 3, 0.01).name('near').listen();
  c.add(camera, 'far', 2, 60, 0.1).name('far').listen();
  c.add(state.debug, 'frustum').name('draw frustum').listen();

  const d = gui.addFolder('D . Curves');
  d.add(curve, 'mode', { 'Bezier, piecewise C1': 'bezier', 'Catmull-Rom': 'catmull', 'Both': 'both' }).name('curve').listen();
  d.add(curve, 't', 0, 1, 0.001).name('parameter t').listen();
  d.add(curve, 'animate').name('animate along curve').listen();
  d.add(curve, 'speed', 0, 0.6, 0.01).name('speed');
  d.add(curve, 'showConstruction').name('de Casteljau').listen();
  d.add(curve, 'showPolygon').name('control polygon').listen();
  d.add({ exportJSON: () => app.exportCurve() }, 'exportJSON').name('Export curve JSON');
  d.add({ resetCurve: () => { curve.reset(); curve.version++; } }, 'resetCurve').name('Reset curve');

  const x = gui.addFolder('Bonus');
  x.add(state.bonus, 'vase').name('surface of revolution').listen();
  x.add(state.bonus, 'ribbon').name('GPU ribbon, compute').listen();
  x.add(state.bonus, 'ribbonHeight', 0.01, 0.2, 0.005).name('ribbon height').onChange(() => { app.ribbonDirty = true; });
  x.add({ clear: () => { curve.sketch = null; curve.fit = null; } }, 'clear').name('Clear sketch and fit');

  const g = gui.addFolder('Debug');
  g.add(state.debug, 'grid').name('floor grid').listen();
  g.add(state.debug, 'panel').name('info panel').onChange((v) => { document.getElementById('info').style.display = v ? '' : 'none'; });

  for (const f of [b, c, x, g]) f.close();
  return gui;
}
