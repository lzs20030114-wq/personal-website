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

/**
 * 同一份顶点的一处摆放：先绕世界 Y 转 yaw，再平移到 (x, y, z)。
 * yaw 的取向与 skin-solid 的 RingPlace.angle 一致（x' = x·cos − z·sin）。
 *
 * 2026-08-25（Lab.10 环阵列）加：十六个环 × 每环二十条带 = 320 处摆放，但**几何只有
 * 一份**——同一条引擎、同一半径，差别全在 (yaw, 平移) 里。逐处各传一遍顶点的话
 * 每帧要上传 320 份；改成上传一次、逐处只换 uModelR/uModelT 各画一遍，上传量降回
 * 单条带。加法式扩展：不传 places 即恒等单处，与加它之前逐位相同。
 */
export interface MeshPlace {
  yaw: number;
  x: number;
  y: number;
  z: number;
  /** 均匀缩放（默认 1）。法向在着色器里 normalize，故均匀缩放不影响明暗。 */
  s?: number;
  /**
   * 再沿世界 Y 拉伸多少倍（默认 1；2026-10-30 人猫同台立体台的伸缩吊杆加）。法向也按同一矩阵变换再 normalize，
   * 只对**竖直的柱体 / 管**是对的：侧面法向水平、端面法向竖直，竖向拉伸不改它们的方向；斜面别用。
   */
  sy?: number;
}

