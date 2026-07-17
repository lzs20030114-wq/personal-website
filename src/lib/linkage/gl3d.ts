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
uniform vec2 uPan;
varying float vLam;
uniform vec3 uLight;
void main() {
  vec3 world = uModelR * aPos + uModelT;
  vec3 q = uView * (world - uPivot);
  gl_Position = vec4((q.x * uScale + uPan.x) / uHalf.x, -(q.y * uScale + uPan.y) / uHalf.y, -q.z * uDepthK, 1.0);
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

// TPU 连接件双骨蒙皮（榫卯插接修正，2026-07-11；v7.2 换螺旋插值）：
// 顶点在骨 A（站 g）局部系，骨 B 局部 = A 局部 − (dy,0,0)。相对运动在 CPU 分解
// 为螺旋（轴 k̂ 过点 c、转角 θ、沿轴平移 pitch——jointScrew），顶点按 w 比例
// 刚性旋转/平移：每个截面整体转动、不缩水，w 沿臂线性 → 等曲率圆弧 =
// 恒弯矩梁的真实形状。v7.1 的位置线性混合出来是弦 + 中部软折（用户否决）。
const SKIN_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aW;
uniform mat3 uRA;
uniform vec3 uTA;
uniform vec3 uAxis;
uniform vec3 uCen;
uniform float uTheta;
uniform float uPitch;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
uniform vec2 uPan;
varying float vLam;
uniform vec3 uLight;
void main() {
  float ang = uTheta * aW;
  float c = cos(ang);
  float s = sin(ang);
  vec3 d = aPos - uCen;
  vec3 p = uCen + d * c + cross(uAxis, d) * s + uAxis * (dot(uAxis, d) * (1.0 - c) + uPitch * aW);
  vec3 world = uRA * p + uTA;
  vec3 q = uView * (world - uPivot);
  gl_Position = vec4((q.x * uScale + uPan.x) / uHalf.x, -(q.y * uScale + uPan.y) / uHalf.y, -q.z * uDepthK, 1.0);
  vec3 n = aNrm * c + cross(uAxis, aNrm) * s + uAxis * (dot(uAxis, aNrm) * (1.0 - c));
  vec3 nv = uView * (uRA * n);
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
uniform vec2 uPan;
void main() {
  vec3 q = uView * (aPos - uPivot);
  gl_Position = vec4((q.x * uScale + uPan.x) / uHalf.x, -(q.y * uScale + uPan.y) / uHalf.y, -q.z * uDepthK - uDepthBias, 1.0);
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

type Pt = readonly [number, number, number];

/** 骨 A→骨 B 相对运动的螺旋分解（A 局部系）。世界映射约定：
 *  骨 A：world = RA·p + oA；骨 B：world = RB·(p − dy·x̂) + oB（p 为 A 局部静息坐标）。
 *  返回螺旋：绕过点 c 的单位轴 k̂ 转 θ，再沿 k̂ 平移 pitch——w 比例应用即
 *  截面刚性插值（等曲率弧）。θ≈0 退化为纯平移（axis = 平移方向）。 */
export interface ScrewParams {
  axis: Pt;
  cen: Pt;
  theta: number;
  pitch: number;
}

export function jointScrew(frA: CellFrame, frB: CellFrame, dy: number): ScrewParams {
  // RM = RAᵀ·RB（列 = A 基底下的 B 基向量）
  const uu = frA.ux * frB.ux + frA.uy * frB.uy + frA.uz * frB.uz;
  const ue = frA.ux * frB.ex + frA.uy * frB.ey + frA.uz * frB.ez;
  const uf = frA.ux * frB.fx + frA.uy * frB.fy + frA.uz * frB.fz;
  const eu = frA.ex * frB.ux + frA.ey * frB.uy + frA.ez * frB.uz;
  const ee = frA.ex * frB.ex + frA.ey * frB.ey + frA.ez * frB.ez;
  const ef = frA.ex * frB.fx + frA.ey * frB.fy + frA.ez * frB.fz;
  const fu = frA.fx * frB.ux + frA.fy * frB.uy + frA.fz * frB.uz;
  const fe = frA.fx * frB.ex + frA.fy * frB.ey + frA.fz * frB.ez;
  const ff = frA.fx * frB.fx + frA.fy * frB.fy + frA.fz * frB.fz;
  // tN = RAᵀ·(oB − oA) − RM·(dy,0,0)
  const vx = frB.o.x - frA.o.x;
  const vy = frB.o.y - frA.o.y;
  const vz = frB.o.z - frA.o.z;
  const tx = frA.ux * vx + frA.uy * vy + frA.uz * vz - dy * uu;
  const ty = frA.ex * vx + frA.ey * vy + frA.ez * vz - dy * eu;
  const tz = frA.fx * vx + frA.fy * vy + frA.fz * vz - dy * fu;
  // 轴角：raw = 2 sinθ · k̂
  const rx = fe - ef;
  const ry = uf - fu;
  const rz = eu - ue;
  const rl = Math.hypot(rx, ry, rz);
  const theta = Math.atan2(rl / 2, (uu + ee + ff - 1) / 2);
  if (rl < 1e-9 || theta < 1e-6) {
    // 纯平移（静息/未弯）：螺旋退化——轴取平移方向，θ=0
    const tl = Math.hypot(tx, ty, tz);
    const axis: Pt = tl > 1e-12 ? [tx / tl, ty / tl, tz / tl] : [1, 0, 0];
    return { axis, cen: [0, 0, 0], theta: 0, pitch: tl };
  }
  const kx = rx / rl, ky = ry / rl, kz = rz / rl;
  const pitch = tx * kx + ty * ky + tz * kz; // 沿轴平移（扭转分量）
  const px = tx - pitch * kx, py = ty - pitch * ky, pz = tz - pitch * kz; // t⊥
  // (I − RM)·c = t⊥，取 c⊥k̂：c = ½(t⊥ + cot(θ/2)·k̂×t⊥)
  const cot = Math.cos(theta / 2) / Math.sin(theta / 2);
  const xx = ky * pz - kz * py;
  const xy = kz * px - kx * pz;
  const xz = kx * py - ky * px;
  return {
    axis: [kx, ky, kz],
    cen: [(px + cot * xx) / 2, (py + cot * xy) / 2, (pz + cot * xz) / 2],
    theta,
    pitch,
  };
}

/** 蒙皮版烘焙：附加骨 B 权重 w——插接段恒 0/1，裸露带**线性** ramp（配合
 *  螺旋插值 = 等曲率圆弧，恒弯矩梁的真实形状；v7.1 smoothstep 曲率集中在
 *  中部读作软折，废除）。**关键：先沿臂向细分**——源网格侧壁常是通长大面
 *  （中间无顶点），GPU 三角形内部只线性插值，不细分则连接件渲染成直弦、
 *  弯角全挤到与盒的接口处（用户实测否决）。切到 1/8 带宽。步长 7 float。 */
export function bakeSkinned(
  verts: Float32Array,
  idx: Uint16Array | Uint32Array,
  b0: number,
  b1: number,
): Float32Array {
  const span = b1 - b0 || 1;
  const maxAx = span / 8;
  // 细分：ax 跨度超限且与裸露带相交的边取中点对分（带外 w 恒定 = 刚性，直的没错）
  const done: Pt[][] = [];
  const stack: Pt[][] = [];
  for (let t = 0; t < idx.length / 3; t++) {
    const tri: Pt[] = [];
    for (let v = 0; v < 3; v++) {
      const i = idx[t * 3 + v] * 3;
      tri.push([verts[i], verts[i + 1], verts[i + 2]]);
    }
    stack.push(tri);
  }
  while (stack.length) {
    const t = stack.pop() as Pt[];
    let e = -1;
    let best = maxAx;
    for (let i = 0; i < 3; i++) {
      const p = t[i];
      const q = t[(i + 1) % 3];
      const lo = Math.min(p[0], q[0]);
      const hi = Math.max(p[0], q[0]);
      if (hi - lo > best && hi > b0 && lo < b1) {
        best = hi - lo;
        e = i;
      }
    }
    if (e < 0) {
      done.push(t);
      continue;
    }
    const p = t[e];
    const q = t[(e + 1) % 3];
    const r = t[(e + 2) % 3];
    const m: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    stack.push([p, m, r], [m, q, r]);
  }
  const out = new Float32Array(done.length * 3 * 7);
  let k = 0;
  for (const [a, b, c] of done) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const [px, py, pz] of [a, b, c]) {
      out[k++] = px; out[k++] = py; out[k++] = pz;
      out[k++] = nx; out[k++] = ny; out[k++] = nz;
      out[k++] = Math.min(1, Math.max(0, (px - b0) / span));
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
  private cam: OrbitCamera | null = null;

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
    this.cam = cam;
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
      gl.uniform2f(gl.getUniformLocation(prog, 'uPan'), cam.pan.x, cam.pan.y);
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
   *  dy = 静息站间距——骨 B 局部坐标 = 骨 A 局部 − (dy,0,0)）。
   *  相对运动 CPU 螺旋分解（jointScrew），顶点着色器按 w 比例刚性应用。 */
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
    const s = jointScrew(frA, frB, dy);
    gl.uniform3f(gl.getUniformLocation(this.skinProg, 'uAxis'), s.axis[0], s.axis[1], s.axis[2]);
    gl.uniform3f(gl.getUniformLocation(this.skinProg, 'uCen'), s.cen[0], s.cen[1], s.cen[2]);
    gl.uniform1f(gl.getUniformLocation(this.skinProg, 'uTheta'), s.theta);
    gl.uniform1f(gl.getUniformLocation(this.skinProg, 'uPitch'), s.pitch);
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

  /** 世界坐标圆点集（关节销等）：屏幕朝向公告牌圆盘、平色（线条程序 +
   *  TRIANGLES 扇），半径为世界单位、参与深度遮挡。2026-07-17 五环线框渲染
   *  拍板新增（板件改三角线条 + 关节圆点，网格着色路径画点会发浅灰）。 */
  drawDots(pts: ReadonlyArray<Vec3>, radius: number, color: [number, number, number], bias = 0.006): void {
    if (!pts.length || !this.cam) return;
    const m = this.cam.matrix;
    // 相机矩阵列 = 屏幕轴的世界方向（M 行主序，view = M·p → 列 i = M^T·e_i）
    const ax = { x: m[0], y: m[3], z: m[6] };
    const ay = { x: m[1], y: m[4], z: m[7] };
    const SEG = 10;
    const arr = new Float32Array(pts.length * SEG * 9);
    let k = 0;
    for (const p of pts) {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i * 2 * Math.PI) / SEG;
        const a1 = ((i + 1) * 2 * Math.PI) / SEG;
        arr[k++] = p.x; arr[k++] = p.y; arr[k++] = p.z;
        for (const a of [a0, a1]) {
          const c = Math.cos(a) * radius;
          const s = Math.sin(a) * radius;
          arr[k++] = p.x + ax.x * c + ay.x * s;
          arr[k++] = p.y + ax.y * c + ay.y * s;
          arr[k++] = p.z + ax.z * c + ay.z * s;
        }
      }
    }
    const gl = this.gl;
    gl.useProgram(this.lineProg);
    gl.uniform3f(gl.getUniformLocation(this.lineProg, 'uColor'), color[0], color[1], color[2]);
    gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uDepthBias'), bias);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    const aPos = gl.getAttribLocation(this.lineProg, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
    gl.drawArrays(gl.TRIANGLES, 0, pts.length * SEG * 3);
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
