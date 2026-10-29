import { createProgram, fitCanvas } from "../core/fullscreenGL";
import { earthFragment, noiseFragment } from "./earthShader";
import { AIR_PRESETS } from "../Air/AirRenderer";
import { atmosphereSource, precomputeAtmosphere } from "./atmospherePrecompute";
import { calculateSky, SUWON, type SkyState } from "./celestial";
import { createStarTexture } from "./starTexture";

export type EarthView = {
  mode: "orbit" | "sky";
  realTime: boolean;
  observationTime: number | null;
  latitude: number;
  longitude: number;
  constellations: boolean;
  fov: number;
  altitude: number;
  yaw: number;
  pitch: number;
  sunElevation: number;
  sunAzimuth: number;
  coverage: number;
  density: number;
  rayleigh: number;
  mie: number;
  exposure: number;
  animate: boolean;
  quality: "balanced" | "high";
};
const airOrbit = AIR_PRESETS.find(preset => preset.name === "Orbit")!.view;
const orbitView: Partial<EarthView> = {
  mode: "orbit", altitude: airOrbit.viewDistanceMeters / 1000,
  yaw: airOrbit.viewAzimuth, pitch: Math.PI / 2 - airOrbit.viewZenith,
  sunElevation: 90 - airOrbit.sunZenith * 180 / Math.PI,
  sunAzimuth: 90 - airOrbit.sunAzimuth * 180 / Math.PI,
  exposure: airOrbit.exposure, coverage: 0.32,
};
export const EARTH_DEFAULT: EarthView = { mode: "sky", altitude: SUWON.elevation/1000, yaw: Math.PI, pitch: 0.35,
  realTime: true, observationTime: null, latitude: SUWON.latitude, longitude: SUWON.longitude, constellations: false, fov: 55,
  sunElevation: 0, sunAzimuth: 0, coverage: 0.32, density: 1.3, rayleigh: 1, mie: 1,
  exposure: 10, animate: true, quality: "balanced" };
export const EARTH_PRESETS: { name: string; view: Partial<EarthView> }[] = [
  { name: "Orbit", view: orbitView },
  { name: "Cloudscape", view: { mode: "sky", altitude: 9, yaw: 0, pitch: -0.16, sunElevation: 24, sunAzimuth: -35, exposure: 7, coverage: 0.85 } },
  { name: "Sunset", view: { mode: "sky", altitude: 0.6, yaw: 0, pitch: 0.15, sunElevation: 2, sunAzimuth: 8, exposure: 10, coverage: 0.85 } },
];

function normalize(v: number[]) { const length = Math.hypot(...v); return v.map(x => x / length); }
function cross(a: number[], b: number[]) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }

const UNIFORM_NAMES = ["uNoise","uResolution","uTanFov","uCamera","uForward","uRight","uUp","uSun","uCoverage","uDensity","uExposure","uTime","uSteps",
  "uRealTime","uStars","uLocalToEquatorial","uMoon","uMoonSun","uMoonRadius","uSunRadius","uSolarScale","uConstellations",
  "transmittance_texture","scattering_texture","single_mie_scattering_texture","irradiance_texture"];

export class EarthRenderer {
  get isDisposed() { return this.disposed; }
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private baseProgram: WebGLProgram | null = null;
  private dynamicProgram: WebGLProgram | null = null;
  private atmosphereShader = "";
  private activeAtmosphere: WebGLTexture[] = [];
  private dynamicAtmosphere: WebGLTexture[] = [];
  private atmosphereRevision = 0;
  private atmosphereTimer = 0;
  private vao: WebGLVertexArrayObject | null;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private frame = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private frames = 0;
  private observer: ResizeObserver;
  private view: EarthView;
  private sky: SkyState | null = null;
  private skyKey = "";