/** 绕世界 Y 的 yaw + 均匀缩放（+ 可选的竖向拉伸）→ WebGL 列主序 3×3（与 placePoint 同取向）；sy 省略 = 原样 */
function yawColMajor(yaw: number, s = 1, sy = 1): number[] {
  const c = Math.cos(yaw) * s;
  const sn = Math.sin(yaw) * s;
  return [c, 0, sn, 0, s * sy, 0, -sn, 0, c];
}
const IDENT3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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
uniform float uPerspD;
uniform vec2 uPan;
varying float vLam;
uniform vec3 uLight;
void main() {
  vec3 world = uModelR * aPos + uModelT;
  vec3 q = uView * (world - uPivot);
  float w = uPerspD > 0.0 ? 1.0 - q.z / uPerspD : 1.0;
  gl_Position = vec4((q.x * uScale + uPan.x * w) / uHalf.x, -(q.y * uScale + uPan.y * w) / uHalf.y, -q.z * uDepthK * w, w);
  vec3 nv = uView * (uModelR * aNrm);
  vLam = abs(dot(normalize(nv), uLight));
}`;

// uAlpha 默认 1.0（beginFrame 每帧置回），故实体绘制路径与加它之前逐像素相同；
// 只有显式传 alpha 的半透明绘制才会用到（2026-07-29 五环遮罩滑块新增）。
const MESH_FS = `
precision mediump float;
varying float vLam;
uniform vec3 uDark;
uniform vec3 uLite;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(mix(uDark, uLite, 0.12 + 0.88 * vLam), uAlpha);
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
uniform float uPerspD;
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
  float w = uPerspD > 0.0 ? 1.0 - q.z / uPerspD : 1.0;
  gl_Position = vec4((q.x * uScale + uPan.x * w) / uHalf.x, -(q.y * uScale + uPan.y * w) / uHalf.y, -q.z * uDepthK * w, w);
  vec3 n = aNrm * c + cross(uAxis, aNrm) * s + uAxis * (dot(uAxis, aNrm) * (1.0 - c));
  vec3 nv = uView * (uRA * n);
  vLam = abs(dot(normalize(nv), uLight));
}`;

// 半透明点阵（2026-07-29 新增）：把整片实体蒙皮换成一层点云薄纱——
// 点径 = 世界单位（随缩放变大，密度观感恒定），逐点 |n·L| 明暗 + 两端色 ramp，
// 圆形由 gl_PointCoord 裁出并羽化边缘。深度**只测不写**：点之间互不遮挡、
// 线稿透得过来，同时仍被前方实体正确挡住。
const POINT_VS = `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute float aT;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
uniform float uPerspD;
uniform vec2 uPan;
uniform vec3 uLight;
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uSize;
uniform float uPxScale;
uniform float uAlpha;
varying vec4 vCol;
void main() {
  vec3 q = uView * (aPos - uPivot);
  float w = uPerspD > 0.0 ? 1.0 - q.z / uPerspD : 1.0;
  gl_Position = vec4((q.x * uScale + uPan.x * w) / uHalf.x, -(q.y * uScale + uPan.y * w) / uHalf.y, -q.z * uDepthK * w, w);
  // gl_PointSize 是帧缓冲像素、不参与透视除法，故此处自行除 w
  gl_PointSize = clamp(uSize * uScale * uPxScale / w, 1.0, 14.0);
  // 形体主要交给**不透明度**、颜色只轻微压暗：暗底上再乘明暗会把背光的点压成
  // 灰渣（实测一片灰蒙蒙），族系色须保住
  float lam = abs(dot(normalize(uView * aNrm), uLight));
  vCol = vec4(mix(uColA, uColB, aT) * (0.74 + 0.26 * lam), uAlpha * (0.3 + 0.7 * lam));
}`;

const POINT_FS = `
precision mediump float;
varying vec4 vCol;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  gl_FragColor = vec4(vCol.rgb, vCol.a * smoothstep(0.25, 0.08, r2));
}`;

const LINE_VS = `
attribute vec3 aPos;
uniform mat3 uModelR;
uniform vec3 uModelT;
uniform mat3 uView;
uniform vec3 uPivot;
uniform vec2 uHalf;
uniform float uScale;
uniform float uDepthK;
uniform float uPerspD;
uniform float uDepthBias;
uniform vec2 uPan;
void main() {
  vec3 q = uView * (uModelR * aPos + uModelT - uPivot);
  float w = uPerspD > 0.0 ? 1.0 - q.z / uPerspD : 1.0;
  gl_Position = vec4((q.x * uScale + uPan.x * w) / uHalf.x, -(q.y * uScale + uPan.y * w) / uHalf.y, (-q.z * uDepthK - uDepthBias) * w, w);
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

const CAMERA_UNIFORMS = ['uView', 'uPivot', 'uHalf', 'uScale', 'uDepthK', 'uPerspD', 'uPan'] as const;
const MATERIAL_UNIFORMS = ['uLight', 'uDark', 'uLite', 'uAlpha'] as const;
const MESH_UNIFORMS = [...CAMERA_UNIFORMS, ...MATERIAL_UNIFORMS, 'uModelR', 'uModelT'] as const;
const SKIN_UNIFORMS = [...CAMERA_UNIFORMS, ...MATERIAL_UNIFORMS, 'uRA', 'uTA', 'uAxis', 'uCen', 'uTheta', 'uPitch'] as const;
const LINE_UNIFORMS = [...CAMERA_UNIFORMS, 'uModelR', 'uModelT', 'uColor', 'uDepthBias'] as const;
const POINT_UNIFORMS = [...CAMERA_UNIFORMS, 'uLight', 'uColA', 'uColB', 'uSize', 'uAlpha', 'uPxScale'] as const;
const MESH_ATTRIBUTES = ['aPos', 'aNrm'] as const;
const SKIN_ATTRIBUTES = ['aPos', 'aNrm', 'aW'] as const;
const LINE_ATTRIBUTES = ['aPos'] as const;
const POINT_ATTRIBUTES = ['aPos', 'aNrm', 'aT'] as const;

interface ProgramBindings<U extends readonly string[], A extends readonly string[]> {
  readonly program: WebGLProgram;
  readonly uniforms: Readonly<Record<U[number], WebGLUniformLocation | null>>;
  readonly attributes: Readonly<Record<A[number], number>>;
}

/** 链接后句柄不变；只缓存本 renderer/context 的四个程序，不跨上下文共享。 */
function bindProgram<U extends readonly string[], A extends readonly string[]>(
  gl: WebGLRenderingContext,
  vs: string,
  fs: string,
  uniforms: U,
  attributes: A,
): ProgramBindings<U, A> {
  const program = link(gl, vs, fs);
  return {
    program,
    uniforms: Object.fromEntries(uniforms.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<U[number], WebGLUniformLocation | null>,
    attributes: Object.fromEntries(attributes.map((name) => [name, gl.getAttribLocation(program, name)])) as Record<A[number], number>,
  };
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

/**
 * 两条等长折线之间的直纹带 → 点阵顶点流（步长 7 float：pos / 法向 / 横向参数 t）。
 * 纯几何、无 GL 调用，可单测。
 *
 * 取**格心** v=(j+0.5)/nv 而非等分端点：v=0/1 正落在两侧折线上，相邻两带会在
 * 共用的那条线上叠出双倍密度，且与线稿重影。t 同时用作 drawPointCloud 的两端色
 * 插值参数——一条带从 A 环色渐变到 B 环色。
 * 法向取直纹面偏导叉积（∂/∂u 中心差分，∂/∂v = B−A），退化处（两点重合）留零向量。
 */
export function bakeRuledPoints(a: ReadonlyArray<Vec3>, b: ReadonlyArray<Vec3>, nv: number): Float32Array {
  const nu = Math.min(a.length, b.length);
  if (nu < 2 || nv < 1) return new Float32Array(0);
  const out = new Float32Array(nu * nv * 7);
  let k = 0;
  for (let i = 0; i < nu; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(nu - 1, i + 1);
    for (let j = 0; j < nv; j++) {
      const v = (j + 0.5) / nv;
      const px = a[i].x + (b[i].x - a[i].x) * v;
      const py = a[i].y + (b[i].y - a[i].y) * v;
      const pz = a[i].z + (b[i].z - a[i].z) * v;
      // ∂/∂u（中心差分，同一 v 上的相邻两列）
      const ux = a[i1].x + (b[i1].x - a[i1].x) * v - (a[i0].x + (b[i0].x - a[i0].x) * v);
      const uy = a[i1].y + (b[i1].y - a[i1].y) * v - (a[i0].y + (b[i0].y - a[i0].y) * v);
      const uz = a[i1].z + (b[i1].z - a[i1].z) * v - (a[i0].z + (b[i0].z - a[i0].z) * v);
      // ∂/∂v（直纹方向，与 v 无关）
      const wx = b[i].x - a[i].x;
      const wy = b[i].y - a[i].y;
      const wz = b[i].z - a[i].z;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-9) {
        nx /= nl; ny /= nl; nz /= nl;
      } else {
        nx = 0; ny = 0; nz = 0;
      }
      out[k++] = px; out[k++] = py; out[k++] = pz;
      out[k++] = nx; out[k++] = ny; out[k++] = nz;
      out[k++] = v;
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
  private readonly meshProg: ProgramBindings<typeof MESH_UNIFORMS, typeof MESH_ATTRIBUTES>;
  private readonly skinProg: ProgramBindings<typeof SKIN_UNIFORMS, typeof SKIN_ATTRIBUTES>;
  private readonly lineProg: ProgramBindings<typeof LINE_UNIFORMS, typeof LINE_ATTRIBUTES>;
  private readonly pointProg: ProgramBindings<typeof POINT_UNIFORMS, typeof POINT_ATTRIBUTES>;
  private readonly meshes = new Map<string, { buf: WebGLBuffer; n: number }>();
  private readonly skins = new Map<string, { buf: WebGLBuffer; n: number }>();
  private readonly lineBuf: WebGLBuffer;
  private readonly dynMeshBuf: WebGLBuffer;
  private readonly pointBuf: WebGLBuffer;
  private readonly halfW: number;
  private readonly halfH: number;
  private readonly depthK: number;
  private cam: OrbitCamera | null = null;
  private perspD = 0;

  /** logicalW/H = 视口逻辑单位（对齐旧 viewBox 700×520）；depthRange = 世界深度半径 */
  constructor(canvas: HTMLCanvasElement, logicalW = 700, logicalH = 520, depthRange = 900) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true }) as WebGLRenderingContext;
    if (!gl) throw new Error('WebGL 不可用');
    this.gl = gl;
    this.meshProg = bindProgram(gl, MESH_VS, MESH_FS, MESH_UNIFORMS, MESH_ATTRIBUTES);
    this.skinProg = bindProgram(gl, SKIN_VS, MESH_FS, SKIN_UNIFORMS, SKIN_ATTRIBUTES);
    this.lineProg = bindProgram(gl, LINE_VS, LINE_FS, LINE_UNIFORMS, LINE_ATTRIBUTES);
    this.pointProg = bindProgram(gl, POINT_VS, POINT_FS, POINT_UNIFORMS, POINT_ATTRIBUTES);
    this.lineBuf = gl.createBuffer() as WebGLBuffer;
    this.dynMeshBuf = gl.createBuffer() as WebGLBuffer;
    this.pointBuf = gl.createBuffer() as WebGLBuffer;
    this.halfW = logicalW / 2;
    this.halfH = logicalH / 2;
    this.depthK = 1 / depthRange;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 0); // 透明底，纸色由页面背景给
  }

  addMesh(id: string, data: Float32Array): void {
    const gl = this.gl;
    // 同名更新只重传顶点，保留缓冲区；台架切换形态时会重复注册同一 id。
    const buf = this.meshes.get(id)?.buf ?? (gl.createBuffer() as WebGLBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.meshes.set(id, { buf, n: data.length / 6 });
  }

  /** 动态平面着色网格（世界坐标、恒等模型系；bakeIndexed 产物逐帧上传）。
   *  蒙皮等每帧变形的几何用——2026-07-17 五环台架拍板新增。
   *  dark/lite 可选：本次绘制覆盖明暗端色，画完即还原为 beginFrame 的默认
   *  （2026-07-27 加：暗底台架要「烟灰织物」压暗蒙皮，好让彩色线稿透出来；
   *   加法式扩展，不传即旧行为，现有调用点零影响）。
   *
   *  alpha 可选（2026-07-29 遮罩滑块加）：< 1 时走半透明路径——开混合、
   *  **深度只测不写**，故不遮挡其后要画的东西，但仍被先画的实体正确挡住。
   *  代价：半透明面之间无 z 排序，调用点须**自己按视深从远到近**下单。
   *  不传 = 实体路径（写深度、不混合），与加它之前逐像素相同。 */
  drawDynamicMesh(
    data: Float32Array,
    dark?: [number, number, number],
    lite?: [number, number, number],
    alpha?: number,
    places?: readonly MeshPlace[],
  ): void {
    if (!data.length) return;
    const gl = this.gl;
    gl.useProgram(this.meshProg.program);
    const blended = alpha !== undefined && alpha < 1;
    if (blended) {
      gl.uniform1f(this.meshProg.uniforms.uAlpha, alpha);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, dark[0], dark[1], dark[2]);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, lite[0], lite[1], lite[2]);
    const uR = this.meshProg.uniforms.uModelR;
    const uT = this.meshProg.uniforms.uModelT;
    gl.uniformMatrix3fv(uR, false, IDENT3);
    gl.uniform3f(uT, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynMeshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const aPos = this.meshProg.attributes.aPos;
    const aNrm = this.meshProg.attributes.aNrm;
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 24, 12);
    const nv = data.length / 6;
    // 顶点已上传：多处摆放只换两个 uniform 各画一遍（不传 places = 原来那一次恒等绘制）
    if (places && places.length) {
      for (const q of places) {
        gl.uniformMatrix3fv(uR, false, yawColMajor(q.yaw, q.s, q.sy));
        gl.uniform3f(uT, q.x, q.y, q.z);
        gl.drawArrays(gl.TRIANGLES, 0, nv);
      }
      gl.uniformMatrix3fv(uR, false, IDENT3);
      gl.uniform3f(uT, 0, 0, 0);
    } else {
      gl.drawArrays(gl.TRIANGLES, 0, nv);
    }
    // 还原默认明暗端色与状态，后续 drawMesh/drawSkinned 不受影响
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, 0.29, 0.29, 0.27);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, 0.95, 0.95, 0.92);
    if (blended) {
      gl.uniform1f(this.meshProg.uniforms.uAlpha, 1);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  /**
   * 半透明点阵（bakeRuledPoints 产物，步长 7 float；世界坐标、逐帧上传）。
   * colA/colB = 横向参数 t 的两端色；size = 点径（**世界单位**，故缩放时密度观感不变）；
   * alpha = 正对光时的不透明度上限。
   *
   * 深度**测试开、写入关**：点云内部不自遮挡（避免绘制序决定谁盖谁的闪烁），
   * 但仍被先画的实体/线条正确挡住 ⇒ 调用点应在实体与线稿**之后**画点阵。
   * 混合用 blendFuncSeparate：canvas 是 premultipliedAlpha 的透明底，
   * alpha 通道必须走 (ONE, 1−SRC_ALPHA) 才不会把底色叠花。
   * 状态用完即还原（BLEND 关、depthMask 开），后续绘制零影响。
   */
  drawPointCloud(
    data: Float32Array,
    colA: [number, number, number],
    colB: [number, number, number],
    size: number,
    alpha: number,
  ): void {
    if (!data.length) return;
    const gl = this.gl;
    const P = this.pointProg;
    gl.useProgram(P.program);
    gl.uniform3f(P.uniforms.uColA, colA[0], colA[1], colA[2]);
    gl.uniform3f(P.uniforms.uColB, colB[0], colB[1], colB[2]);
    gl.uniform1f(P.uniforms.uSize, size);
    gl.uniform1f(P.uniforms.uAlpha, alpha);
    // 逻辑单位 → 帧缓冲像素（canvas 背板通常是逻辑视口的整数倍）
    gl.uniform1f(P.uniforms.uPxScale, gl.drawingBufferWidth / (this.halfW * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const aPos = P.attributes.aPos;
    const aNrm = P.attributes.aNrm;
    const aT = P.attributes.aT;
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.enableVertexAttribArray(aT);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 28, 12);
    gl.vertexAttribPointer(aT, 1, gl.FLOAT, false, 28, 24);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, data.length / 7);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(aT);
  }

  /** 蒙皮网格（bakeSkinned 产物，步长 7 float） */
  addSkinnedMesh(id: string, data: Float32Array): void {
    const gl = this.gl;
    const buf = this.skins.get(id)?.buf ?? (gl.createBuffer() as WebGLBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.skins.set(id, { buf, n: data.length / 7 });
  }

  /** 透视投影：d = 相机到枢轴的视距（世界单位，0 = 正交，默认）。
   *  2026-07-17 五环台架拍板新增；透视强度 ∝ 模型尺度/d。 */
  setPerspective(d: number): void {
    this.perspD = d;
  }

  beginFrame(cam: OrbitCamera): void {
    this.cam = cam;
    const gl = this.gl;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const view = transpose3(cam.matrix);
    for (const prog of [this.meshProg, this.skinProg, this.lineProg, this.pointProg]) {
      gl.useProgram(prog.program);
      gl.uniformMatrix3fv(prog.uniforms.uView, false, view);
      const pv = cam.pivotPoint;
      gl.uniform3f(prog.uniforms.uPivot, pv.x, pv.y, pv.z);
      gl.uniform2f(prog.uniforms.uHalf, this.halfW, this.halfH);
      gl.uniform1f(prog.uniforms.uScale, cam.viewScale);
      gl.uniform1f(prog.uniforms.uDepthK, this.depthK);
      gl.uniform1f(prog.uniforms.uPerspD, this.perspD);
      gl.uniform2f(prog.uniforms.uPan, cam.pan.x, cam.pan.y);
    }
    for (const prog of [this.meshProg, this.skinProg, this.pointProg]) {
      gl.useProgram(prog.program);
      gl.uniform3f(prog.uniforms.uLight, -0.42, -0.52, 0.74);
    }
    for (const prog of [this.meshProg, this.skinProg]) {
      gl.useProgram(prog.program);
      gl.uniform3f(prog.uniforms.uDark, 0.29, 0.29, 0.27);
      gl.uniform3f(prog.uniforms.uLite, 0.95, 0.95, 0.92);
      gl.uniform1f(prog.uniforms.uAlpha, 1);
    }
  }

  /** 静态缓冲的刚体网格。
   *  dark/lite 可选（2026-07-29 整机台架加）：本次绘制覆盖明暗端色，画完即还原为
   *  beginFrame 的默认——整机的五环要各自带族系色，而零件是静态缓冲、不能像
   *  drawDynamicMesh 那样逐帧重传顶点。加法式扩展，不传即旧行为，现有调用点零影响。 */
  drawMesh(id: string, fr: CellFrame, dark?: [number, number, number], lite?: [number, number, number]): void {
    const gl = this.gl;
    const m = this.meshes.get(id);
    if (!m) return;
    gl.useProgram(this.meshProg.program);
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, dark[0], dark[1], dark[2]);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, lite[0], lite[1], lite[2]);
    // 列 = (û, ê1, ê2)：world = R·local + o（uniformMatrix3fv 按列主序）
    gl.uniformMatrix3fv(this.meshProg.uniforms.uModelR, false, [
      fr.ux, fr.uy, fr.uz,
      fr.ex, fr.ey, fr.ez,
      fr.fx, fr.fy, fr.fz,
    ]);
    gl.uniform3f(this.meshProg.uniforms.uModelT, fr.o.x, fr.o.y, fr.o.z);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = this.meshProg.attributes.aPos;
    const aNrm = this.meshProg.attributes.aNrm;
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 24, 12);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, 0.29, 0.29, 0.27);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, 0.95, 0.95, 0.92);
  }

  /** 静态缓冲的网格摆到多处（2026-10-21 人猫同台立体台架加）：顶点上传一次（addMesh），
   *  逐处只换模型变换各画一遍——与 drawDynamicMesh 的 places 同义，差别只在顶点不逐帧重传。
   *  那台 64 个单元 × 20 条带的形状取自预烘的关键帧，顶点是静的、变的只是哪条带用哪一帧，
   *  逐帧重传 1280 份顶点没有道理。加法式扩展：既有调用点零影响。 */
  drawMeshAt(
    id: string,
    places: readonly MeshPlace[],
    dark?: [number, number, number],
    lite?: [number, number, number],
    alpha?: number,
  ): void {
    if (!places.length) return;
    const gl = this.gl;
    const m = this.meshes.get(id);
    if (!m || !m.n) return; // 空网格（如直带子上没有扣着的内杆）不发绘制调用
    gl.useProgram(this.meshProg.program);
    // 半透明（可选，与 drawDynamicMesh 同一套：深度只测不写，调用点在实体之后、从远到近下单）；不传 = 原来的不透明绘制
    const blended = alpha !== undefined && alpha < 1;
    if (blended) {
      gl.uniform1f(this.meshProg.uniforms.uAlpha, alpha);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, dark[0], dark[1], dark[2]);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, lite[0], lite[1], lite[2]);
    const uR = this.meshProg.uniforms.uModelR;
    const uT = this.meshProg.uniforms.uModelT;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = this.meshProg.attributes.aPos;
    const aNrm = this.meshProg.attributes.aNrm;
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 24, 12);
    for (const q of places) {
      gl.uniformMatrix3fv(uR, false, yawColMajor(q.yaw, q.s, q.sy));
      gl.uniform3f(uT, q.x, q.y, q.z);
      gl.drawArrays(gl.TRIANGLES, 0, m.n);
    }
    gl.uniformMatrix3fv(uR, false, IDENT3);
    gl.uniform3f(uT, 0, 0, 0);
    if (dark) gl.uniform3f(this.meshProg.uniforms.uDark, 0.29, 0.29, 0.27);
    if (lite) gl.uniform3f(this.meshProg.uniforms.uLite, 0.95, 0.95, 0.92);
    if (blended) {
      gl.uniform1f(this.meshProg.uniforms.uAlpha, 1);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
  }

  /** 有没有这个 id 的静态网格（关键帧网格按需烘、烘过的不重传） */
  hasMesh(id: string): boolean {
    return this.meshes.has(id);
  }

  /** TPU 连接件：双骨蒙皮绘制（frA = 站 g 刚架，frB = 站 g+1 刚架，
   *  dy = 静息站间距——骨 B 局部坐标 = 骨 A 局部 − (dy,0,0)）。
   *  相对运动 CPU 螺旋分解（jointScrew），顶点着色器按 w 比例刚性应用。 */
  drawSkinned(id: string, frA: CellFrame, frB: CellFrame, dy: number): void {
    const gl = this.gl;
    const m = this.skins.get(id);
    if (!m) return;
    gl.useProgram(this.skinProg.program);
    gl.uniformMatrix3fv(this.skinProg.uniforms.uRA, false, [
      frA.ux, frA.uy, frA.uz,
      frA.ex, frA.ey, frA.ez,
      frA.fx, frA.fy, frA.fz,
    ]);
    gl.uniform3f(this.skinProg.uniforms.uTA, frA.o.x, frA.o.y, frA.o.z);
    const s = jointScrew(frA, frB, dy);
    gl.uniform3f(this.skinProg.uniforms.uAxis, s.axis[0], s.axis[1], s.axis[2]);
    gl.uniform3f(this.skinProg.uniforms.uCen, s.cen[0], s.cen[1], s.cen[2]);
    gl.uniform1f(this.skinProg.uniforms.uTheta, s.theta);
    gl.uniform1f(this.skinProg.uniforms.uPitch, s.pitch);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    const aPos = this.skinProg.attributes.aPos;
    const aNrm = this.skinProg.attributes.aNrm;
    const aW = this.skinProg.attributes.aW;
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
    // 屏幕轴的世界方向 = M 的**行**（view = M·p，正交阵 M⁻¹ = Mᵀ，Mᵀe_i = 行 i）。
    // 曾错取列：正视图因对称恰好不露馅，任意视角下圆点变侧棱（用户发现纠正）。
    const ax = { x: m[0], y: m[1], z: m[2] };
    const ay = { x: m[3], y: m[4], z: m[5] };
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
    gl.useProgram(this.lineProg.program);
    gl.uniform3f(this.lineProg.uniforms.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.lineProg.uniforms.uDepthBias, bias);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    const aPos = this.lineProg.attributes.aPos;
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
    gl.drawArrays(gl.TRIANGLES, 0, pts.length * SEG * 3);
  }

  /** 世界坐标线段集（深度测试参与遮挡；bias 防与体面 z-fighting）。
   *  places 可选（2026-08-25 环阵列加，与 drawDynamicMesh 同义）：线段按局部系给一份，
   *  逐处换模型变换各画一遍；不传 = 恒等单处，与加它之前逐位相同。 */
  drawLines(
    segs: ReadonlyArray<{ a: Vec3; b: Vec3 }>,
    color: [number, number, number],
    bias = 0.004,
    places?: readonly MeshPlace[],
  ): void {
    if (!segs.length) return;
    const gl = this.gl;
    const arr = new Float32Array(segs.length * 6);
    let k = 0;
    for (const s of segs) {
      arr[k++] = s.a.x; arr[k++] = s.a.y; arr[k++] = s.a.z;
      arr[k++] = s.b.x; arr[k++] = s.b.y; arr[k++] = s.b.z;
    }
    gl.useProgram(this.lineProg.program);
    gl.uniform3f(this.lineProg.uniforms.uColor, color[0], color[1], color[2]);
    gl.uniform1f(this.lineProg.uniforms.uDepthBias, bias);
    const uR = this.lineProg.uniforms.uModelR;
    const uT = this.lineProg.uniforms.uModelT;
    gl.uniformMatrix3fv(uR, false, IDENT3);
    gl.uniform3f(uT, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    const aPos = this.lineProg.attributes.aPos;
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 12, 0);
    if (places && places.length) {
      for (const q of places) {
        gl.uniformMatrix3fv(uR, false, yawColMajor(q.yaw, q.s, q.sy));
        gl.uniform3f(uT, q.x, q.y, q.z);
        gl.drawArrays(gl.LINES, 0, segs.length * 2);
      }
      gl.uniformMatrix3fv(uR, false, IDENT3);
      gl.uniform3f(uT, 0, 0, 0);
    } else {
      gl.drawArrays(gl.LINES, 0, segs.length * 2);
    }
  }
}

/** 行主序 3×3 → WebGL 列主序 */
function transpose3(m: readonly number[]): number[] {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
