import { createProgram } from "../core/fullscreenGL";

// The shipped textures contain Bruneton's full multiple-scattering solution.
// Edited coefficients rebuild transmittance, single Rayleigh/Mie scattering,
// and first-order sky irradiance from the same model equations on the GPU.
export function atmosphereSource(base: string, rayleigh: number, mie: number) {
  const coefficients = [
    [/vec3\(0\.005802,0\.013558,0\.033100\)/, [0.005802,0.013558,0.033100].map(x => (x * rayleigh).toFixed(7))],
    [/vec3\(0\.003996,0\.003996,0\.003996\)/, Array(3).fill((0.003996 * mie).toFixed(7))],
    [/vec3\(0\.004440,0\.004440,0\.004440\)/, Array(3).fill((0.004440 * mie).toFixed(7))],
  ] as const;
  let source = base;
  for (const [pattern, channels] of coefficients) {
    if (!pattern.test(source)) throw new Error("대기 산란 계수를 찾을 수 없습니다.");
    source = source.replace(pattern, `vec3(${channels.join(",")})`);
  }
  return source;
}

function makeTexture(gl: WebGL2RenderingContext, width: number, height: number, depth = 1) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("대기 텍스처 생성 실패");
  const target = depth > 1 ? gl.TEXTURE_3D : gl.TEXTURE_2D;
  gl.bindTexture(target, texture);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (depth > 1) {
    gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texStorage3D(target, 1, gl.RGBA16F, width, height, depth);
  } else gl.texStorage2D(target, 1, gl.RGBA16F, width, height);
  return texture;
}

export async function precomputeAtmosphere(gl: WebGL2RenderingContext, source: string, isCurrent: () => boolean): Promise<WebGLTexture[] | null> {
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("이 기기는 대기 LUT 계산에 필요한 부동소수점 렌더링을 지원하지 않습니다.");
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error("대기 계산 버퍼 생성 실패");
  const textures: WebGLTexture[] = [];
  const programs: WebGLProgram[] = [];
  let complete = false;
  try {
    const transmittance = makeTexture(gl,256,64); textures.push(transmittance);
    const scattering = makeTexture(gl,256,128,32); textures.push(scattering);
    const irradiance = makeTexture(gl,64,16); textures.push(irradiance);
    const deltaRayleigh = makeTexture(gl,256,128,32); textures.push(deltaRayleigh);
    const deltaMie = makeTexture(gl,256,128,32); textures.push(deltaMie);
    const transmittanceProgram = createProgram(gl, source + `
out vec4 result;
void main() { result = vec4(ComputeTransmittanceToTopAtmosphereBoundaryTexture(ATMOSPHERE,gl_FragCoord.xy),1.0); }`);
    const scatteringProgram = createProgram(gl, source + `
uniform float uLayer;
layout(location=0) out vec4 resultRayleigh;
layout(location=1) out vec4 resultMie;
layout(location=2) out vec4 resultCombined;
void main() {
  vec3 rayleigh, mie;
  ComputeSingleScatteringTexture(ATMOSPHERE,transmittance_texture,vec3(gl_FragCoord.xy,uLayer+0.5),rayleigh,mie);
  resultRayleigh = vec4(rayleigh,1.0);
  resultMie = vec4(mie,1.0);
  resultCombined = vec4(rayleigh,mie.r);
}`);
    const irradianceProgram = createProgram(gl, source + `
uniform sampler3D uDeltaRayleigh, uDeltaMie;
out vec4 result;
void main() {
  result = vec4(ComputeIndirectIrradianceTexture(ATMOSPHERE,uDeltaRayleigh,uDeltaMie,uDeltaRayleigh,gl_FragCoord.xy,1),1.0);
}`);
    programs.push(transmittanceProgram,scatteringProgram,irradianceProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,transmittance,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("대기 계산 버퍼가 완전하지 않습니다.");
    gl.viewport(0,0,256,64);
    gl.useProgram(transmittanceProgram);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.useProgram(scatteringProgram);
    gl.uniform1i(gl.getUniformLocation(scatteringProgram,"transmittance_texture"),0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D,transmittance);
    gl.viewport(0,0,256,128);
    const layerLocation = gl.getUniformLocation(scatteringProgram,"uLayer");
    for (let layer = 0; layer < 32; layer++) {
      if (!isCurrent()) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,deltaRayleigh,0,layer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,deltaMie,0,layer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT2,scattering,0,layer);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
      if (layer === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("대기 산란 버퍼가 완전하지 않습니다.");
      gl.useProgram(scatteringProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D,transmittance);
      gl.uniform1f(layerLocation,layer);
      gl.drawArrays(gl.TRIANGLES,0,3);
      if (layer % 2 === 1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }
    if (!isCurrent()) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,null,0,0);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,null,0,0);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT2,null,0,0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,irradiance,0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0,0,64,16);
    gl.useProgram(irradianceProgram);
    gl.uniform1i(gl.getUniformLocation(irradianceProgram,"uDeltaRayleigh"),0);
    gl.uniform1i(gl.getUniformLocation(irradianceProgram,"uDeltaMie"),1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D,deltaRayleigh);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D,deltaMie);
    gl.drawArrays(gl.TRIANGLES,0,3);
    if (gl.getError() !== gl.NO_ERROR) throw new Error("대기 LUT 계산 중 GPU 오류가 발생했습니다.");
    complete = true;
    return [transmittance,scattering,irradiance];
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.deleteFramebuffer(framebuffer);
    programs.forEach(program => gl.deleteProgram(program));
    if (complete) textures.slice(3).forEach(texture => gl.deleteTexture(texture));
    else textures.forEach(texture => gl.deleteTexture(texture));
  }
}
