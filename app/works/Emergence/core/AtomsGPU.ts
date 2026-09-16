/// <reference types="@webgpu/types" />

const DEFAULT_PARTICLE_COUNT = 60000;
const MAX_PARTICLE_COUNT = 300000;
const TYPE_COUNT = 5;
const BUCKET_CAPACITY = 128;
const PARTICLE_STRIDE = 32;
const MAX_INTERACTION_RADIUS = 140;

const computeShader = /* wgsl */ `
struct Particle {
  posVel: vec4f,
  attributes: vec4f,
}

struct Interaction {
  values: vec4f,
}

struct Options {
  particleCount: u32,
  gridCols: u32,
  gridRows: u32,
  bucketCapacity: u32,
  world: vec2f,
  viewport: vec2f,
  forceFactor: f32,
  repel: f32,
  frictionMultiplier: f32,
  dtScale: f32,
  particleSize: f32,
  zoom: f32,
  optionPad: vec2f,
  cameraOffset: vec2f,
  cameraPad: vec2f,
}

@group(0) @binding(0) var<storage, read> inputParticles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> outputParticles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> cellCounts: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> cellIndices: array<u32>;
@group(0) @binding(4) var<storage, read> interactions: array<Interaction>;
@group(0) @binding(5) var<uniform> options: Options;

@compute @workgroup_size(64)
fn clearBins(@builtin(global_invocation_id) id: vec3u) {
  let cellCount = options.gridCols * options.gridRows;
  if (id.x < cellCount) { atomicStore(&cellCounts[id.x], 0u); }
}

@compute @workgroup_size(64)
fn fillBins(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= options.particleCount) { return; }
  let p = inputParticles[id.x];
  let cellSize = options.world / vec2f(f32(options.gridCols), f32(options.gridRows));
  let cell = min(vec2u(p.posVel.xy / cellSize), vec2u(options.gridCols - 1u, options.gridRows - 1u));
  let cellIndex = cell.x + cell.y * options.gridCols;
  let slot = atomicAdd(&cellCounts[cellIndex], 1u);
  if (slot < options.bucketCapacity) {
    cellIndices[cellIndex * options.bucketCapacity + slot] = id.x;
  }
}

fn interactionForce(rule: f32, minRadius: f32, maxRadius: f32, distance: f32) -> f32 {
  if (distance < minRadius) {
    return (options.repel / minRadius) * distance - options.repel;
  }
  if (distance > maxRadius) { return 0.0; }
  let middle = (minRadius + maxRadius) * 0.5;
  let slope = rule / (middle - minRadius);
  return -(slope * abs(distance - middle)) + rule;
}

fn hash01(value: u32) -> f32 {
  var state = value * 747796405u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  state = (state >> 22u) ^ state;
  return f32(state) / 4294967295.0;
}

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= options.particleCount) { return; }
  let particle = inputParticles[id.x];
  let position = particle.posVel.xy;
  let velocity = particle.posVel.zw;
  let particleType = u32(particle.attributes.x);
  if (position.x >= options.world.x || position.y >= options.world.y) {
    let worldSeed = bitcast<u32>(options.world.x) ^ bitcast<u32>(options.world.y);
    let nextPosition = vec2f(
      hash01(id.x ^ worldSeed) * options.world.x,
      hash01((id.x + 1u) ^ (worldSeed * 1664525u)) * options.world.y,
    );
    outputParticles[id.x].posVel = vec4f(nextPosition, vec2f(0.0));
    outputParticles[id.x].attributes = particle.attributes;
    return;
  }
  let cellSize = options.world / vec2f(f32(options.gridCols), f32(options.gridRows));
  let baseCell = min(vec2u(position / cellSize), vec2u(options.gridCols - 1u, options.gridRows - 1u));
  var totalForce = vec2f(0.0);

  for (var oy = -1; oy <= 1; oy++) {
    for (var ox = -1; ox <= 1; ox++) {
      let nx = (i32(baseCell.x) + ox + i32(options.gridCols)) % i32(options.gridCols);
      let ny = (i32(baseCell.y) + oy + i32(options.gridRows)) % i32(options.gridRows);
      let cellIndex = u32(nx) + u32(ny) * options.gridCols;
      let count = min(atomicLoad(&cellCounts[cellIndex]), options.bucketCapacity);
      for (var slot = 0u; slot < count; slot++) {
        let otherIndex = cellIndices[cellIndex * options.bucketCapacity + slot];
        if (otherIndex == id.x) { continue; }
        let other = inputParticles[otherIndex];
        var delta = other.posVel.xy - position;
        if (delta.x > options.world.x * 0.5) { delta.x -= options.world.x; }
        if (delta.x < -options.world.x * 0.5) { delta.x += options.world.x; }
        if (delta.y > options.world.y * 0.5) { delta.y -= options.world.y; }
        if (delta.y < -options.world.y * 0.5) { delta.y += options.world.y; }
        let distanceSquared = dot(delta, delta);
        if (distanceSquared < 0.0001) { continue; }
        let otherType = u32(other.attributes.x);
        let interaction = interactions[particleType * ${TYPE_COUNT}u + otherType].values;
        if (distanceSquared >= interaction.z * interaction.z) { continue; }
        let distance = sqrt(distanceSquared);
        let force = interactionForce(interaction.x, interaction.y, interaction.z, distance);
        totalForce += delta / distance * force;
      }
    }
  }

  let nextVelocity = (velocity + totalForce * options.forceFactor * options.dtScale) * options.frictionMultiplier;
  var nextPosition = position + nextVelocity * options.dtScale;
  nextPosition = (nextPosition % options.world + options.world) % options.world;
  outputParticles[id.x].posVel = vec4f(nextPosition, nextVelocity);
  outputParticles[id.x].attributes = particle.attributes;
}
`;

