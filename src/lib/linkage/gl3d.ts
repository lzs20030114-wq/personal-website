import type { Vec3 } from './solver3d';
import type { OrbitCamera } from './camera3d';

// 零依赖裸 WebGL 平面着色渲染器（立体求解器 spec 渲染 v5——WebGL 解锁，
// 用户拍板 2026-07-10：SVG 画家算法对互穿零件无像素级正确遮挡）。
// 风格延续纸墨哑光：视空间光源、|n·L| 明暗、深度测试给出物理遮挡。
// 仅服务 3D 研究线台架；2D 连杆渲染仍守 SVG 红线（LINKAGE_SPEC §1.3）。

export interface CellFrame {
  o: Vec3;
  ux: number; uy: number; uz: number;
  ex: number; ey: number; ez: number;
  fx: number; fy: number; fz: number;
}

const MESH_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
uniform mat3 uModelR;
uniform vec3 uModelT;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
varying float vLam;
uniform vec3 uLight;
void main() {
  vec3 world = uModelR * aPos + uModelT;
  vec3 q = uView * (world - uPivot);
  gl_Position = vec4(q.x * uScale / uHalf.x, -q.y * uScale / uHalf.y, -q.z * uDepthK, 1.0);
  vec3 nv = uView * (uModelR * aNrm);
  vLam = abs(dot(normalize(nv), uLight));
}`;

const MESH_FS = `
precision mediump float;
varying float vLam;
uniform vec3 uDark;
uniform vec3 uLite;
void main() {
  gl_FragColor = vec4(mix(uDark, uLite, 0.12 + 0.88 * vLam), 1.0);
}`;

// TPU 连接件双骨蒙皮（榫卯插接修正，2026-07-11）：顶点在骨 A（站 g）局部系，
// 骨 B（站 g+1）局部 = A 局部 − (uDy,0,0)（静息各站同向，只差沿臂间距）。
// w=0/1 = 插接段随盒刚动（榫卯不分离），中段平滑过渡 = 裸露 TPU 吸收弯曲。
const SKIN_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aW;
uniform mat3 uRA;
uniform vec3 uTA;
uniform mat3 uRB;
uniform vec3 uTB;
uniform float uDy;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
varying float vLam;
uniform vec3 uLight;
void main() {
  vec3 pb = vec3(aPos.x - uDy, aPos.y, aPos.z);
  vec3 world = mix(uRA * aPos + uTA, uRB * pb + uTB, aW);
  vec3 q = uView * (world - uPivot);
  gl_Position = vec4(q.x * uScale / uHalf.x, -q.y * uScale / uHalf.y, -q.z * uDepthK, 1.0);
  vec3 nv = uView * mix(uRA * aNrm, uRB * aNrm, aW);
  vLam = abs(dot(normalize(nv), uLight));
}`;

const LINE_VS = `
attribute vec3 aPos;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
uniform float uDepthBias;
void main() {
  vec3 q = uView * (aPos - uPivot);
  gl_Position = vec4(q.x * uScale / uHalf.x, -q.y * uScale / uHalf.y, -q.z * uDepthK - uDepthBias, 1.0);
}`;

const LINE_FS = `
precision mediump float;
uniform vec3 uColor;
void main() { gl_FragColor = vec4(uColor, 1.0); }`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type) as WebGLShader;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram() as WebGLProgram;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
  }
  return p;
}

/** 索引网格 → 平面着色顶点流（逐面复制顶点、烘焙面法向；局部系坐标）。 */
export function bakeIndexed(verts: Float32Array, idx: Uint16Array | Uint32Array): Float32Array {
  const nTri = idx.length / 3;
  const out = new Float32Array(nTri * 3 * 6);
  let k = 0;
  for (let t = 0; t < nTri; t++) {
    const i0 = idx[t * 3] * 3;
    const i1 = idx[t * 3 + 1] * 3;
    const i2 = idx[t * 3 + 2] * 3;
    const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
    const bx = verts[i1], by = verts[i1 + 1], bz = verts[i1 + 2];
    const cx = verts[i2], cy = verts[i2 + 1], cz = verts[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] as const) {
      out[k++] = px; out[k++] = py; out[k++] = pz;
      out[k++] = nx; out[k++] = ny; out[k++] = nz;
    }
  }
  return out;
}

