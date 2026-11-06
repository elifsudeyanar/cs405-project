import * as m4 from '../math/mat4.js';
import * as q from '../math/quat.js';
import * as v3 from '../math/vec3.js';

const smooth = (t) => t * t * (3 - 2 * t);

export class OrbitCamera {
  constructor(opts) {
    this.defaults = { ...opts };
    this.reset();
  }

  reset() {
    const d = this.defaults;
    this.yaw = d.yaw; this.pitch = d.pitch; this.distance = d.distance;
    this.target = d.target.slice();
    this.fovDeg = d.fovDeg; this.near = d.near; this.far = d.far;
    this.perspective = true;
    this.up = [0, 1, 0];
    this.transition = null;
    this.orientation = this.orientationFromAngles(this.yaw, this.pitch);
  }

  orientationFromAngles(yaw, pitch) {
    return q.normalize(q.multiply(q.fromAxisAngle([0, 1, 0], yaw), q.fromAxisAngle([1, 0, 0], -pitch)));
  }

  orbit(dYaw, dPitch) {
    this.transition = null;
    this.yaw += dYaw;
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + dPitch));
    this.orientation = this.orientationFromAngles(this.yaw, this.pitch);
  }

  zoom(factor) {
    this.distance = Math.max(0.4, Math.min(30, this.distance * factor));
  }

  get eye() {
    return v3.add(this.target, q.rotate(this.orientation, [0, 0, this.distance]));
  }

  viewMatrix() {
    return m4.lookAt(this.eye, this.target, this.up);
  }

  projectionMatrix(aspect) {
    const fov = (this.fovDeg * Math.PI) / 180;
    if (this.perspective) return m4.perspective(fov, aspect, this.near, this.far);
    const h = this.distance * Math.tan(fov / 2);
    return m4.orthographic(-h * aspect, h * aspect, -h, h, this.near, this.far);
  }

  snapshot() {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance, target: this.target.slice() };
  }

  // bonus: slerp between saved views
  goTo(view, duration = 0.9) {
    this.transition = {
      from: { orientation: this.orientation, distance: this.distance, target: this.target.slice() },
      to: { ...view, orientation: this.orientationFromAngles(view.yaw, view.pitch) },
      t: 0, duration,
    };
  }

  tick(dt) {
    const tr = this.transition;
    if (!tr) return;
    tr.t = Math.min(1, tr.t + dt / tr.duration);
    const s = smooth(tr.t);
    this.orientation = q.slerp(tr.from.orientation, tr.to.orientation, s);
    this.distance = tr.from.distance + (tr.to.distance - tr.from.distance) * s;
    this.target = v3.lerp(tr.from.target, tr.to.target, s);
    if (tr.t >= 1) {
      this.yaw = tr.to.yaw; this.pitch = tr.to.pitch;
      this.orientation = tr.to.orientation;
      this.transition = null;
    }
  }
}