const renderShader = /* wgsl */ `
struct Particle { posVel: vec4f, attributes: vec4f }
struct Options {
  particleCount: u32, gridCols: u32, gridRows: u32, bucketCapacity: u32,
  world: vec2f, viewport: vec2f,
  forceFactor: f32, repel: f32, frictionMultiplier: f32, dtScale: f32,
  particleSize: f32, zoom: f32, optionPad: vec2f,
  cameraOffset: vec2f, cameraPad: vec2f,
}
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> options: Options;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
}

fn colorForType(kind: u32) -> vec3f {
  switch kind {
    case 0u: { return vec3f(0.941, 0.267, 0.392); }
    case 1u: { return vec3f(0.125, 0.784, 0.910); }
    case 2u: { return vec3f(0.949, 0.788, 0.298); }
    case 3u: { return vec3f(0.329, 0.839, 0.420); }
    default: { return vec3f(0.647, 0.424, 1.0); }
  }
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let particle = particles[instanceIndex];
  let local = corners[vertexIndex];
  let center = (particle.posVel.xy + options.cameraOffset) * options.zoom;
  let radius = max(0.7, options.particleSize * options.zoom * 0.5);
  let pixel = center + local * radius;
  let clip = vec2f(pixel.x / options.viewport.x * 2.0 - 1.0, 1.0 - pixel.y / options.viewport.y * 2.0);
  var out: VertexOutput;
  out.position = vec4f(clip, 0.0, 1.0);
  out.local = local;
  out.color = colorForType(u32(particle.attributes.x));
  return out;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  if (dot(input.local, input.local) > 1.0) { discard; }
  return vec4f(input.color, 1.0);
}
`;

export class AtomsGPU {
  private canvas: HTMLCanvasElement;
  private viewportW: number;
  private viewportH: number;
  private worldW: number;
  private worldH: number;
  private particleCount = DEFAULT_PARTICLE_COUNT;
  private requestedParticleCount = DEFAULT_PARTICLE_COUNT;
  private particleCountTimer: ReturnType<typeof setTimeout> | null = null;
  private repel = 1;
  private forceFactor = 0.18;
  private friction = 0.08;
  private particleSize = 4;
  private zoom = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private frameCount = 0;
  private fps = 0;
  private fpsStarted = performance.now();
  private lastFrameTime = performance.now();