/** 蒙皮版烘焙：同 bakeIndexed，另按顶点沿臂坐标 ax 附加骨 B 权重
 *  （w = smoothstep(b0, b1, ax)：插接段 0/1，裸露带平滑过渡）。步长 7 float。 */
export function bakeSkinned(
  verts: Float32Array,
  idx: Uint16Array | Uint32Array,
  b0: number,
  b1: number,
): Float32Array {
  const nTri = idx.length / 3;
  const out = new Float32Array(nTri * 3 * 7);
  const span = b1 - b0 || 1;
  let k = 0;
  for (let t = 0; t < nTri; t++) {
    const i0 = idx[t * 3] * 3;
    const i1 = idx[t * 3 + 1] * 3;
    const i2 = idx[t * 3 + 2] * 3;
    const ax = verts[i0], ay = verts[i0 + 1], az = verts[i0 + 2];
    const bx = verts[i1], by = verts[i1 + 1], bz = verts[i1 + 2];
    const cx = verts[i2], cy = verts[i2 + 1], cz = verts[i2 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] as const) {
      const s = Math.min(1, Math.max(0, (px - b0) / span));
      out[k++] = px; out[k++] = py; out[k++] = pz;
      out[k++] = nx; out[k++] = ny; out[k++] = nz;
      out[k++] = s * s * (3 - 2 * s);
    }
  }
  return out;
}

