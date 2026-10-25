/**
 * 比例模型的底层件：闭合的长方体壳 + 逐顶点法向——纯几何，零 DOM、零依赖。
 *
 * 2026-10-25 人与猫的形象重做（作者「更精细并确保建模的正确性」→ 同日改方块风）时从 figure.ts 拆出来。
 * 旧模型的长方体是逐三角各存顶点、块与块之间有共面的侧面（会闪）。这里每个零件是一个**独立的闭合壳**：
 *   - 顶点在壳内共用 ⇒ 每条边恰好被两个三角用到、方向相反（流形、无缝）；
 *   - 壳建完按有向体积统一朝外（体积为负就整壳翻面）⇒ 不靠调用方记住绕向。
 * 零件之间允许相交（关节处一节插进另一节），但**同朝向的面不许落在同一平面上又互相重叠**——那会 z 冲突闪烁；
 * 相邻零件一大一小套在一起或错开一两毫米（守门见 figure.test.ts）。台架按面法向着色（bakeIndexed），
 * 逐顶点法向只留给守门核对绕向。
 */

export type V3 = readonly [number, number, number];

export interface ShellRange {
  name: string;
  /** 顶点区间 [v0, v1)（顶点下标，不是分量下标） */
  v0: number;
  v1: number;
  /** 索引区间 [i0, i1)（索引数组下标） */
  i0: number;
  i1: number;
}

/** 一块网格：位置 / 法向（逐顶点）/ 三角索引 / 各壳的区间 */
export interface PartMesh {
  verts: Float32Array;
  normals: Float32Array;
  idx: Uint32Array;
  shells: ShellRange[];
}

export const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
export const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
export const scale = (p: V3, s: number): V3 => [p[0] * s, p[1] * s, p[2] * s];
export const dot = (p: V3, q: V3): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
export const cross = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
export const len = (p: V3): number => Math.hypot(p[0], p[1], p[2]);
export const norm = (p: V3): V3 => {
  const l = len(p) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};
export const lerp3 = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
/** q 去掉沿 t 的分量再归一（t 为单位向量）：放样截面的半轴方向用它从参考方向导出 */
export const ortho = (q: V3, t: V3): V3 => norm(sub(q, scale(t, dot(q, t))));

export class ShellBuilder {
  readonly pos: number[] = [];
  readonly idx: number[] = [];
  readonly shells: ShellRange[] = [];
  private open: { name: string; v0: number; i0: number } | null = null;

  private vert(p: V3): number {
    this.pos.push(p[0], p[1], p[2]);
    return this.pos.length / 3 - 1;
  }

  private tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  private begin(name: string): void {
    if (this.open) throw new Error(`壳 ${this.open.name} 还没收尾`);
    this.open = { name, v0: this.pos.length / 3, i0: this.idx.length };
  }

  /** 收尾：按有向体积统一朝外（负 = 整壳翻面） */
  private end(): void {
    const o = this.open;
    if (!o) throw new Error('没有打开的壳');
    this.open = null;
    const range: ShellRange = { name: o.name, v0: o.v0, v1: this.pos.length / 3, i0: o.i0, i1: this.idx.length };
    if (signedVolume(this.pos, this.idx, range) < 0)
      for (let i = range.i0; i < range.i1; i += 3) {
        const t = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = t;
      }
    this.shells.push(range);
  }

  /**
   * 长方体：中心 c，三条半轴向量（长度 = 半边长，可以斜放）。八个顶点共用、十二个三角——与别的壳一样是闭合流形。
   * 方块风的猫用它（着色走面法向，见 Rig.flat）。
   */
  box(name: string, c: V3, ax: V3, ay: V3, az: V3): this {
    this.begin(name);
    const v: number[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) v.push(this.vert(add(c, add(scale(ax, sx), add(scale(ay, sy), scale(az, sz))))));
    // 顶点号 = (x>0)·4 + (y>0)·2 + (z>0)；六个面的四边形按同一绕向列出，每条边被相邻两面反向共用
    for (const [a, b, cc, d] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
      this.tri(v[a], v[b], v[cc]);
      this.tri(v[a], v[cc], v[d]);
    }
    this.end();
    return this;
  }

