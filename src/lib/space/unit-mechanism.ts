/**
 * 项目二 · 单元的机构件（2026-10-30，作者「把你在 Blender 模型里加上的那些让它看起来有物理合理性的结构，也加在网页渲染里的
 * 模型里，把网页里这个模型细化一下」）——纯几何，零 DOM。
 *
 * 件与读法照 项目二_单元建模.md §2（建模假设，待作者确认），尺寸照 scripts/unit-blender/build_scene.py：
 * - 上夹环：一圈窄的内外圈夹住带子前 5 节，顶上一道压圈，六根扁辐条接到中心套，中心套上是接吊杆的法兰；
 * - 下夹环：同样的夹圈夹住末 5 节，辐条与中心套在下面（芯插在里面），夹圈下一道防撞橡胶圈；
 * - 吊杆：天花方板到上夹环，五节逐节收细的伸缩管；芯：上下夹环的中心套之间，四节更细的伸缩管；
 * - 键：布上两个键座，中间一根伸缩锁止撑杆——扣上时内杆伸到对面键座（橙色，与台架的键线同色同义），
 *   没扣时只剩键座上一截竖着的外套。
 * Blender 里的天花机箱在天花板上面（网页里看不到）、螺钉与指示灯在这个尺度上看不出来，不做。
 *
 * 坐标：装置自身坐标系（与带子的 fillSolidVerts 同一套）——x = 离单元轴的半径方向，y = 世界 Y（向下为正），z = 切向；
 * 单位 = 装置单位（引擎 1 px × SOLID.SCALE / 100；房间尺度下 1 单位 ≈ 4.08 mm），摆放时随带子一起乘 rig.s。
 * 下面每个尺寸后的毫米数是房间尺度（Lab 2-15）下的实际大小。
 */
import { SKIN } from './skin-unit';
import { SOLID } from './skin-solid';

export interface MeshPart {
  verts: Float32Array;
  idx: Uint32Array;
}

/** 尺寸（装置单位） */
export const MECH = {
  /** 夹环夹住带子端头的节数（贴合段一节 = SKIN.SEG × SOLID.SCALE = 2 单位 ≈ 8 mm） */
  CLAMP_N: 5,
  /** 夹圈与布面之间的缝、夹圈壁厚：各 1 单位 ≈ 4 mm */
  GAP: 1,
  WALL: 1,
  /** 夹圈比被夹的那几节多出的一点（上下各 ≈ 6 mm） */
  LIP: 1.5,
  /** 上夹环顶（压圈与辐条）高出带子第 0 节 ≈ 12 mm */
  TOP: 3,
  /** 压圈厚 ≈ 3 mm、辐条宽 ≈ 12 mm、高 ≈ 6 mm */
  CAP_T: 0.75,
  SPOKE_W: 3,
  SPOKE_H: 1.5,
  SPOKES: 6,
  /** 中心套：半径 ≈ 34 mm、高 ≈ 30 mm；接吊杆的法兰半径 ≈ 42 mm、厚 ≈ 8 mm */
  HUB_R: 8.3,
  HUB_H: 7.35,
  FLANGE_R: 10.3,
  FLANGE_H: 2,
  /** 下夹环底面低于末节 ≈ 8 mm；防撞圈厚 ≈ 4 mm */
  FOOT_BASE: 2,
  BUMP_H: 1,
  /** 吊杆露在天花下的五节的半径（直径 84 / 76 / 68 / 60 / 52 mm；Blender 里最粗那节 Ø92 缩在天花机箱里，这里不画）与芯四节（直径 40 / 32 / 24 / 16 mm） */
  HANGER_R: [10.3, 9.3, 8.3, 7.35, 6.4],
  CORE_R: [4.9, 3.9, 2.9, 2.0],
  /** 键座 ≈ 24 × 26 × 8 mm；撑杆外套 ≈ 32 × 12 × 8 mm；内杆截面 ≈ 6 × 4.5 mm */
  PAD: { L: 5.9, W: 6.4, H: 2.0 },
  SLEEVE: { L: 7.8, W: 2.9, T: 2.0 },
  ROD: { W: 1.5, T: 1.1 },
  /** 圆的分段（收在天花下时夹环只露一圈，用 SEGS_LOW） */
  SEGS: 16,
  SEGS_LOW: 10,
} as const;

/** 被夹住的那几节在带上的长度（装置单位） */
export const CLAMP_SPAN = (MECH.CLAMP_N - 1) * SKIN.SEG * SOLID.SCALE;