export class FlatRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly meshProg: WebGLProgram;
  private readonly skinProg: WebGLProgram;
  private readonly lineProg: WebGLProgram;
  private readonly meshes = new Map<string, { buf: WebGLBuffer; n: number }>();
  private readonly skins = new Map<string, { buf: WebGLBuffer; n: number }>();
  private readonly lineBuf: WebGLBuffer;
  private readonly halfW: number;
  private readonly halfH: number;
  private readonly depthK: number;

  /** logicalW/H = 视口逻辑单位（对齐旧 viewBox 700×520）；depthRange = 世界深度半径 */
  constructor(canvas: HTMLCanvasElement, logicalW = 700, logicalH = 520, depthRange = 900) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true }) as WebGLRenderingContext;
    if (!gl) throw new Error('WebGL 不可用');
    this.gl = gl;
    this.meshProg = link(gl, MESH_VS, MESH_FS);
    this.skinProg = link(gl, SKIN_VS, MESH_FS);
    this.lineProg = link(gl, LINE_VS, LINE_FS);
    this.lineBuf = gl.createBuffer() as WebGLBuffer;
    this.halfW = logicalW / 2;
    this.halfH = logicalH / 2;
    this.depthK = 1 / depthRange;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 0); // 透明底，纸色由页面背景给
  }

  addMesh(id: string, data: Float32Array): void {
    const gl = this.gl;
    const buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.meshes.set(id, { buf, n: data.length / 6 });
  }

  /** 蒙皮网格（bakeSkinned 产物，步长 7 float） */
  addSkinnedMesh(id: string, data: Float32Array): void {
    const gl = this.gl;
    const buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.skins.set(id, { buf, n: data.length / 7 });
  }

  beginFrame(cam: OrbitCamera): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const prog of [this.meshProg, this.skinProg, this.lineProg]) {
      gl.useProgram(prog);
      gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'uView'), false, transpose3(cam.matrix));
      const pv = cam.pivotPoint;
      gl.uniform3f(gl.getUniformLocation(prog, 'uPivot'), pv.x, pv.y, pv.z);
      gl.uniform2f(gl.getUniformLocation(prog, 'uHalf'), this.halfW, this.halfH);
      gl.uniform1f(gl.getUniformLocation(prog, 'uScale'), cam.viewScale);
      gl.uniform1f(gl.getUniformLocation(prog, 'uDepthK'), this.depthK);
    }
    for (const prog of [this.meshProg, this.skinProg]) {
      gl.useProgram(prog);
      gl.uniform3f(gl.getUniformLocation(prog, 'uLight'), -0.42, -0.52, 0.74);
      gl.uniform3f(gl.getUniformLocation(prog, 'uDark'), 0.29, 0.29, 0.27);
      gl.uniform3f(gl.getUniformLocation(prog, 'uLite'), 0.95, 0.95, 0.92);
    }
  }

  drawMesh(id: string, fr: CellFrame): void {
    const gl = this.gl;
    const m = this.meshes.get(id);
    if (!m) return;
    gl.useProgram(this.meshProg);
    // 列 = (û, ê1, ê2)：world = R·local + o（uniformMatrix3fv 按列主序）
    gl.uniformMatrix3fv(gl.getUniformLocation(this.meshProg, 'uModelR'), false, [
      fr.ux, fr.uy, fr.uz,
      fr.ex, fr.ey, fr.ez,
      fr.fx, fr.fy, fr.fz,
    ]);
    gl.uniform3f(gl.getUniformLocation(this.meshProg, 'uModelT'), fr.o.x, fr.o.y, fr.o.z);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = gl.getAttribLocation(this.meshProg, 'aPos');
    const aNrm = gl.getAttribLocation(this.meshProg, 'aNrm');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  }

  /** TPU 连接件：双骨蒙皮绘制（frA = 站 g 刚架，frB = 站 g+1 刚架，
   *  dy = 静息站间距——骨 B 局部坐标 = 骨 A 局部 − (dy,0,0)）。 */
  drawSkinned(id: string, frA: CellFrame, frB: CellFrame, dy: number): void {
    const gl = this.gl;
    const m = this.skins.get(id);
    if (!m) return;
    gl.useProgram(this.skinProg);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.skinProg, 'uRA'), false, [
      frA.ux, frA.uy, frA.uz,
      frA.ex, frA.ey, frA.ez,
      frA.fx, frA.fy, frA.fz,
    ]);
    gl.uniform3f(gl.getUniformLocation(this.skinProg, 'uTA'), frA.o.x, frA.o.y, frA.o.z);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.skinProg, 'uRB'), false, [
      frB.ux, frB.uy, frB.uz,
      frB.ex, frB.ey, frB.ez,
      frB.fx, frB.fy, frB.fz,
    ]);
    gl.uniform3f(gl.getUniformLocation(this.skinProg, 'uTB'), frB.o.x, frB.o.y, frB.o.z);
    gl.uniform1f(gl.getUniformLocation(this.skinProg, 'uDy'), dy);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = gl.getAttribLocation(this.skinProg, 'aPos');
    const aNrm = gl.getAttribLocation(this.skinProg, 'aNrm');
    const aW = gl.getAttribLocation(this.skinProg, 'aW');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.enableVertexAttribArray(aW);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 28, 12);
    gl.vertexAttribPointer(aW, 1, gl.FLOAT, false, 28, 24);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
  }

  /** 世界坐标线段集（深度测试参与遮挡；bias 防与体面 z-fighting）。 */
  drawLines(segs: ReadonlyArray<{ a: Vec3; b: Vec3 }>, color: [number, number, number], bias = 0.004): void {
    if (!segs.length) return;
    const gl = this.gl;
    const arr = new Float32Array(segs.length * 6);
    let k = 0;
    for (const s of segs) {
      arr[k++] = s.a.x; arr[k++] = s.a.y; arr[k++] = s.a.z;
      arr[k++] = s.b.x; arr[k++] = s.b.y; arr[k++] = s.b.z;
    }
    gl.useProgram(this.lineProg);
    gl.uniform3f(gl.getUniformLocation(this.lineProg, 'uColor'), color[0], color[1], color[2]);
    gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uDepthBias'), bias);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.lineProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
    gl.drawArrays(gl.LINES, 0, segs.length * 2);
  }
}

/** 行主序 3×3 → WebGL 列主序 */
function transpose3(m: readonly number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
