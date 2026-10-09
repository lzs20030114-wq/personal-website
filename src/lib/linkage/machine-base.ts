import type { CellFrame } from './gl3d';

/** 815.3dm 底座圆柱（60 mm 直径）的轴心，装配系换成台架世界系。 */
export const MACHINE_BASE_AXIS = { x: 6.9751, y: -0.0351 } as const;
export const MACHINE_BASE_FRAME: CellFrame = {
  o: { x: 0, y: 0, z: 0 },
  ux: 1, uy: 0, uz: 0,
  ex: 0, ey: 1, ez: 0,
  fx: 0, fy: 0, fz: 1,
};

/** 取自原网格落地最低点。展台尺寸与轴承外观是展示设定，不是真机加工尺寸。 */
export const MACHINE_PLINTH = { half: 480, grid: 80, top: -155.965, depth: 16 } as const;

/**
 * 原 frame 组同时装着落地底座和上部滑轨架。按完整连通件分开，绝不沿高度切三角。
 * 底座立柱、托架和垫脚均止于 z=-16.96 以下，上部跨越该高度。
 * 只在行为档载入时用一次，原始载荷与编排档保持原样。
 */
export function splitMachineFrame(verts: Float32Array, idx: Uint16Array | Uint32Array): {
  base: Uint32Array;
  body: Uint32Array;
} {
  const parents = Array.from({ length: verts.length / 3 }, (_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parents[r] !== r) r = parents[r];
    while (parents[i] !== i) {
      const next = parents[i];
      parents[i] = r;
      i = next;
    }
    return r;
  };
  for (let i = 0; i < idx.length; i += 3) {
    parents[root(idx[i + 1])] = root(idx[i]);
    parents[root(idx[i + 2])] = root(idx[i]);
  }
  const tops = new Map<number, number>();
  for (const i of idx) {
    const r = root(i);
    tops.set(r, Math.max(tops.get(r) ?? -Infinity, verts[i * 3 + 2]));
  }
  const base: number[] = [];
  const body: number[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    const out = tops.get(root(idx[i]))! < -16.5 ? base : body;
    out.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  return { base: new Uint32Array(base), body: new Uint32Array(body) };
}

/** 展台、表面方格和支承圆柱均为真实世界系三角网格，交给既有 z-buffer 遮挡。 */
export function machineBaseGeometry(): { plinth: Float32Array; grid: Float32Array; bearing: Float32Array } {
  const { x, y } = MACHINE_BASE_AXIS;
  const { half: h, grid: gap, top: z, depth } = MACHINE_PLINTH;
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] => {
    const p = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
    return [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7].flatMap(i => p[i]);
  };
  const grid: number[] = [];
  // 0.8 mm 宽的实体细条，抬高 0.04 mm 避免与台面共面闪烁。
  for (let t = -h; t <= h; t += gap) {
    grid.push(...box(x+t-0.4,y-h,z+0.04,x+t+0.4,y+h,z+0.08));
    grid.push(...box(x-h,y+t-0.4,z+0.04,x+h,y+t+0.4,z+0.08));
  }
  const bearing: number[] = [];
  const lo = -36, hi = -20.06, r = 26;
  for (let i = 0; i < 64; i++) {
    const a = i * Math.PI / 32, b = (i+1) * Math.PI / 32;
    const A = [x+r*Math.cos(a),y+r*Math.sin(a)];
    const B = [x+r*Math.cos(b),y+r*Math.sin(b)];
    bearing.push(...A,lo,...B,lo,...B,hi, ...A,lo,...B,hi,...A,hi,
      x,y,hi,...A,hi,...B,hi, x,y,lo,...B,lo,...A,lo);
  }
  return {
    plinth: new Float32Array(box(x-h,y-h,z-depth,x+h,y+h,z)),
    grid: new Float32Array(grid),
    bearing: new Float32Array(bearing),
  };
}