  private rules = new Float32Array(TYPE_COUNT * TYPE_COUNT);
  private minRadii = new Float32Array(TYPE_COUNT * TYPE_COUNT);
  private maxRadii = new Float32Array(TYPE_COUNT * TYPE_COUNT);
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;
  private particleBuffers: GPUBuffer[] = [];
  private cellCountsBuffer: GPUBuffer | null = null;
  private cellIndicesBuffer: GPUBuffer | null = null;
  private interactionBuffer: GPUBuffer | null = null;
  private optionsBuffer: GPUBuffer | null = null;
  private computeBindGroups: GPUBindGroup[] = [];
  private renderBindGroups: GPUBindGroup[] = [];
  private clearPipeline: GPUComputePipeline | null = null;
  private fillPipeline: GPUComputePipeline | null = null;
  private simulatePipeline: GPUComputePipeline | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private currentBuffer = 0;
  private gridCols = 1;
  private gridRows = 1;
  private spatialCellCapacity = 0;
  private ready = false;
  private failed = false;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.viewportW = width;
    this.viewportH = height;
    this.worldW = width;
    this.worldH = height;
    this.randomiseInteractions();
  }

  async init(): Promise<boolean> {
    try {
      if (!("gpu" in navigator)) return false;
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return false;
      this.device = await adapter.requestDevice();
      this.device.addEventListener("uncapturederror", event => {
        console.error("Atoms WebGPU validation error", event.error.message);
      });
      this.context = this.canvas.getContext("webgpu");
      if (!this.context) return false;
      this.format = navigator.gpu.getPreferredCanvasFormat();
      this.configureCanvas();
      this.createPipelines();
      this.rebuildBuffers();
      this.ready = true;
      return true;
    } catch (error) {
      console.error("Atoms WebGPU initialization failed", error);
      this.failed = true;
      return false;
    }
  }

  private configureCanvas() {
    if (!this.device || !this.context || !this.format) return;
    this.canvas.width = this.viewportW;
    this.canvas.height = this.viewportH;
    this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
  }

  private createPipelines() {
    if (!this.device || !this.format) return;
    const computeModule = this.device.createShaderModule({ code: computeShader });
    const renderModule = this.device.createShaderModule({ code: renderShader });
    const computeBindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ] });
    const computeLayout = this.device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] });
    this.clearPipeline = this.device.createComputePipeline({ layout: computeLayout, compute: { module: computeModule, entryPoint: "clearBins" } });
    this.fillPipeline = this.device.createComputePipeline({ layout: computeLayout, compute: { module: computeModule, entryPoint: "fillBins" } });
    this.simulatePipeline = this.device.createComputePipeline({ layout: computeLayout, compute: { module: computeModule, entryPoint: "simulate" } });
    const renderBindGroupLayout = this.device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
    ] });
    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
      vertex: { module: renderModule, entryPoint: "vertexMain" },
      fragment: { module: renderModule, entryPoint: "fragmentMain", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
  }

  private rebuildBuffers() {
    if (!this.device || !this.clearPipeline || !this.renderPipeline) return;
    for (const buffer of this.particleBuffers) buffer.destroy();
    this.cellCountsBuffer?.destroy();
    this.cellIndicesBuffer?.destroy();
    this.interactionBuffer?.destroy();
    this.optionsBuffer?.destroy();

    const scale = Math.sqrt(DEFAULT_PARTICLE_COUNT / 1000);
    this.worldW = this.viewportW * scale;
    this.worldH = this.viewportH * scale;
    this.zoom = 1 / scale;
    this.offsetX = 0;
    this.offsetY = 0;

    const initial = new Float32Array(this.particleCount * 8);
    for (let i = 0; i < this.particleCount; i++) {
      const offset = i * 8;
      initial[offset] = Math.random() * this.worldW;
      initial[offset + 1] = Math.random() * this.worldH;
      initial[offset + 4] = Math.floor(Math.random() * TYPE_COUNT);
    }
    this.particleBuffers = [0, 1].map(() => {
      const buffer = this.device!.createBuffer({
        size: MAX_PARTICLE_COUNT * PARTICLE_STRIDE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device!.queue.writeBuffer(buffer, 0, initial);
      return buffer;
    });
    this.interactionBuffer = this.device.createBuffer({
      size: TYPE_COUNT * TYPE_COUNT * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.optionsBuffer = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.writeInteractions();
    this.writeOptions(1 / 60);
    this.spatialCellCapacity = 0;
    this.updateSpatialGrid();
    this.renderBindGroups = [0, 1].map(index => this.device!.createBindGroup({
      layout: this.renderPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffers[index] } },
        { binding: 1, resource: { buffer: this.optionsBuffer! } },
      ],
    }));
    this.currentBuffer = 0;
  }

  private updateSpatialGrid() {
    if (!this.device || !this.clearPipeline || !this.interactionBuffer || !this.optionsBuffer) return;
    this.gridCols = Math.max(1, Math.floor(this.worldW / MAX_INTERACTION_RADIUS));
    this.gridRows = Math.max(1, Math.floor(this.worldH / MAX_INTERACTION_RADIUS));
    const requiredCells = this.gridCols * this.gridRows;
    const buffersChanged = requiredCells > this.spatialCellCapacity || !this.cellCountsBuffer || !this.cellIndicesBuffer;
    if (buffersChanged) {
      this.cellCountsBuffer?.destroy();
      this.cellIndicesBuffer?.destroy();
      this.spatialCellCapacity = 2 ** Math.ceil(Math.log2(Math.max(1, requiredCells)));
      this.cellCountsBuffer = this.device.createBuffer({
        size: this.spatialCellCapacity * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.cellIndicesBuffer = this.device.createBuffer({
        size: this.spatialCellCapacity * BUCKET_CAPACITY * 4,
        usage: GPUBufferUsage.STORAGE,
      });
    }
    if (!buffersChanged && this.computeBindGroups.length === 2) return;
    this.computeBindGroups = [0, 1].map(input => this.device!.createBindGroup({
      layout: this.clearPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.particleBuffers[input] } },
        { binding: 1, resource: { buffer: this.particleBuffers[1 - input] } },
        { binding: 2, resource: { buffer: this.cellCountsBuffer! } },
        { binding: 3, resource: { buffer: this.cellIndicesBuffer! } },
        { binding: 4, resource: { buffer: this.interactionBuffer! } },
        { binding: 5, resource: { buffer: this.optionsBuffer! } },
      ],
    }));
  }

  private addParticles(start: number, end: number) {
    if (!this.device || end <= start) return;
    const added = new Float32Array((end - start) * 8);
    for (let i = 0; i < end - start; i++) {
      const offset = i * 8;
      added[offset] = Math.random() * this.worldW;
      added[offset + 1] = Math.random() * this.worldH;
      added[offset + 4] = Math.floor(Math.random() * TYPE_COUNT);
    }
    for (const buffer of this.particleBuffers) {
      this.device.queue.writeBuffer(buffer, start * PARTICLE_STRIDE, added);
    }
  }

  private writeInteractions() {
    if (!this.device || !this.interactionBuffer) return;
    const values = new Float32Array(TYPE_COUNT * TYPE_COUNT * 4);
    for (let i = 0; i < TYPE_COUNT * TYPE_COUNT; i++) {
      values[i * 4] = this.rules[i];
      values[i * 4 + 1] = this.minRadii[i];
      values[i * 4 + 2] = this.maxRadii[i];
    }
    this.device.queue.writeBuffer(this.interactionBuffer, 0, values);
  }

  private writeOptions(delta: number) {
    if (!this.device || !this.optionsBuffer) return;
    const data = new ArrayBuffer(80);
    const view = new DataView(data);
    view.setUint32(0, this.particleCount, true);
    view.setUint32(4, this.gridCols, true);
    view.setUint32(8, this.gridRows, true);
    view.setUint32(12, BUCKET_CAPACITY, true);
    view.setFloat32(16, this.worldW, true);
    view.setFloat32(20, this.worldH, true);
    view.setFloat32(24, this.viewportW, true);
    view.setFloat32(28, this.viewportH, true);
    const dtScale = Math.max(0.25, Math.min(3, delta * 60));
    view.setFloat32(32, this.forceFactor, true);
    view.setFloat32(36, this.repel, true);
    view.setFloat32(40, Math.pow(1 - this.friction, dtScale), true);
    view.setFloat32(44, dtScale, true);
    view.setFloat32(48, this.particleSize, true);
    view.setFloat32(52, this.zoom, true);
    view.setFloat32(64, this.offsetX, true);
    view.setFloat32(68, this.offsetY, true);
    this.device.queue.writeBuffer(this.optionsBuffer, 0, data);
  }

  frame(delta: number) {
    if (!this.ready || !this.device || !this.context || !this.clearPipeline || !this.fillPipeline || !this.simulatePipeline || !this.renderPipeline) return;
    this.writeOptions(delta);
    const output = 1 - this.currentBuffer;
    const encoder = this.device.createCommandEncoder();
    const compute = encoder.beginComputePass();
    compute.setBindGroup(0, this.computeBindGroups[this.currentBuffer]);
    compute.setPipeline(this.clearPipeline);
    compute.dispatchWorkgroups(Math.ceil((this.gridCols * this.gridRows) / 64));
    compute.setPipeline(this.fillPipeline);
    compute.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    compute.setPipeline(this.simulatePipeline);
    compute.dispatchWorkgroups(Math.ceil(this.particleCount / 64));
    compute.end();

    const render = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    render.setPipeline(this.renderPipeline);
    render.setBindGroup(0, this.renderBindGroups[output]);
    render.draw(6, this.particleCount);
    render.end();
    this.device.queue.submit([encoder.finish()]);
    this.currentBuffer = output;

    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsStarted >= 500) {
      this.fps = this.frameCount * 1000 / (now - this.fpsStarted);
      this.frameCount = 0;
      this.fpsStarted = now;
    }
    this.lastFrameTime = now;
  }

  private randomiseInteractions() {
    for (let i = 0; i < TYPE_COUNT * TYPE_COUNT; i++) {
      this.rules[i] = Math.round((Math.random() * 2 - 1) * 100) / 100;
      this.minRadii[i] = Math.round(12 + Math.random() * 16);
      this.maxRadii[i] = Math.round(65 + Math.random() * 75);
    }
  }

  getParams(): Record<string, number> {
    const params: Record<string, number> = {
      particles: this.requestedParticleCount,
      repel: this.repel,
      forceFactor: this.forceFactor,
      friction: this.friction,
      particleSize: this.particleSize,
      zoom: this.zoom,
      viewX: this.offsetX,
      viewY: this.offsetY,
      fps: this.fps,
      gpu: this.ready ? 1 : 0,
      gpuFailed: this.failed ? 1 : 0,
    };
    for (let row = 0; row < TYPE_COUNT; row++) {
      for (let column = 0; column < TYPE_COUNT; column++) {
        const index = row * TYPE_COUNT + column;
        params[`matrixRule_${row}_${column}`] = this.rules[index];
        params[`matrixMin_${row}_${column}`] = this.minRadii[index];
        params[`matrixMax_${row}_${column}`] = this.maxRadii[index];
      }
    }
    return params;
  }

  setParam(key: string, value: number) {
    if (key === "particles") {
      this.requestedParticleCount = Math.max(16, Math.min(MAX_PARTICLE_COUNT, Math.round(value / 16) * 16));
      if (this.particleCountTimer) clearTimeout(this.particleCountTimer);
      this.particleCountTimer = setTimeout(() => {
        const previousCount = this.particleCount;
        const nextCount = this.requestedParticleCount;
        if (this.ready && nextCount > previousCount) this.addParticles(previousCount, nextCount);
        this.particleCount = nextCount;
        this.particleCountTimer = null;
      }, 120);
    } else if (key === "repel") this.repel = value;
    else if (key === "forceFactor") this.forceFactor = value;
    else if (key === "friction") this.friction = value;
    else if (key === "particleSize") this.particleSize = value;
  }

  randomiseParams() {
    this.randomiseInteractions();
    if (this.ready) this.writeInteractions();
  }

  onPointerDown(x: number, y: number, button: number) {
    if (button !== 0) return;
    this.dragging = true;
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  onPointerMove(x: number, y: number, buttons: number) {
    if (!this.dragging || !(buttons & 1)) return;
    this.offsetX += (x - this.lastPointerX) / this.zoom;
    this.offsetY += (y - this.lastPointerY) / this.zoom;
    this.lastPointerX = x;
    this.lastPointerY = y;
  }

  onPointerUp() { this.dragging = false; }

  private zoomSpace(x: number, y: number, scale: number): boolean {
    if (!Number.isFinite(scale) || scale <= 0) return true;
    const oldZoom = this.zoom;
    this.zoom = Math.max(0.02, Math.min(5, this.zoom * scale));
    if (this.zoom === oldZoom) return true;
    const ratio = this.zoom / oldZoom;
    this.offsetX -= (x / this.zoom) * (ratio - 1);
    this.offsetY -= (y / this.zoom) * (ratio - 1);
    const worldScale = oldZoom / this.zoom;
    this.worldW *= worldScale;
    this.worldH *= worldScale;
    this.updateSpatialGrid();
    return true;
  }

  onWheel(x: number, y: number, deltaY: number): boolean {
    return this.zoomSpace(x, y, deltaY < 0 ? 1.1 : 0.9);
  }

  onPinch(x: number, y: number, scale: number): boolean {
    return this.zoomSpace(x, y, scale);
  }

  resize(width: number, height: number) {
    const centerX = this.viewportW * 0.5 / this.zoom - this.offsetX;
    const centerY = this.viewportH * 0.5 / this.zoom - this.offsetY;
    this.viewportW = width;
    this.viewportH = height;
    this.offsetX = this.viewportW * 0.5 / this.zoom - centerX;
    this.offsetY = this.viewportH * 0.5 / this.zoom - centerY;
    this.configureCanvas();
  }

  destroy() {
    this.ready = false;
    if (this.particleCountTimer) clearTimeout(this.particleCountTimer);
    for (const buffer of this.particleBuffers) buffer.destroy();
    this.cellCountsBuffer?.destroy();
    this.cellIndicesBuffer?.destroy();
    this.interactionBuffer?.destroy();
    this.optionsBuffer?.destroy();
    this.context?.unconfigure();
  }
}

export { DEFAULT_PARTICLE_COUNT as GPU_DEFAULT_PARTICLE_COUNT, MAX_PARTICLE_COUNT as GPU_MAX_PARTICLE_COUNT };
