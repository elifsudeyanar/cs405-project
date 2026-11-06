import * as m4 from '../math/mat4.js';

export class Node {
  constructor(name, { local = m4.identity(), mesh = null, color = [1, 1, 1, 1], unlit = false } = {}) {
    this.name = name;
    this.local = local;
    this.world = m4.identity();
    this.parent = null;
    this.children = [];
    this.mesh = mesh;
    this.color = color;
    this.unlit = unlit;
    this.visible = true;
    this.update = null;
  }

  add(child) {
    if (child.parent) child.parent.remove(child);
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parent = null;
  }

  updateWorld(time, parentWorld = m4.identity()) {
    if (this.update) this.update(this, time);
    // world = parent world * local
    this.world = m4.multiply(parentWorld, this.local);
    for (const c of this.children) c.updateWorld(time, this.world);
  }

  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const c of this.children) c.traverse(fn, depth + 1);
  }

  find(name) {
    let found = null;
    this.traverse((n) => { if (!found && n.name === name) found = n; });
    return found;
  }

  path() {
    const p = [];
    for (let n = this; n; n = n.parent) p.unshift(n);
    return p;
  }
}
