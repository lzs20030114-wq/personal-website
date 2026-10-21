/**
 * 人体比例参考（建筑模型里的「比例小人」）——纯几何，零 DOM、零依赖。
 *
 * 用户 2026-08-25 手绘的布景草图里有一个站在地上的人，用来读尺度。原话是
 * 「直接找个素材用一下」——但本仓库没有人体模型资产，也没有取用外部模型的管线
 * （网站上的实体网格全部来自用户自己的 .3dm，经 scripts/model-extract 提取）。
 * 故这里按建筑模型的惯例**自己搭一个体块小人**：十四块长方体，站姿、迈一步、
 * 手臂微张，任何视角看都是个人形而不是一块板。以后若要换成真实扫描/购买的模型，
 * 换掉 `figureVerts` 一处即可（形状接口就是「一堆三角」）。
 *
 * 比例按 7.5 头身的通用人体，全部写成身高的比例 ⇒ 改身高不会走形。
 */
import { rotateVertsY } from './skin-solid';

/** 各部件：t = 离地高度占身高的比例（0 = 脚底，1 = 头顶）；x/z = 半宽半厚占身高的比例 */
interface Part {
  t0: number;
  t1: number;
  hw: number;
  hd: number;
  /** 左右偏移（占身高；正负各画一份 = 成对肢体） */
  side?: number;
  /** 前后偏移（占身高；成对时第二份取反 ⇒ 迈步） */
  fwd?: number;
  /** 成对（左右各一份） */
  pair?: boolean;
}

const PARTS: readonly Part[] = [
  { t0: 0.865, t1: 1.0, hw: 0.045, hd: 0.049 }, // 头
  { t0: 0.825, t1: 0.875, hw: 0.021, hd: 0.021 }, // 颈
  { t0: 0.61, t1: 0.84, hw: 0.115, hd: 0.058 }, // 胸
  { t0: 0.49, t1: 0.625, hw: 0.098, hd: 0.056 }, // 骨盆
  { t0: 0.64, t1: 0.8, hw: 0.028, hd: 0.03, side: 0.14, pair: true }, // 大臂
  { t0: 0.475, t1: 0.65, hw: 0.024, hd: 0.026, side: 0.152, pair: true }, // 小臂
  { t0: 0.25, t1: 0.5, hw: 0.042, hd: 0.045, side: 0.052, fwd: 0.028, pair: true }, // 大腿
  { t0: 0.03, t1: 0.26, hw: 0.032, hd: 0.035, side: 0.052, fwd: 0.05, pair: true }, // 小腿
  { t0: 0.0, t1: 0.035, hw: 0.032, hd: 0.062, side: 0.052, fwd: 0.075, pair: true }, // 脚
];

/** 一块长方体的 8 顶点（与 skin-solid.boxVerts 同序，但这里要批量拼接故内联） */
function pushBox(
  out: number[],
  idx: number[],
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): void {
  const base = out.length / 3;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) out.push(cx + sx * hx, cy + sy * hy, cz + sz * hz);
  for (const f of [
    [0, 1, 3, 0, 3, 2],
    [4, 6, 7, 4, 7, 5],
    [0, 4, 5, 0, 5, 1],
    [2, 3, 7, 2, 7, 6],
    [0, 2, 6, 0, 6, 4],
    [1, 5, 7, 1, 7, 3],
  ])
    for (const i of f) idx.push(base + i);
}

export interface FigureSpec {
  /** 站立点（脚底所在的地面高度 = footY；世界 Y 向下为正） */
  x: number;
  z: number;
  footY: number;
  /** 身高（世界单位） */
  height: number;
  /** 朝向：绕世界 Y，0 = 面朝 +Z */
  yaw?: number;
  /**
   * 姿态（2026-10-21 人猫同台立体台架加）：站（默认，逐位不变）/ 坐——坐着的人躯干落到座面
   * （0.265 身高 ≈ 0.45 m）、大腿前伸、小腿垂下；臂照旧垂在身侧。
   */
  pose?: 'stand' | 'sit';
}

/** 坐姿：座面离地占身高的比例（1.70 m 的人 ≈ 0.45 m 的沙发座面） */
const SIT_SEAT = 0.265;
/** 坐姿的腿（站姿的大腿 / 小腿 / 脚换成这三块；其余部件整体下移 0.49 − 0.265） */
const SIT_LEGS: readonly Part[] = [
  { t0: SIT_SEAT, t1: SIT_SEAT + 0.09, hw: 0.042, hd: 0.125, side: 0.052, fwd: 0.125, pair: true }, // 大腿（前伸）
  { t0: 0.03, t1: SIT_SEAT + 0.03, hw: 0.032, hd: 0.035, side: 0.052, fwd: 0.23, pair: true }, // 小腿（垂下）
  { t0: 0.0, t1: 0.035, hw: 0.032, hd: 0.062, side: 0.052, fwd: 0.26, pair: true }, // 脚
];

/**
 * 比例小人的三角网格（位置 + 索引；法向交给 bakeIndexed 从三角算）。
 * 世界 Y 向下为正 ⇒ 脚在 footY、头顶在 footY − height。
 */