  /** 对某些壳的顶点做变换（关节处的「贴面压平」、整体弯曲之类） */
  mapShells(test: (name: string) => boolean, fn: (p: V3) => V3): this {
    for (const s of this.shells) {
      if (!test(s.name)) continue;
      for (let v = s.v0; v < s.v1; v++) {
        const q = fn([this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]]);
        this.pos[v * 3] = q[0];
        this.pos[v * 3 + 1] = q[1];
        this.pos[v * 3 + 2] = q[2];
      }
    }
    return this;
  }

  /** 全部顶点变换 */
  map(fn: (p: V3) => V3): this {
    return this.mapShells(() => true, fn);
  }

  /**
   * 出网格：法向按壳逐顶点算（相邻面法向按面积加权）。`mirror = true` 表示上一步的变换是镜像
   * （比如模型系 y 向上 → 世界 y 向下），三角绕向跟着翻，保持「法向朝外」。
   */
  build(mirror = false): PartMesh {
    const verts = Float32Array.from(this.pos);
    const idx = Uint32Array.from(this.idx);
    if (mirror)
      for (let i = 0; i < idx.length; i += 3) {
        const t = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = t;
      }
    return { verts, normals: smoothNormals(verts, idx), idx, shells: this.shells.map((s) => ({ ...s })) };
  }
}

/** 壳的有向体积（散度定理；三角绕向朝外时为正） */
export function signedVolume(pos: ArrayLike<number>, idx: ArrayLike<number>, r: Pick<ShellRange, 'i0' | 'i1'>): number {
  let v = 0;
  for (let i = r.i0; i < r.i1; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v +=
      pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
      pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
      pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}

/** 逐顶点法向：相邻面法向（叉积，长度 = 两倍面积）累加再归一；孤立顶点留零向量 */
export function smoothNormals(verts: ArrayLike<number>, idx: ArrayLike<number>): Float32Array {
  const n = new Float32Array(verts.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]);
    if (l > 0) {
      n[k] /= l;
      n[k + 1] /= l;
      n[k + 2] /= l;
    }
  }
  return n;
}

/** 几块网格拼成一块（下标顺延，壳区间跟着平移） */
export function mergeParts(parts: readonly PartMesh[]): PartMesh {
  let nv = 0, ni = 0;
  for (const p of parts) {
    nv += p.verts.length;
    ni += p.idx.length;
  }
  const verts = new Float32Array(nv);
  const normals = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  const shells: ShellRange[] = [];
  let ov = 0, oi = 0;
  for (const p of parts) {
    verts.set(p.verts, ov);
    normals.set(p.normals, ov);
    const base = ov / 3;
    for (let k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + base;
    for (const s of p.shells) shells.push({ name: s.name, v0: s.v0 + base, v1: s.v1 + base, i0: s.i0 + oi, i1: s.i1 + oi });
    ov += p.verts.length;
    oi += p.idx.length;
  }
  return { verts, normals, idx, shells };
}

/**
 * 摆放：绕世界 Y 转 yaw（与 skin-solid.rotateVertsY / gl3d.MeshPlace 同一约定：x' = x·cos − z·sin，
 * z' = x·sin + z·cos），再平移。法向只转不移。返回新网格，不改原件。
 */
export function placePart(m: PartMesh, yaw: number, t: V3): PartMesh {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const verts = new Float32Array(m.verts.length);
  const normals = new Float32Array(m.normals.length);
  for (let k = 0; k < verts.length; k += 3) {
    const x = m.verts[k], z = m.verts[k + 2];
    verts[k] = x * c - z * s + t[0];
    verts[k + 1] = m.verts[k + 1] + t[1];
    verts[k + 2] = x * s + z * c + t[2];
    const nx = m.normals[k], nz = m.normals[k + 2];
    normals[k] = nx * c - nz * s;
    normals[k + 1] = m.normals[k + 1];
    normals[k + 2] = nx * s + nz * c;
  }
  return { verts, normals, idx: m.idx, shells: m.shells };
}

/** 包围盒 */
export function partBox(m: Pick<PartMesh, 'verts'>): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < m.verts.length; k += 3) {
    x0 = Math.min(x0, m.verts[k]);
    x1 = Math.max(x1, m.verts[k]);
    y0 = Math.min(y0, m.verts[k + 1]);
    y1 = Math.max(y1, m.verts[k + 1]);
    z0 = Math.min(z0, m.verts[k + 2]);
    z1 = Math.max(z1, m.verts[k + 2]);
  }
  return { x0, x1, y0, y1, z0, z1 };
}
