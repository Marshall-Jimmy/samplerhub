/**
 * WebGL 波形渲染器 - GPU 加速大规模波形绘制
 * 用于波形视图（WaveformSampleRow）等需要同时渲染大量波形的场景
 * 优势：单次 draw call 绘制整条波形，避免逐条 Canvas 2D 绘制瓶颈
 */

const VERTEX_SHADER = `
  attribute vec2 a_position;
  uniform vec4 u_color;
  varying vec4 v_color;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_color = u_color;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  varying vec4 v_color;

  void main() {
    gl_FragColor = v_color;
  }
`;

let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let colorLocation: WebGLUniformLocation | null = null;

function initGL(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  if (gl) return gl;
  gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  // 编译着色器
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('WebGL program link failed:', gl.getProgramInfoLog(program));
    return null;
  }

  positionBuffer = gl.createBuffer();
  colorLocation = gl.getUniformLocation(program, 'u_color');

  return gl;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * 使用 WebGL 渲染波形
 * @param canvas 目标 canvas
 * @param waveform 波形数据 (0-1)
 * @param options 渲染选项
 */
export function drawWaveformGL(
  canvas: HTMLCanvasElement,
  waveform: number[],
  options: {
    accentColor?: [number, number, number, number];
    unplayedColor?: [number, number, number, number];
    progressX?: number;
    width?: number;
    height?: number;
  } = {}
): boolean {
  const ctx = initGL(canvas);
  if (!ctx || !program || !positionBuffer) return false;

  const {
    accentColor = [0.39, 0.40, 0.95, 1.0],
    unplayedColor = [1.0, 1.0, 1.0, 0.12],
    progressX = 0,
    width = canvas.clientWidth,
    height = canvas.clientHeight,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  ctx.viewport(0, 0, canvas.width, canvas.height);
  ctx.clearColor(0, 0, 0, 0);
  ctx.clear(ctx.COLOR_BUFFER_BIT);
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);

  ctx.useProgram(program);

  const barCount = waveform.length;
  if (barCount === 0) return true;

  const barWidth = 2.0 / barCount;
  const progressN = (progressX / width) * 2.0 - 1.0; // 归一化到 [-1, 1]

  // 构建顶点数据：每个波形条是一个矩形（2个三角形 = 6个顶点）
  const vertices: number[] = [];
  const halfH = 0.8; // 波形高度占 canvas 的比例

  for (let i = 0; i < barCount; i++) {
    const x = -1.0 + i * barWidth;
    const amplitude = waveform[i];
    const barH = Math.max(0.005, amplitude * halfH);

    // 两个三角形组成矩形
    // 上半部分
    vertices.push(
      x, -barH,
      x + barWidth * 0.55, -barH,
      x, barH,
      x, barH,
      x + barWidth * 0.55, -barH,
      x + barWidth * 0.55, barH
    );
  }

  // 上传顶点数据
  ctx.bindBuffer(ctx.ARRAY_BUFFER, positionBuffer);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(vertices), ctx.DYNAMIC_DRAW);

  const posLoc = ctx.getAttribLocation(program, 'a_position');
  ctx.enableVertexAttribArray(posLoc);
  ctx.vertexAttribPointer(posLoc, 2, ctx.FLOAT, false, 0, 0);

  // 先绘制未播放部分
  ctx.uniform4fv(colorLocation!, unplayedColor);
  ctx.drawArrays(ctx.TRIANGLES, 0, vertices.length / 2);

  // 如果有播放进度，裁剪绘制已播放部分
  if (progressX > 0) {
    ctx.uniform4fv(colorLocation!, accentColor);
    // 使用 scissor test 裁剪已播放区域
    ctx.enable(ctx.SCISSOR_TEST);
    ctx.scissor(0, 0, Math.round(progressX * dpr), canvas.height);
    ctx.drawArrays(ctx.TRIANGLES, 0, vertices.length / 2);
    ctx.disable(ctx.SCISSOR_TEST);
  }

  return true;
}

/**
 * 批量渲染多条波形到同一 canvas（用于波形视图列表）
 * @param canvas 目标 canvas
 * @param waveforms 波形数据数组
 * @param rowHeight 每行高度（像素）
 * @param options 渲染选项
 */
export function drawWaveformBatchGL(
  canvas: HTMLCanvasElement,
  waveforms: { data: number[]; progressX?: number }[],
  rowHeight: number,
  options: {
    accentColor?: [number, number, number, number];
    unplayedColor?: [number, number, number, number];
    scrollOffset?: number;
  } = {}
): boolean {
  const ctx = initGL(canvas);
  if (!ctx || !program || !positionBuffer) return false;

  const {
    accentColor = [0.39, 0.40, 0.95, 1.0],
    unplayedColor = [1.0, 1.0, 1.0, 0.12],
    scrollOffset = 0,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  ctx.viewport(0, 0, canvas.width, canvas.height);
  ctx.clearColor(0, 0, 0, 0);
  ctx.clear(ctx.COLOR_BUFFER_BIT);
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA);
  ctx.useProgram(program);

  // 计算可见范围
  const firstVisible = Math.floor(scrollOffset / rowHeight);
  const lastVisible = Math.min(waveforms.length, Math.ceil((scrollOffset + h) / rowHeight) + 1);

  for (let row = firstVisible; row < lastVisible; row++) {
    const { data, progressX = 0 } = waveforms[row];
    if (data.length === 0) continue;

    // 计算该行在 canvas 中的位置
    const rowTop = (row * rowHeight - scrollOffset) / h;
    const rowBottom = ((row + 1) * rowHeight - scrollOffset) / h;
    const rowCenterY = (rowTop + rowBottom) / 2;
    const rowH = (rowBottom - rowTop) * 0.7; // 波形占行高的 70%

    const barCount = data.length;
    const barWidth = 2.0 / barCount;

    const vertices: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const x = -1.0 + i * barWidth;
      const amplitude = data[i];
      const barH = Math.max(0.002, amplitude * rowH / 2);

      const top = rowCenterY * 2 - 1 + barH;
      const bottom = rowCenterY * 2 - 1 - barH;

      vertices.push(
        x, bottom,
        x + barWidth * 0.55, bottom,
        x, top,
        x, top,
        x + barWidth * 0.55, bottom,
        x + barWidth * 0.55, top
      );
    }

    ctx.bindBuffer(ctx.ARRAY_BUFFER, positionBuffer);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(vertices), ctx.DYNAMIC_DRAW);

    const posLoc = ctx.getAttribLocation(program, 'a_position');
    ctx.enableVertexAttribArray(posLoc);
    ctx.vertexAttribPointer(posLoc, 2, ctx.FLOAT, false, 0, 0);

    // 未播放部分
    ctx.uniform4fv(colorLocation!, unplayedColor);
    ctx.drawArrays(ctx.TRIANGLES, 0, vertices.length / 2);

    // 已播放部分
    if (progressX > 0) {
      ctx.uniform4fv(colorLocation!, accentColor);
      ctx.enable(ctx.SCISSOR_TEST);
      const scissorY = Math.round((1 - rowBottom) * canvas.height);
      const scissorH = Math.round((rowBottom - rowTop) * canvas.height);
      ctx.scissor(0, scissorY, Math.round(progressX * dpr), scissorH);
      ctx.drawArrays(ctx.TRIANGLES, 0, vertices.length / 2);
      ctx.disable(ctx.SCISSOR_TEST);
    }
  }

  return true;
}

/** 清理 WebGL 资源 */
export function cleanupGL() {
  if (gl) {
    if (program) gl.deleteProgram(program);
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    gl = null;
    program = null;
    positionBuffer = null;
  }
}