  constructor(private canvas: HTMLCanvasElement, view: EarthView, private onAtmosphereStatus?: (message: string) => void) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false });
    if (!gl) throw new Error("WebGL2를 지원하는 브라우저가 필요합니다.");
    this.gl = gl;
    this.view = { ...view };
    this.vao = gl.createVertexArray();
    this.observer = new ResizeObserver(() => this.requestRender());
    this.observer.observe(canvas);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  async initialize(signal: AbortSignal) {
    const names = ["atmosphere_shader.txt", "transmittance.dat", "scattering.dat", "irradiance.dat"];
    const data = await Promise.all(names.map(async (name, index) => {
      const response = await fetch(`/air/bruneton/${name}`, { signal });
      if (!response.ok) throw new Error(`대기 데이터 로딩 실패: ${name} (${response.status})`);
      return index === 0 ? response.text() : response.arrayBuffer();
    }));
    if (signal.aborted || this.disposed) return;
    const gl = this.gl;
    const source = (data[0] as string).trim().replace("#version 330", "#version 300 es\nprecision highp float;\nprecision highp sampler3D;");
    this.atmosphereShader = source;
    this.baseProgram = createProgram(gl, source + "\n" + earthFragment);
    this.program = this.baseProgram;
    gl.bindVertexArray(this.vao);
    const dimensions = [[256,64,1],[256,128,32],[64,16,1]];
    dimensions.forEach(([w,h,d], index) => {
      const buffer = data[index+1] as ArrayBuffer;
      if (buffer.byteLength !== w*h*d*16) throw new Error("대기 데이터 크기가 일치하지 않습니다.");
      const texture = gl.createTexture();
      if (!texture) throw new Error("대기 텍스처 생성 실패");
      this.textures.push(texture);
      const target = d > 1 ? gl.TEXTURE_3D : gl.TEXTURE_2D;
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(target,texture);
      gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if (d > 1) {
        gl.texParameteri(target,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
        gl.texImage3D(target,0,gl.RGBA16F,w,h,d,0,gl.RGBA,gl.FLOAT,new Float32Array(buffer));
      } else gl.texImage2D(target,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.FLOAT,new Float32Array(buffer));
    });
    this.bakeNoise();
    const stars = await createStarTexture(gl,signal);
    if (!stars || signal.aborted || this.disposed) { if(stars)gl.deleteTexture(stars); return; }
    this.textures.push(stars);
    this.activeAtmosphere = this.textures.slice(0,3);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("Earth GPU 초기화 실패");
    this.uniforms = Object.fromEntries(UNIFORM_NAMES.map(name => [name,gl.getUniformLocation(this.program!,name)]));
    this.canvas.dataset.ready = "true";
    this.canvas.dataset.atmosphere = "1,1";
    this.requestRender();
    if (this.view.rayleigh !== 1 || this.view.mie !== 1) this.scheduleAtmosphere();
  }

  private bakeNoise() {
    const gl = this.gl;
    const program = createProgram(gl,noiseFragment);
    const framebuffer = gl.createFramebuffer();
    const texture = gl.createTexture();
    if (!framebuffer || !texture) throw new Error("구름 텍스처 생성 실패");
    this.textures.push(texture);
    try {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_3D,texture);
      gl.texStorage3D(gl.TEXTURE_3D,7,gl.RGBA8,64,64,64);
      for (const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,axis,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.viewport(0,0,64,64);
      gl.useProgram(program);
      const slice = gl.getUniformLocation(program,"uSlice");
      for (let z = 0; z < 64; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,texture,0,z);
        if (z === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("구름 볼륨 생성 실패");
        gl.uniform1f(slice,(z+0.5)/64);
        gl.drawArrays(gl.TRIANGLES,0,3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.generateMipmap(gl.TEXTURE_3D);
    } finally { gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.deleteFramebuffer(framebuffer); gl.deleteProgram(program); }
  }

  setView(view: EarthView) {
    const coefficientsChanged = view.rayleigh !== this.view.rayleigh || view.mie !== this.view.mie;
    this.view = { ...view };
    if (coefficientsChanged && this.atmosphereShader) this.scheduleAtmosphere();
    this.requestRender();
  }
  private scheduleAtmosphere() {
    const revision = ++this.atmosphereRevision;
    clearTimeout(this.atmosphereTimer);
    if (this.view.rayleigh === 1 && this.view.mie === 1) {
      this.program = this.baseProgram;
      this.activeAtmosphere = this.textures.slice(0,3);
      this.canvas.dataset.atmosphere = "1,1";
      this.uniforms = Object.fromEntries(UNIFORM_NAMES.map(name => [name,this.gl.getUniformLocation(this.program!,name)]));
      this.onAtmosphereStatus?.("");
      this.requestRender();
      return;
    }
    this.onAtmosphereStatus?.("대기 산란 LUT를 계산하는 중…");
    this.atmosphereTimer = window.setTimeout(() => void this.rebuildAtmosphere(revision),350);
  }
  private async rebuildAtmosphere(revision: number) {
    const gl = this.gl;
    const coefficients = `${this.view.rayleigh},${this.view.mie}`;
    let program: WebGLProgram | null = null;
    let textures: WebGLTexture[] | null = null;
    try {
      const source = atmosphereSource(this.atmosphereShader,this.view.rayleigh,this.view.mie);
      program = createProgram(gl,source + "\n" + earthFragment);
      textures = await precomputeAtmosphere(gl,source,() => !this.disposed && revision === this.atmosphereRevision);
      if (!textures || this.disposed || revision !== this.atmosphereRevision) return;
      this.dynamicAtmosphere.forEach(texture => gl.deleteTexture(texture));
      if (this.dynamicProgram) gl.deleteProgram(this.dynamicProgram);
      this.dynamicAtmosphere = textures;
      this.dynamicProgram = program;
      this.activeAtmosphere = textures;
      this.program = program;
      this.canvas.dataset.atmosphere = coefficients;
      this.uniforms = Object.fromEntries(UNIFORM_NAMES.map(name => [name,gl.getUniformLocation(program!,name)]));
      textures = null;
      program = null;
      this.onAtmosphereStatus?.("");
      this.requestRender();
    } catch (error) {
      if (revision === this.atmosphereRevision && !this.disposed) this.onAtmosphereStatus?.(error instanceof Error ? error.message : String(error));
    } finally {
      textures?.forEach(texture => gl.deleteTexture(texture));
      if (program) gl.deleteProgram(program);
    }
  }
  private onVisibility = () => { this.last = 0; this.requestRender(); };
  private requestRender() {
    if (this.disposed || !this.program || this.frame || document.hidden) return;
    this.frame = requestAnimationFrame(this.draw);
  }
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || !this.program || document.hidden) return;
    const gl = this.gl, v = this.view, u = this.uniforms;
    if (v.animate && this.last && now-this.last < 1000/24) { this.requestRender(); return; }
    if (v.animate && this.last) this.time += Math.min(0.1,(now-this.last)/1000);
    this.last = now;
    fitCanvas(this.canvas,v.quality === "high" ? 950000 : 480000);
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    for (let index = 0; index < 3; index++) {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(index === 1 ? gl.TEXTURE_3D : gl.TEXTURE_2D,this.activeAtmosphere[index]);
    }
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D,this.textures[3]);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D,this.textures[4]);
    if (v.realTime) {
      const timestamp = v.observationTime ?? Date.now();
      const key = `${Math.floor(timestamp/1000)},${v.latitude},${v.longitude},${v.altitude}`;
      if (key !== this.skyKey) {
        this.sky = calculateSky(new Date(timestamp),v.latitude,v.longitude,v.altitude*1000);
        this.skyKey = key;
      }
    }
    let camera: number[], forward: number[], right: number[], up: number[];
    if (v.mode === "orbit") {
      // Air orbits a surface target, not the planet centre. Translate its camera
      // by +6360 km on Z into the planet-centred coordinates used here.
      const offset = [Math.cos(v.pitch)*Math.cos(v.yaw),Math.cos(v.pitch)*Math.sin(v.yaw),Math.sin(v.pitch)];
      camera = offset.map(x => x*v.altitude);
      camera[2] += 6360;
      forward = offset.map(x => -x);
      right = [-Math.sin(v.yaw),Math.cos(v.yaw),0];
      up = cross(right,forward);
    } else {
      camera = [0,0,6360+v.altitude];
      forward = [Math.sin(v.yaw)*Math.cos(v.pitch),Math.cos(v.yaw)*Math.cos(v.pitch),Math.sin(v.pitch)];
      right = normalize(cross(forward,[0,0,1]));
      up = cross(right,forward);
    }
    const elevation = v.sunElevation*Math.PI/180, azimuth = v.sunAzimuth*Math.PI/180;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform1i(u.transmittance_texture,0);
    gl.uniform1i(u.scattering_texture,1);
    gl.uniform1i(u.single_mie_scattering_texture,1);
    gl.uniform1i(u.irradiance_texture,2);
    gl.uniform1i(u.uNoise,3);
    gl.uniform1i(u.uStars,4);
    gl.uniform2f(u.uResolution,this.canvas.width,this.canvas.height);
    const aspect = this.canvas.width/this.canvas.height;
    gl.uniform1f(u.uTanFov,v.realTime ? Math.tan(v.fov*Math.PI/360)*Math.max(1,1/aspect) : v.mode === "orbit" ? Math.tan(25*Math.PI/180)*Math.max(1,(16/9)/aspect) : 0.48*Math.max(1,1/aspect));
    for (const [name,value] of [["uCamera",camera],["uForward",forward],["uRight",right],["uUp",up]] as const) gl.uniform3fv(u[name],value);
    const sky = v.realTime ? this.sky : null;
    gl.uniform1i(u.uRealTime,sky ? 1 : 0);
    gl.uniform1f(u.uSunRadius,sky?.sunRadius ?? 0.004675);
    gl.uniform1f(u.uSolarScale,sky?.solarScale ?? 1);
    gl.uniform1f(u.uConstellations,v.constellations ? 1 : 0);
    if (sky) {
      gl.uniform3fv(u.uSun,sky.sunDirection);
      gl.uniform3fv(u.uMoon,sky.moonDirection);
      gl.uniform3fv(u.uMoonSun,sky.moonSunDirection);
      gl.uniform1f(u.uMoonRadius,sky.moonRadius);
      gl.uniformMatrix3fv(u.uLocalToEquatorial,false,sky.localToEquatorial);
      this.canvas.dataset.skyTime = sky.date.toISOString();
      this.canvas.dataset.sunAltitude = String(sky.sun.altitude);
      this.canvas.dataset.moonFraction = String(sky.moonFraction);
    } else gl.uniform3f(u.uSun,Math.sin(azimuth)*Math.cos(elevation),Math.cos(azimuth)*Math.cos(elevation),Math.sin(elevation));
    gl.uniform1f(u.uCoverage,v.coverage);
    gl.uniform1f(u.uDensity,v.density);
    gl.uniform1f(u.uExposure,v.exposure);
    gl.uniform1f(u.uTime,this.time);
    gl.uniform1i(u.uSteps,v.quality === "high" ? 64 : 36);
    gl.drawArrays(gl.TRIANGLES,0,3);
    this.canvas.dataset.frames = String(++this.frames);
    if (v.animate) this.requestRender();
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.atmosphereRevision++;
    clearTimeout(this.atmosphereTimer);
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange",this.onVisibility);
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.dynamicAtmosphere.forEach(texture => this.gl.deleteTexture(texture));
    if (this.dynamicProgram) this.gl.deleteProgram(this.dynamicProgram);
    if (this.baseProgram) this.gl.deleteProgram(this.baseProgram);
    this.gl.deleteVertexArray(this.vao);
  }
}
