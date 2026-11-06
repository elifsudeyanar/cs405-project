const common = `
override GAMMA_ENCODE: bool = false;

struct Camera {
  viewProj: mat4x4f,
  eye: vec4f,
  lightDir: vec4f,
};

struct Object {
  model: mat4x4f,
  normalMat: mat4x4f,
  color: vec4f,
  params: vec4f,
};

@group(0) @binding(0) var<uniform> cam: Camera;

fn encode(c: vec3f) -> vec3f {
  if (GAMMA_ENCODE) { return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }
  return c;
}
`;

export const litShader = common + `
@group(1) @binding(0) var<uniform> obj: Object;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) normal: vec3f) -> VSOut {
  var o: VSOut;
  let world = obj.model * vec4f(position, 1.0);
  o.pos = cam.viewProj * world;
  o.worldPos = world.xyz;
  o.normal = (obj.normalMat * vec4f(normal, 0.0)).xyz;
  return o;
}

@fragment
fn fs(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  if (obj.params.x > 0.5) { return vec4f(encode(obj.color.rgb), obj.color.a); }
  var n = normalize(in.normal);
  if (!front) { n = -n; }
  let l = normalize(cam.lightDir.xyz);
  let v = normalize(cam.eye.xyz - in.worldPos);
  let h = normalize(l + v);
  let diffuse = max(dot(n, l), 0.0);
  let fill = max(dot(n, normalize(vec3f(-0.5, 0.2, 0.7))), 0.0) * 0.25;
  let spec = pow(max(dot(n, h), 0.0), 40.0) * 0.18;
  let c = obj.color.rgb * (0.24 + 0.85 * diffuse + fill) + vec3f(spec);
  return vec4f(encode(c), obj.color.a);
}
`;

export const textureShader = common + `
@group(1) @binding(0) var<uniform> obj: Object;
@group(2) @binding(0) var samp: sampler;
@group(2) @binding(1) var tex: texture_2d<f32>;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) uv: vec2f) -> VSOut {
  var o: VSOut;
  o.pos = cam.viewProj * obj.model * vec4f(position, 1.0);
  o.uv = uv;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let c = textureSample(tex, samp, in.uv).rgb * obj.color.rgb;
  return vec4f(encode(c), 1.0);
}
`;

export const lineShader = common + `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) position: vec3f, @location(1) color: vec4f) -> VSOut {
  var o: VSOut;
  o.pos = cam.viewProj * vec4f(position, 1.0);
  o.color = color;
  return o;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(encode(in.color.rgb), in.color.a);
}
`;

export const ribbonComputeShader = `
struct Params {
  segCount: u32,
  samples: u32,
  height: f32,
  pad: f32,
  normal: vec4f,
};

@group(0) @binding(0) var<storage, read> ctrl: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outVerts: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

fn writeVertex(index: u32, p: vec3f, n: vec3f) {
  let o = index * 6u;
  outVerts[o + 0u] = p.x; outVerts[o + 1u] = p.y; outVerts[o + 2u] = p.z;
  outVerts[o + 3u] = n.x; outVerts[o + 4u] = n.y; outVerts[o + 5u] = n.z;
}

// bonus: evaluate the bezier on the gpu and write a ribbon
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i > params.samples) { return; }
  let segs = f32(params.segCount);
  let s = min(f32(i) / f32(params.samples) * segs, segs - 1e-4);
  let seg = u32(floor(s));
  let t = s - f32(seg);
  let p0 = ctrl[seg * 3u].xyz;
  let p1 = ctrl[seg * 3u + 1u].xyz;
  let p2 = ctrl[seg * 3u + 2u].xyz;
  let p3 = ctrl[seg * 3u + 3u].xyz;
  let u = 1.0 - t;
  let pos = u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3;
  let d = 3.0 * u * u * (p1 - p0) + 6.0 * u * t * (p2 - p1) + 3.0 * t * t * (p3 - p2);
  let n = params.normal.xyz;
  let side = normalize(cross(normalize(d), n));
  writeVertex(2u * i, pos, side);
  writeVertex(2u * i + 1u, pos + n * params.height, side);
}
`;
