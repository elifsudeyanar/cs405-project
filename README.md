# CS405 Project 1

Painting: Şeker Ahmed Paşa - Kavunlu Natürmort

## How to run

```
npm install
npm run dev
```

then open the localhost link in a current Chrome, Edge, Safari or Firefox. `npm test` runs the math tests.

## Files

- `src/math` - mat4, vec3, quaternion
- `src/curves` - bezier, catmull-rom, least squares fit, surface of revolution
- `src/scene` - scene graph node, the scene, camera, curve stuff
- `src/render` - webgpu renderer and shaders
- `src/ui` - gui, mouse input, info panel
- `curve.json` - exported curve

## Controls

Mouse:
- drag: orbit camera
- wheel: zoom
- drag the points on the painting: move curve points, diamonds are knots and squares are handles
- shift + drag on the painting: draw a stroke, a bezier gets fitted to it

Keys:
- 1 2 3 4: front / painting / table / top view
- V: change view, main / split / inspection
- R: reset
- space: pause

GUI panel on the right:
- View: which camera, saved views, reset
- A: switch between T*R*S and S*R*T, sliders for translate / rotate / scale. matrices are shown on the left panel
- B: animation speed, show node axes
- C: perspective or ortho, fov, near, far, show frustum
- D: bezier / catmull-rom / both, t slider, animate, de casteljau, export json
- Bonus: surface of revolution, compute shader ribbon
- Debug: grid, info panel

Left panel shows frame time, vertex count, draw calls and the matrices.

## Notes

- matrices are column major, M = T*R*S everywhere
- depth goes to [0, 1] since it is webgpu
- the second camera in split view is fixed and draws the frustum of the main camera
- bonus parts: least squares fit, surface of revolution, quaternion camera, compute shader ribbon
