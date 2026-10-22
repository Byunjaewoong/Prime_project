/*
 * Browser adapter for Eric Bruneton's Precomputed Atmospheric Scattering demo.
 * The original shaders and lookup tables are served from /air/bruneton.
 * Copyright (c) 2017-2018 Eric Bruneton. BSD 3-Clause license:
 * public/air/bruneton/LICENSE
 */

export type AirView = {
  viewDistanceMeters: number;
  viewZenith: number;
  viewAzimuth: number;
  sunZenith: number;
  sunAzimuth: number;
  exposure: number;
};

export const AIR_PRESETS: { name: string; view: AirView }[] = [
  { name: "Sunset", view: { viewDistanceMeters: 7000, viewZenith: 1.57, viewAzimuth: 0, sunZenith: 1.54, sunAzimuth: -2.96, exposure: 10 } },
  { name: "Daylight", view: { viewDistanceMeters: 9000, viewZenith: 1.47, viewAzimuth: 0, sunZenith: 1.3, sunAzimuth: 3, exposure: 10 } },
  { name: "Afterglow", view: { viewDistanceMeters: 9000, viewZenith: 1.5, viewAzimuth: 0, sunZenith: 1.628, sunAzimuth: 1.05, exposure: 200 } },
  { name: "Orbit", view: { viewDistanceMeters: 2.7e6, viewZenith: 0.81, viewAzimuth: 0, sunZenith: 1.57, sunAzimuth: 2, exposure: 10 } },
];

const ASSET_ROOT = "/air/bruneton";
const TRANSMITTANCE_SIZE = 256 * 64 * 4;
const SCATTERING_SIZE = 256 * 128 * 32 * 4;
const IRRADIANCE_SIZE = 64 * 16 * 4;
const SUN_ANGULAR_RADIUS = 0.00935 / 2;

function clampPortraitShift(aspect: number) {
  return Math.min(0.5, Math.max(0, 0.9 * (1 - aspect)));
}

function transposeMatrix(values: number[]) {
  const result = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) result[column * 4 + row] = values[row * 4 + column];
  }
  return result;
}

async function loadAsset(name: string, signal: AbortSignal) {
  const response = await fetch(`${ASSET_ROOT}/${name}`, { signal });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return response;
}

async function loadFloats(name: string, expectedLength: number, signal: AbortSignal) {
  const buffer = await (await loadAsset(name, signal)).arrayBuffer();
  if (buffer.byteLength !== expectedLength * 4) throw new Error(`${name}: invalid lookup table size`);
  // Bruneton's precompute program writes IEEE 754 floats in little-endian order.
  const view = new DataView(buffer);
  const values = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index++) values[index] = view.getFloat32(index * 4, true);
  return values;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function adaptFragmentSource(source: string) {
  // The desktop demo uses a binary Earth intersection. At orbital distances its
  // one-pixel transition becomes a conspicuous dark arc. Keep the original
  // atmosphere calculation and soften only the ground silhouette in screen space.
  const groundAlphaDeclaration = "  float ground_alpha = 0.0;";
  const hardGroundEdge = "      ground_alpha = 1.0;";
  if (!source.includes(groundAlphaDeclaration) || !source.includes(hardGroundEdge)) {
    throw new Error("Ground edge shader hook was not found");
  }
  return source.replace(groundAlphaDeclaration,
    "  float ground_edge_width = max(fwidth(discriminant), 0.0001);\n" + groundAlphaDeclaration)
    .replace(hardGroundEdge,
      "      ground_alpha = smoothstep(0.0, ground_edge_width * 1.5, discriminant);");
}

function makeTexture(gl: WebGL2RenderingContext, unit: number, target: number) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create atmosphere texture");
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(target, texture);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (target === gl.TEXTURE_3D) gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  return texture;
}