// ---------------------------------------------------------------- 基本形
class Builder {
  private v: number[] = [];
  private i: number[] = [];
  get count(): number {
    return this.v.length / 3;
  }
  vert(x: number, y: number, z: number): number {
    this.v.push(x, y, z);
    return this.count - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.i.push(a, b, c, a, c, d);
  }
  tri(a: number, b: number, c: number): void {
    this.i.push(a, b, c);
  }
  done(): MeshPart {
    return { verts: Float32Array.from(this.v), idx: Uint32Array.from(this.i) };
  }

  /** 竖直圆管（ri = 0 时是实心柱）：y 从 ya 到 yb（y 向下），中心在 (cx, cz) */
  tube(ro: number, ri: number, ya: number, yb: number, segs: number = MECH.SEGS, cx = 0, cz = 0): void {
    const ring = (r: number, y: number): number[] =>
      Array.from({ length: segs }, (_, k) => {
        const a = (2 * Math.PI * k) / segs;
        return this.vert(cx + r * Math.cos(a), y, cz + r * Math.sin(a));
      });
    const oa = ring(ro, ya);
    const ob = ring(ro, yb);
    for (let k = 0; k < segs; k++) {
      const l = (k + 1) % segs;
      this.quad(oa[k], oa[l], ob[l], ob[k]);
    }
    if (ri > 0) {
      const ia = ring(ri, ya);
      const ib = ring(ri, yb);
      for (let k = 0; k < segs; k++) {
        const l = (k + 1) % segs;
        this.quad(ia[l], ia[k], ib[k], ib[l]);
        this.quad(oa[l], oa[k], ia[k], ia[l]);
        this.quad(ob[k], ob[l], ib[l], ib[k]);
      }
    } else {
      const ca = this.vert(cx, ya, cz);
      const cb = this.vert(cx, yb, cz);
      for (let k = 0; k < segs; k++) {
        const l = (k + 1) % segs;
        this.tri(ca, oa[l], oa[k]);
        this.tri(cb, ob[k], ob[l]);
      }
    }
  }