export function figureVerts(spec: FigureSpec): { verts: Float32Array; idx: Uint32Array } {
  const { x, z, footY, height: H, yaw = 0, pose = 'stand' } = spec;
  const out: number[] = [];
  const idx: number[] = [];
  const add = (p: Part, side: number, fwd: number, drop = 0): void => {
    const yTop = footY - (p.t1 - drop) * H;
    const yBot = footY - (p.t0 - drop) * H;
    pushBox(
      out,
      idx,
      side * H,
      (yTop + yBot) / 2,
      fwd * H,
      p.hw * H,
      (yBot - yTop) / 2,
      p.hd * H,
    );
  };
  // 坐姿：上身整体落到座面（骨盆底 0.49 → 0.265），腿换成坐着的三块；两腿同向，不迈步
  const sit = pose === 'sit';
  const drop = sit ? 0.49 - SIT_SEAT : 0;
  const upper = sit ? PARTS.slice(0, 6) : PARTS;
  for (const p of upper) {
    if (p.pair) {
      add(p, p.side ?? 0, p.fwd ?? 0, drop);
      add(p, -(p.side ?? 0), -(p.fwd ?? 0), drop); // 另一侧反向 ⇒ 迈步
    } else {
      add(p, 0, 0, drop);
    }
  }
  if (sit)
    for (const p of SIT_LEGS) {
      add(p, p.side ?? 0, p.fwd ?? 0);
      add(p, -(p.side ?? 0), p.fwd ?? 0);
    }
  const verts = Float32Array.from(out);
  // 朝向绕世界 Y 转，再平移到站立点（先转后移：转的是人自己，不是绕房间中心转）
  rotateVertsY(verts, yaw ? { radius: 0, angle: yaw } : null);
  for (let k = 0; k < verts.length; k += 3) {
    verts[k] += x;
    verts[k + 2] += z;
  }
  return { verts, idx: Uint32Array.from(idx) };
}

/** 小人的世界包围盒（取景与守门用） */
export function figureBox(spec: FigureSpec): {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
} {
  const { verts } = figureVerts(spec);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < verts.length; k += 3) {
    x0 = Math.min(x0, verts[k]); x1 = Math.max(x1, verts[k]);
    y0 = Math.min(y0, verts[k + 1]); y1 = Math.max(y1, verts[k + 1]);
    z0 = Math.min(z0, verts[k + 2]); z1 = Math.max(z1, verts[k + 2]);
  }
  return { x0, x1, y0, y1, z0, z1 };
}

// ── 猫（2026-10-21 人猫同台立体台架加）────────────────────────────────────────
//
// 同一种体块画法：身子、头、四条腿、尾巴。尺寸写成米（家猫：体长 ≈ 0.45 m、肩高 ≈ 0.25 m），
// 由 `unit`（一米 = 多少世界单位）换算，与小人同一把尺子。姿态只分四档，对应仿真里猫的
// 状态（站 / 走 / 坐 / 卧）；它是比例参考不是动物模型，与小人同一句话。

export type CatPose = 'stand' | 'walk' | 'sit' | 'lie';

export interface CatSpec {
  x: number;
  z: number;
  /** 脚底（或趴着的肚子）所在的面：地面或平台面的世界 Y */
  footY: number;
  /** 一米 = 多少世界单位 */
  unit: number;
  /** 朝向：绕世界 Y，0 = 面朝 +Z（与小人同） */
  yaw?: number;
  pose?: CatPose;
}

/** 猫的体块（米）：[中心 x, 中心离地高度, 中心 z（+ 为前）, 半宽, 半高, 半长] */
function catBoxes(pose: CatPose): readonly (readonly [number, number, number, number, number, number])[] {
  const legs = (h: number, front: number, back: number): (readonly [number, number, number, number, number, number])[] => [
    [0.05, h / 2, front, 0.022, h / 2, 0.022],
    [-0.05, h / 2, front, 0.022, h / 2, 0.022],
    [0.05, h / 2, back, 0.022, h / 2, 0.022],
    [-0.05, h / 2, back, 0.022, h / 2, 0.022],
  ];
  switch (pose) {
    case 'lie':
      return [
        [0, 0.08, 0, 0.09, 0.08, 0.2], // 身子趴平
        [0, 0.15, 0.24, 0.06, 0.06, 0.07], // 头
        [0, 0.05, -0.28, 0.02, 0.02, 0.09], // 尾巴
      ];
    case 'sit':
      return [
        [0, 0.2, 0.0, 0.08, 0.11, 0.1], // 前身立起
        [0, 0.09, -0.12, 0.09, 0.09, 0.1], // 后身蹲着
        [0, 0.33, 0.07, 0.06, 0.06, 0.07], // 头
        ...legs(0.1, 0.07, 0.07).slice(0, 2), // 前腿
        [0, 0.05, -0.27, 0.02, 0.02, 0.07], // 尾巴
      ];
    default:
      return [
        [0, 0.21, 0, 0.08, 0.075, 0.2], // 身子
        [0, 0.28, 0.25, 0.06, 0.06, 0.07], // 头
        ...legs(0.14, 0.15, -0.15),
        [0, 0.26, -0.27, 0.02, 0.02, 0.09], // 尾巴
      ];
  }
}

/** 猫的三角网格：与 figureVerts 同一套约定（世界 Y 向下为正，先转后移） */
export function catVerts(spec: CatSpec): { verts: Float32Array; idx: Uint32Array } {
  const { x, z, footY, unit: U, yaw = 0, pose = 'stand' } = spec;
  const out: number[] = [];
  const idx: number[] = [];
  for (const [cx, h, cz, hx, hy, hz] of catBoxes(pose)) pushBox(out, idx, cx * U, footY - h * U, cz * U, hx * U, hy * U, hz * U);
  const verts = Float32Array.from(out);
  rotateVertsY(verts, yaw ? { radius: 0, angle: yaw } : null);
  for (let k = 0; k < verts.length; k += 3) {
    verts[k] += x;
    verts[k + 2] += z;
  }
  return { verts, idx: Uint32Array.from(idx) };
}
