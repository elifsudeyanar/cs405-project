import { litShader, textureShader, lineShader, ribbonComputeShader } from './shaders.js';
import * as m4 from '../math/mat4.js';

const SLOT = 256; // dynamic offsets have to be multiples of 256
const MAX_OBJECTS = 512;
const OBJECT_FLOATS = 40;
const CAMERA_BYTES = 96;
const MAX_VIEWS = 2;
const SAMPLE_COUNT = 4;
const LINE_STRIDE = 7;

export class Renderer {
  static async create(canvas) {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter found.');
    const device = await adapter.requestDevice();
    const r = new Renderer(canvas, adapter, device);
    await r.init();
    return r;
  }

  constructor(canvas, adapter, device) {
    this.canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.context = canvas.getContext('webgpu');
    const info = adapter.info || {};
    this.gpuName = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') || 'unknown GPU';
    this.stats = { vertices: 0, drawCalls: 0 };
  }

  async init() {
    const { device } = this;
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    const srgb = this.canvasFormat + '-srgb';
    device.lost.then((info) => console.error('WebGPU device lost:', info.message));
    let err = null;
    try {
      device.pushErrorScope('validation');
      this.context.configure({ device, format: this.canvasFormat, viewFormats: [srgb], alphaMode: 'opaque' });
      this.context.getCurrentTexture().createView({ format: srgb });
      err = await device.popErrorScope();
    } catch (e) {
      err = e;
    }
    this.gammaInShader = !!err;
    this.targetFormat = err ? this.canvasFormat : srgb;
    if (err) this.context.configure({ device, format: this.canvasFormat, alphaMode: 'opaque' });

    this.cameraLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    this.objectLayout = device.createBindGroupLayout({
      entries: [{
        binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: OBJECT_FLOATS * 4 },
      }],
    });
    this.textureLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });

    this.cameraBuffers = [];
    this.cameraBindGroups = [];
    for (let i = 0; i < MAX_VIEWS; i++) {
      const buf = device.createBuffer({ size: CAMERA_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      this.cameraBuffers.push(buf);
      this.cameraBindGroups.push(device.createBindGroup({ layout: this.cameraLayout, entries: [{ binding: 0, resource: { buffer: buf } }] }));
    }
    this.objectBuffer = device.createBuffer({ size: SLOT * MAX_OBJECTS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.objectStaging = new Float32Array((SLOT / 4) * MAX_OBJECTS);
    this.objectBindGroup = device.createBindGroup({
      layout: this.objectLayout,
      entries: [{ binding: 0, resource: { buffer: this.objectBuffer, size: OBJECT_FLOATS * 4 } }],
    });

    this.createPipelines();
    this.lineCapacity = 0;
    this.ensureLineCapacity(16384);
    this.createRibbon();
  }

  createPipelines() {
    const { device } = this;
    const constants = { GAMMA_ENCODE: this.gammaInShader ? 1 : 0 };
    const make = (code, layouts, buffers, topology, depthWrite, label) => {
      const module = device.createShaderModule({ code, label });
      return device.createRenderPipeline({
        label,
        layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
        vertex: { module, entryPoint: 'vs', buffers, constants: {} },
        fragment: {
          module, entryPoint: 'fs', constants,
          targets: [{
            format: this.targetFormat,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          }],
        },
        primitive: { topology, cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: depthWrite, depthCompare: 'less-equal' },
        multisample: { count: SAMPLE_COUNT },
      });
    };
    const posNormal = [{
      arrayStride: 24,
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }],
    }];
    const posUv = [{
      arrayStride: 20,
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }],
    }];
    const posColor = [{
      arrayStride: LINE_STRIDE * 4,
      attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x4' }],
    }];
    this.litPipeline = make(litShader, [this.cameraLayout, this.objectLayout], posNormal, 'triangle-list', true, 'lit');
    this.texPipeline = make(textureShader, [this.cameraLayout, this.objectLayout, this.textureLayout], posUv, 'triangle-list', true, 'textured');
    this.linePipeline = make(lineShader, [this.cameraLayout], posColor, 'line-list', false, 'lines');
  }

  createMesh({ positions, normals, indices }) {
    const n = positions.length / 3;
    const data = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      data.set(positions.slice(i * 3, i * 3 + 3), i * 6);
      data.set(normals.slice(i * 3, i * 3 + 3), i * 6 + 3);
    }
    return this.uploadMesh(data, indices, n);
  }

  uploadMesh(vertexData, indices, vertexCount) {
    const { device } = this;
    const vertexBuffer = device.createBuffer({ size: vertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const idx = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    const padded = new Uint8Array(Math.ceil(idx.byteLength / 4) * 4);
    padded.set(new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength));
    const indexBuffer = device.createBuffer({ size: padded.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(indexBuffer, 0, padded);
    return {
      vertexBuffer, indexBuffer, indexCount: indices.length,
      indexFormat: idx instanceof Uint32Array ? 'uint32' : 'uint16',
      destroy() { vertexBuffer.destroy(); indexBuffer.destroy(); },
    };
  }

  createQuad() {
    const data = new Float32Array([
      -0.5, -0.5, 0, 0, 1,
      0.5, -0.5, 0, 1, 1,
      0.5, 0.5, 0, 1, 0,
      -0.5, 0.5, 0, 0, 0,
    ]);
    return this.uploadMesh(data, [0, 1, 2, 0, 2, 3], 4);
  }

  async loadTexture(url) {
    const { device } = this;
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const texture = device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const bindGroup = device.createBindGroup({
      layout: this.textureLayout,
      entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: texture.createView() }],
    });
    return { texture, bindGroup, width: bitmap.width, height: bitmap.height };
  }

  ensureLineCapacity(vertices) {
    if (vertices <= this.lineCapacity) return;
    if (this.lineBuffer) this.lineBuffer.destroy();
    this.lineCapacity = Math.max(vertices, this.lineCapacity * 2);
    this.lineBuffer = this.device.createBuffer({ size: this.lineCapacity * LINE_STRIDE * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  createRibbon(samples = 256) {
    const { device } = this;
    this.ribbonSamples = samples;
    const vertexCount = 2 * (samples + 1);
    this.ribbonCtrl = device.createBuffer({ size: 16 * 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.ribbonParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const vertexBuffer = device.createBuffer({ size: vertexCount * 24, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE });
    const indices = [];
    for (let i = 0; i < samples; i++) {
      const a = 2 * i;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const idx = new Uint32Array(indices);
    const indexBuffer = device.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(indexBuffer, 0, idx);
    this.ribbonMesh = { vertexBuffer, indexBuffer, indexCount: indices.length, indexFormat: 'uint32' };
    const module = device.createShaderModule({ code: ribbonComputeShader, label: 'ribbon' });
    this.ribbonPipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    this.ribbonBindGroup = device.createBindGroup({
      layout: this.ribbonPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.ribbonCtrl } },
        { binding: 1, resource: { buffer: vertexBuffer } },
        { binding: 2, resource: { buffer: this.ribbonParams } },
      ],
    });
    this.ribbonRequest = null;
  }

  updateRibbon(controlWorld, normal, height) {
    const data = new Float32Array(controlWorld.length * 4);
    controlWorld.forEach((p, i) => data.set([p[0], p[1], p[2], 1], i * 4));
    this.device.queue.writeBuffer(this.ribbonCtrl, 0, data);
    const params = new ArrayBuffer(32);
    new Uint32Array(params, 0, 2).set([Math.floor((controlWorld.length - 1) / 3), this.ribbonSamples]);
    new Float32Array(params, 8, 6).set([height, 0, normal[0], normal[1], normal[2], 0]);
    this.device.queue.writeBuffer(this.ribbonParams, 0, params);
    this.ribbonRequest = true;
  }

  beginFrame() {
    this.slot = 0;
    this.litDraws = [];
    this.texDraws = [];
    this.lines = [[], []];
  }

  writeObject(model, color, unlit) {
    if (this.slot >= MAX_OBJECTS) throw new Error('Too many objects in one frame.');
    const o = this.slot * (SLOT / 4);
    this.objectStaging.set(model, o);
    this.objectStaging.set(m4.normalMatrix(model), o + 16);
    this.objectStaging.set(color, o + 32);
    this.objectStaging.set([unlit ? 1 : 0, 0, 0, 0], o + 36);
    return this.slot++;
  }

  drawMesh(mesh, model, color, { unlit = false } = {}) {
    this.litDraws.push({ mesh, slot: this.writeObject(model, color, unlit) });
  }

  drawTextured(mesh, model, textureBindGroup, tint = [1, 1, 1, 1]) {
    this.texDraws.push({ mesh, slot: this.writeObject(model, tint, true), bindGroup: textureBindGroup });
  }

  line(a, b, color, layer = 0) {
    const L = this.lines[layer];
    const c = color.length === 4 ? color : [...color, 1];
    L.push(a[0], a[1], a[2], c[0], c[1], c[2], c[3], b[0], b[1], b[2], c[0], c[1], c[2], c[3]);
  }

  polyline(points, color, layer = 0, closed = false) {
    for (let i = 0; i + 1 < points.length; i++) this.line(points[i], points[i + 1], color, layer);
    if (closed && points.length > 2) this.line(points[points.length - 1], points[0], color, layer);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (w === this.width && h === this.height) return;
    this.width = this.canvas.width = w;
    this.height = this.canvas.height = h;
    for (const t of [this.msaaTexture, this.depthTexture]) if (t) t.destroy();
    this.msaaTexture = this.device.createTexture({ size: [w, h], format: this.targetFormat, sampleCount: SAMPLE_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthTexture = this.device.createTexture({ size: [w, h], format: 'depth24plus', sampleCount: SAMPLE_COUNT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  render(views, { drawRibbon = false, lightDir = [0.4, 0.9, 0.6] } = {}) {
    const { device } = this;
    this.resize();
    device.queue.writeBuffer(this.objectBuffer, 0, this.objectStaging, 0, this.slot * (SLOT / 4));

    const l0 = this.lines[0], l1 = this.lines[1];
    const n0 = l0.length / LINE_STRIDE, n1 = l1.length / LINE_STRIDE;
    this.ensureLineCapacity(n0 + n1);
    if (n0 + n1 > 0) {
      const lineData = new Float32Array(l0.length + l1.length);
      lineData.set(l0, 0);
      lineData.set(l1, l0.length);
      device.queue.writeBuffer(this.lineBuffer, 0, lineData);
    }

    const encoder = device.createCommandEncoder();
    if (drawRibbon && this.ribbonRequest) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.ribbonPipeline);
      pass.setBindGroup(0, this.ribbonBindGroup);
      pass.dispatchWorkgroups(Math.ceil((this.ribbonSamples + 1) / 64));
      pass.end();
      this.ribbonRequest = false;
    }

    const view = this.context.getCurrentTexture().createView({ format: this.targetFormat });
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.msaaTexture.createView(), resolveTarget: view,
        clearValue: { r: 0.012, g: 0.013, b: 0.016, a: 1 }, loadOp: 'clear', storeOp: 'discard',
      }],
      depthStencilAttachment: { view: this.depthTexture.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });

    let vertices = 0, drawCalls = 0;
    views.slice(0, MAX_VIEWS).forEach((v, i) => {
      const cam = new Float32Array(24);
      cam.set(v.viewProj, 0);
      cam.set([...v.eye, 1], 16);
      cam.set([...lightDir, 0], 20);
      device.queue.writeBuffer(this.cameraBuffers[i], 0, cam);

      const [fx, fy, fw, fh] = v.rect;
      const x = Math.floor(fx * this.width), y = Math.floor(fy * this.height);
      const w = Math.max(1, Math.floor(fw * this.width)), h = Math.max(1, Math.floor(fh * this.height));
      pass.setViewport(x, y, w, h, 0, 1);
      pass.setScissorRect(x, y, w, h);
      pass.setBindGroup(0, this.cameraBindGroups[i]);

      pass.setPipeline(this.texPipeline);
      for (const d of this.texDraws) {
        pass.setBindGroup(1, this.objectBindGroup, [d.slot * SLOT]);
        pass.setBindGroup(2, d.bindGroup);
        pass.setVertexBuffer(0, d.mesh.vertexBuffer);
        pass.setIndexBuffer(d.mesh.indexBuffer, d.mesh.indexFormat);
        pass.drawIndexed(d.mesh.indexCount);
        vertices += d.mesh.indexCount; drawCalls++;
      }

      pass.setPipeline(this.litPipeline);
      for (const d of this.litDraws) {
        pass.setBindGroup(1, this.objectBindGroup, [d.slot * SLOT]);
        pass.setVertexBuffer(0, d.mesh.vertexBuffer);
        pass.setIndexBuffer(d.mesh.indexBuffer, d.mesh.indexFormat);
        pass.drawIndexed(d.mesh.indexCount);
        vertices += d.mesh.indexCount; drawCalls++;
      }

      if (n0 + (v.overlays ? n1 : 0) > 0) {
        pass.setPipeline(this.linePipeline);
        pass.setVertexBuffer(0, this.lineBuffer);
        if (n0) { pass.draw(n0, 1, 0); vertices += n0; drawCalls++; }
        if (v.overlays && n1) { pass.draw(n1, 1, n0); vertices += n1; drawCalls++; }
      }
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
    this.stats = { vertices, drawCalls };
  }
}