  /** 任意朝向的长方体：中心 c，三根单位轴 u / v / w 与各自的半长 */
  box(c: readonly number[], u: readonly number[], v: readonly number[], w: readonly number[], hu: number, hv: number, hw: number): void {
    const p: number[] = [];
    for (const sw of [-1, 1])
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
        p.push(this.vert(
          c[0] + su * hu * u[0] + sv * hv * v[0] + sw * hw * w[0],
          c[1] + su * hu * u[1] + sv * hv * v[1] + sw * hw * w[1],
          c[2] + su * hu * u[2] + sv * hv * v[2] + sw * hw * w[2],
        ));
    for (const [a, b, cc, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) this.quad(p[a], p[b], p[cc], p[d]);
  }
}

/** 夹圈的两道（内圈在布里侧、外圈在布外侧）半径：被夹的布在站位半径 radius 处、厚 thick */
export function clampRadii(radius: number, thick: number): { innerIn: number; innerOut: number; outerIn: number; outerOut: number } {
  const innerOut = radius - thick / 2 - MECH.GAP;
  const outerIn = radius + thick / 2 + MECH.GAP;
  return { innerIn: innerOut - MECH.WALL, innerOut, outerIn, outerOut: outerIn + MECH.WALL };
}

function spokes(b: Builder, rFrom: number, rTo: number, ya: number, yb: number): void {
  // 辐条是方条，不随分段变
  for (let k = 0; k < MECH.SPOKES; k++) {
    const a = ((k + 0.5) * 2 * Math.PI) / MECH.SPOKES;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rm = (rFrom + rTo) / 2;
    b.box([rm * c, (ya + yb) / 2, rm * s], [c, 0, s], [0, 1, 0], [-s, 0, c], (rTo - rFrom) / 2, (yb - ya) / 2, MECH.SPOKE_W / 2);
  }
}

/** 上夹环：原点 = 带子第 0 节（y 向下，带子往 +y 走）。alu = 夹圈与压圈，dark = 辐条、中心套、法兰 */
export function carriageMesh(radius: number, thick: number, segs: number = MECH.SEGS): { alu: MeshPart; dark: MeshPart } {
  const r = clampRadii(radius, thick);
  const yTop = -MECH.TOP;
  const yBot = CLAMP_SPAN + MECH.LIP;
  const alu = new Builder();
  alu.tube(r.innerOut, r.innerIn, yTop, yBot, segs);
  alu.tube(r.outerOut, r.outerIn, yTop, yBot, segs);
  alu.tube(r.outerOut, r.innerIn, yTop, yTop + MECH.CAP_T, segs);
  const dark = new Builder();
  spokes(dark, MECH.HUB_R - 0.5, r.innerIn + 0.5, yTop, yTop + MECH.SPOKE_H);
  dark.tube(MECH.HUB_R, 0, yTop, yTop + MECH.HUB_H, segs);
  dark.tube(MECH.FLANGE_R, 0, yTop - MECH.FLANGE_H, yTop, segs);
  return { alu: alu.done(), dark: dark.done() };
}

/** 下夹环：原点 = 带子末节（带子在 −y 那边）。alu = 夹圈与底圈，dark = 辐条、中心套、端盖、防撞圈 */
export function footMesh(radius: number, thick: number, segs: number = MECH.SEGS): { alu: MeshPart; dark: MeshPart } {
  const r = clampRadii(radius, thick);
  const yTop = -(CLAMP_SPAN + MECH.LIP);
  const yBase = MECH.FOOT_BASE;
  const alu = new Builder();
  alu.tube(r.innerOut, r.innerIn, yTop, yBase, segs);
  alu.tube(r.outerOut, r.outerIn, yTop, yBase, segs);
  alu.tube(r.outerOut, r.innerIn, yBase - MECH.CAP_T, yBase, segs);
  const dark = new Builder();
  spokes(dark, MECH.HUB_R - 0.5, r.innerIn + 0.5, yBase - MECH.SPOKE_H, yBase);
  dark.tube(MECH.HUB_R, 0, yBase - MECH.HUB_H, yBase, segs);
  dark.tube(MECH.HUB_R - 1.5, 0, yBase, yBase + 1.5, segs);
  dark.tube(r.outerOut + 0.25, r.innerIn - 0.25, yBase, yBase + MECH.BUMP_H, segs);
  return { alu: alu.done(), dark: dark.done() };
}

/**
 * 一台单元此刻的夹环与芯：上夹环在 yCarriage（带子第 0 节）、下夹环在 yFoot（末节），芯四节等分两个中心套之间。
 * 一台单元的这三件只随「上夹环在哪一帧的顶端」变（钉住端在同一帧里固定），台架按那一帧缓存一份。
 */
export function unitMechMesh(radius: number, thick: number, yCarriage: number, yFoot: number, segs: number = MECH.SEGS): { alu: MeshPart; dark: MeshPart } {
  const top = carriageMesh(radius, thick, segs);
  const bot = footMesh(radius, thick, segs);
  const core = new Builder();
  const ya = yCarriage - MECH.TOP + MECH.HUB_H;
  const yb = yFoot + MECH.FOOT_BASE - MECH.HUB_H;
  if (yb - ya > 1e-3) {
    const n = MECH.CORE_R.length;
    for (let k = 0; k < n; k++) core.tube(MECH.CORE_R[k], 0, ya + ((yb - ya) * k) / n, ya + ((yb - ya) * (k + 1)) / n, Math.min(12, segs));
  }
  return {
    alu: concatParts([shiftY(top.alu, yCarriage), shiftY(bot.alu, yFoot)]),
    dark: concatParts([shiftY(top.dark, yCarriage), shiftY(bot.dark, yFoot), core.done()]),
  };
}

/** 吊杆：五节逐节收细，竖向归一化（y 从 0 到 1），台架按长度竖向拉伸（gl3d MeshPlace.sy）——各节等分，收细处是一圈水平台阶 */
export function hangerMesh(): MeshPart {
  const b = new Builder();
  const n = MECH.HANGER_R.length;
  for (let k = 0; k < n; k++) b.tube(MECH.HANGER_R[k], 0, k / n, (k + 1) / n, 16);
  return b.done();
}

// ---------------------------------------------------------------- 键（键座 + 伸缩撑杆）
/** 剖面上第 i 节的位置（装置系，x 径向、y 向下）与切向、法向 */
function frameAt(px: ArrayLike<number>, py: ArrayLike<number>, n: number, radius: number, scale: number, i: number) {
  const P = [radius + (px[i] as number) * scale, -(py[i] as number) * scale];
  const a = Math.max(0, i - 1);
  const c = Math.min(n - 1, i + 1);
  let tx = radius + (px[c] as number) * scale - (radius + (px[a] as number) * scale);
  let ty = -(py[c] as number) * scale + (py[a] as number) * scale;
  const L = Math.hypot(tx, ty) || 1;
  tx /= L;
  ty /= L;
  return { P, T: [tx, ty], N: [-ty, tx] };
}

/** 每颗键的键座朝布的哪一面：扣着时对方在本节法向的哪一侧（取一帧所有键都扣着的形，通常是成形态）；没扣过 = +1 */
export function bondSides(
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  n: number,
  bonds: ArrayLike<number>,
  radius: number,
  scale: number = SOLID.SCALE,
): Int8Array {
  const out = new Int8Array(bonds.length);
  for (let b = 0; b < bonds.length; b += 2) {
    const i = bonds[b] as number;
    const j = bonds[b + 1] as number;
    const fi = frameAt(px, py, n, radius, scale, i);
    const fj = frameAt(px, py, n, radius, scale, j);
    const d = [fj.P[0] - fi.P[0], fj.P[1] - fi.P[1]];
    out[b] = fi.N[0] * d[0] + fi.N[1] * d[1] >= 0 ? 1 : -1;
    out[b + 1] = fj.N[0] * -d[0] + fj.N[1] * -d[1] >= 0 ? 1 : -1;
  }
  return out;
}

/**
 * 一条带的键（带子本地系：沿 +x 放在半径 radius 处，与 fillSolidVerts 同）。bonds = [i0, j0, i1, j1, …]，sides 同序，
 * locked[b] = 第 b 颗键此刻扣没扣。pad = 键座（+ 没扣时那截竖着的外套，石墨），rod = 扣上时伸到对面的内杆（橙）。
 */
export function bandKeyMesh(
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  n: number,
  bonds: ArrayLike<number>,
  sides: ArrayLike<number>,
  locked: ArrayLike<number> | null,
  radius: number,
  thick: number,
  scale: number = SOLID.SCALE,
): { pad: MeshPart; rod: MeshPart } {
  const pad = new Builder();
  const rod = new Builder();
  const Z = [0, 0, 1];
  const ht = thick / 2;
  for (let b = 0; b < bonds.length; b += 2) {
    const fi = frameAt(px, py, n, radius, scale, bonds[b] as number);
    const fj = frameAt(px, py, n, radius, scale, bonds[b + 1] as number);
    const si = sides[b] as number;
    const sj = sides[b + 1] as number;
    const on = (f: typeof fi, s: number, d: number) => [f.P[0] + s * f.N[0] * d, f.P[1] + s * f.N[1] * d, 0];
    for (const [f, s] of [[fi, si], [fj, sj]] as const)
      pad.box(on(f, s, ht + MECH.PAD.H / 2), [f.T[0], f.T[1], 0], Z, [s * f.N[0], s * f.N[1], 0], MECH.PAD.L / 2, MECH.PAD.W / 2, MECH.PAD.H / 2);
    const hi = on(fi, si, ht + MECH.PAD.H);
    let u: number[];
    let L: number;
    const lock = locked ? (locked[b / 2] as number) > 0 : false;
    if (lock) {
      const hj = on(fj, sj, ht + MECH.PAD.H);
      const d = [hj[0] - hi[0], hj[1] - hi[1]];
      L = Math.hypot(d[0], d[1]);
      u = L > 1e-9 ? [d[0] / L, d[1] / L, 0] : [si * fi.N[0], si * fi.N[1], 0];
      const r0 = [hi[0] + u[0], hi[1] + u[1]];
      const rl = Math.hypot(hj[0] - r0[0], hj[1] - r0[1]);
      if (rl > 1e-6)
        rod.box([(r0[0] + hj[0]) / 2, (r0[1] + hj[1]) / 2, 0], u, Z, [-u[1], u[0], 0], rl / 2, MECH.ROD.W / 2, MECH.ROD.T / 2);
    } else {
      u = [si * fi.N[0], si * fi.N[1], 0];
      L = MECH.SLEEVE.L - 1;
    }
    // 外套只在没扣时画（一截竖着的短桩）；扣上时内杆从外套里伸出去，外套与内杆重叠，在网页这个尺度上看不出，省掉
    if (!lock) {
      const ls = Math.min(MECH.SLEEVE.L, L);
      pad.box([hi[0] + (u[0] * ls) / 2, hi[1] + (u[1] * ls) / 2, 0], u, Z, [-u[1], u[0], 0], ls / 2, MECH.SLEEVE.W / 2, MECH.SLEEVE.T / 2);
    }
  }
  return { pad: pad.done(), rod: rod.done() };
}

// ---------------------------------------------------------------- 小工具
export function shiftY(m: MeshPart, dy: number): MeshPart {
  const v = Float32Array.from(m.verts);
  for (let k = 1; k < v.length; k += 3) v[k] += dy;
  return { verts: v, idx: m.idx };
}

export function concatParts(parts: readonly MeshPart[]): MeshPart {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.verts.length;
    ni += p.idx.length;
  }
  const verts = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of parts) {
    verts.set(p.verts, ov);
    const base = ov / 3;
    for (let k = 0; k < p.idx.length; k++) idx[oi + k] = p.idx[k] + base;
    ov += p.verts.length;
    oi += p.idx.length;
  }
  return { verts, idx };
}
