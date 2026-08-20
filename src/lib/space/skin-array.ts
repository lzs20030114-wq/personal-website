/**
 * 项目二 · 阵列过渡（Lab.08 的键谱序列）——纯数据，零 DOM。
 *
 * 用户 2026-08-19 立项：「想象每一个竖向的是一个单元，可能这个单元很窄。
 * 左边是第二个（蘑菇挑台），右边是第四个（阶梯方箱），中间存在十个单元，
 * 每一个单元都有微小的形变，最后实现从 2 到 4 的过渡。」
 * 这是交接件「下一步任务①：单元阵列化——多根带子、不同键谱」的第一口。
 *
 * v2（2026-08-20 用户拍板线稿系列后接回）：首版只插值 rb，被用户否决——
 * 「转变根本不平滑」。线稿诊断（真引擎终态剖面 + 相邻形态距离指标）查明：
 * 方箱的「方」来自端面找平 panel 与 boxSquare 整形，不来自 rb，首版把全部
 * 形变堆在末格二值切换（断层 = 其他步的 7 倍）。返工流程 = 先出纯线稿系列 →
 * 用户确认形态 → 才接回台架（工作纪律，用户 2026-08-20 立）。
 *
 * 定版序列的四个杠杆，全部渐进、离散事件错峰：
 * - **rb 键长 0.10→0.32 线性**（步长恒 0.02）；
 * - **boxSquare 强度 0→1 渐入**（引擎 2026-08-20 新增数字强度：贴轴/找平/
 *   压肩/缓冲排布按强度混入；端面硬投影按弦弧比 0.85→1 平滑爬坡另行渐入）——
 *   「变方」从第 2 格就开始渗入，不在任何一格二值启用；
 * - **panel 端面找平提前在低强度段走完到全跨 ±8**（半跨渐入是假杠杆：
 *   不到 ±8 端面投影不参与；到达那一格的跳变要放在 sq 还小的位置）；
 * - **lead 贴合段手排**（58→50 共 8 节，取整跳变单步贡献≈一整格形变，
 *   零跳变步对准别的杠杆最重的格）。
 * 实测相邻形态距离全 12 步落在 0.69–1.76（均值 1.30，最大/最小 2.6×），
 * 对比首版 0.72–5.17（7.2×）。两个端点**仍是站上原谱对象**（蘑菇 = 全套
 * 站方修正、阶梯 = boxSquare 全量），等长键与「键谱两端 ≥4 节缓冲」全程守住。
 *
 * 边界申明：交接件明令「行为矩阵 → 键谱的翻译规则由使用者手写」。这里的序列
 * 只是两张既有键谱之间的形态学串联（演示编排，形态经用户线稿拍板），不是那套
 * 翻译规则；用户交来正式规则后本文件随时按其替换。
 */
import { SKIN_ROOT_FIX, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { SKIN_UNITS, fan, skinSiteOpts } from './skin-data';

export interface SkinArrayUnit {
  /** 过渡参数 0..1（0 = 蘑菇挑台，1 = 阶梯方箱） */
  t: number;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 定版时间表（用户 2026-08-20 线稿拍板，含端点占位——端点实际走原谱对象） */
const RB = [0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32];
const PW = [0, 0, 0, 2, 4, 6, 8, 8, 8, 8, 8, 8];
const SQ = [0, 0, 0.05, 0.12, 0.20, 0.30, 0.40, 0.51, 0.61, 0.70, 0.85, 1];
const LEAD = [58, 57, 57, 56, 55, 54, 53, 53, 52, 52, 51, 50];

/** 左右端点 + 10 级中间单元 = 12 条带（定版表只支持这一个规模） */
export function buildTransitionArray(): SkinArrayUnit[] {
  const A = SKIN_UNITS.find((d) => d.key === 'bulb')!;
  const B = SKIN_UNITS.find((d) => d.key === 'stepped')!;
  const n = RB.length;
  const out: SkinArrayUnit[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (i === 0) {
      out.push({ t, spec: A.spec, opts: skinSiteOpts(A), smooth: A.smooth ?? [3, 1] });
      continue;
    }
    if (i === n - 1) {
      out.push({ t, spec: B.spec, opts: skinSiteOpts(B), smooth: [3, 1] });
      continue;
    }
    const f = Math.round(lerp(62, 66, t));
    const c = Math.round(lerp(30, 33, t));
    let kMax = 24 + 2 * Math.round(t); // 梯挡数的唯一离散跳变（t=0.5 加一颗）
    // 键谱两端 ≥4 节缓冲（交接件纪律）——取整后不满足就退一级
    while (c - kMax < 4 || c + kMax > f - 1 - 4) kMax -= 2;
    const bonds = fan(c, 8, kMax + 1, 2, RB[i]);
    const seg: SkinSeg =
      PW[i] > 0 ? ['f', f, bonds, [[c - PW[i], c + PW[i]]]] : ['f', f, bonds];
    const spec: SkinSpec = [['g', LEAD[i]], seg, ['g', 50]];
    const opts: SkinUnitOpts = { ...SKIN_ROOT_FIX };
    if (SQ[i] > 0) opts.boxSquare = SQ[i];
    // 绘图平滑：低强度段梯身微皱仍要 [5,2] 盖住；sq≥0.5 后箱体自带压平，回 [3,1]
    out.push({ t, spec, opts, smooth: SQ[i] >= 0.5 ? [3, 1] : [5, 2] });
  }
  return out;
}