export class AirRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private textures: WebGLTexture[] = [];
  private frame = 0;
  private disposed = false;
  view: AirView;

  constructor(private canvas: HTMLCanvasElement, initialView: AirView) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("이 장치는 WebGL2를 지원하지 않습니다.");
    this.gl = gl;
    this.view = { ...initialView };
  }

  async initialize(signal: AbortSignal, onProgress: (done: number, total: number) => void) {
    const names = ["transmittance.dat", "scattering.dat", "irradiance.dat", "vertex_shader.txt", "fragment_shader.txt", "atmosphere_shader.txt"];
    let done = 0;
    const loaded = await Promise.all(names.map(async (name, index) => {
      const value = index < 3
        ? await loadFloats(name, [TRANSMITTANCE_SIZE, SCATTERING_SIZE, IRRADIANCE_SIZE][index], signal)
        : await (await loadAsset(name, signal)).text();
      onProgress(++done, names.length);
      return value;
    }));
    if (this.disposed || signal.aborted) return;
    const [transmittance, scattering, irradiance, vertexSource, fragmentSource, atmosphereSource] = loaded as [Float32Array, Float32Array, Float32Array, string, string, string];
    const gl = this.gl;
    const vertexShader = compile(gl, gl.VERTEX_SHADER, vertexSource.trim().replace("#version 330", "#version 300 es"));
    const fragmentShader = compile(gl, gl.FRAGMENT_SHADER,
      atmosphereSource.trim().replace("#version 330", "#version 300 es\nprecision highp float;\nprecision highp sampler3D;") + "\n" +
      adaptFragmentSource(fragmentSource.trim().replace("#version 330", "").replace("const float PI = 3.14159265;", "")));
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create atmosphere program");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || "Atmosphere shader linking failed";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    this.program = program;

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const transmittanceTexture = makeTexture(gl, 0, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.getExtension("OES_texture_float_linear") ? gl.RGBA32F : gl.RGBA16F,
      256, 64, 0, gl.RGBA, gl.FLOAT, transmittance);
    const scatteringTexture = makeTexture(gl, 1, gl.TEXTURE_3D);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 256, 128, 32, 0, gl.RGBA, gl.FLOAT, scattering);
    const irradianceTexture = makeTexture(gl, 2, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 64, 16, 0, gl.RGBA, gl.FLOAT, irradiance);
    this.textures = [transmittanceTexture, scatteringTexture, irradianceTexture];
    if (gl.getError() !== gl.NO_ERROR) throw new Error("대기 텍스처를 GPU에 올리지 못했습니다.");
    this.resize();
    this.requestRender();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
    this.requestRender();
  }

  setView(view: AirView) {
    this.view = { ...view };
    this.requestRender();
  }

  requestRender() {
    if (this.frame || this.disposed || !this.program) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render() {
    const gl = this.gl;
    const program = this.program;
    if (!program || this.disposed) return;
    const { viewDistanceMeters, viewZenith, viewAzimuth, sunZenith, sunAzimuth, exposure } = this.view;
    const aspect = this.canvas.width / this.canvas.height;
    // Keep the horizontal composition consistent on narrow screens.
    const tanFov = Math.tan((50 * Math.PI / 180) / 2) * Math.max(1, (16 / 9) / aspect);
    const portraitShift = viewDistanceMeters < 100000 ? clampPortraitShift(aspect) : 0;
    const clip = transposeMatrix([
      tanFov * aspect, 0, 0, 0,
      0, tanFov, 0, -tanFov * portraitShift,
      0, 0, 0, -1,
      0, 0, 1, 1,
    ]);
    const cosZ = Math.cos(viewZenith);
    const sinZ = Math.sin(viewZenith);
    const cosA = Math.cos(viewAzimuth);
    const sinA = Math.sin(viewAzimuth);
    const distance = viewDistanceMeters / 1000;
    const model = [
      -sinA, -cosZ * cosA, sinZ * cosA, sinZ * cosA * distance,
      cosA, -cosZ * sinA, sinZ * sinA, sinZ * sinA * distance,
      0, sinZ, cosZ, cosZ * distance,
      0, 0, 0, 1,
    ];
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "view_from_clip"), false, clip);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "model_from_view"), false, transposeMatrix(model));
    gl.uniform1i(gl.getUniformLocation(program, "transmittance_texture"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "scattering_texture"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "single_mie_scattering_texture"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "irradiance_texture"), 2);
    gl.uniform3f(gl.getUniformLocation(program, "camera"), model[3], model[7], model[11]);
    gl.uniform3f(gl.getUniformLocation(program, "white_point"), 1, 1, 1);
    gl.uniform1f(gl.getUniformLocation(program, "exposure"), exposure);
    gl.uniform3f(gl.getUniformLocation(program, "earth_center"), 0, 0, -6360);
    gl.uniform3f(gl.getUniformLocation(program, "sun_direction"),
      Math.cos(sunAzimuth) * Math.sin(sunZenith), Math.sin(sunAzimuth) * Math.sin(sunZenith), Math.cos(sunZenith));
    gl.uniform2f(gl.getUniformLocation(program, "sun_size"), Math.tan(SUN_ANGULAR_RADIUS), Math.cos(SUN_ANGULAR_RADIUS));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.disposed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    if (this.program) this.gl.deleteProgram(this.program);
  }
}
