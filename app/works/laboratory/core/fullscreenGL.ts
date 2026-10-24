export const fullscreenVertex = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createProgram(gl: WebGL2RenderingContext, fragment: string) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("WebGL shader allocation failed");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, fullscreenVertex);
  const pixel = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL program allocation failed");
  gl.attachShader(program, vertex);
  gl.attachShader(program, pixel);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(pixel);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Shader linking failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export function fitCanvas(canvas: HTMLCanvasElement, maxPixels = 1_200_000) {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(maxPixels / Math.max(1, rect.width * rect.height)));
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}
