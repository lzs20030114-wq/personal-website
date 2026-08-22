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
 * 定版序列的三个渐进杠杆：
 * - **rb 键长 0.10→0.32 线性**（步长恒 0.02）；
 * - **boxSquare 强度 0→1 渐入**（引擎 2026-08-20 新增数字强度：贴轴/找平/
 *   压肩/缓冲排布按强度混入；端面硬投影按弦弧比 0.85→1 平滑爬坡另行渐入）——
 *   「变方」从第 2 格就开始渗入，不在任何一格二值启用；
 * - **panel 端面找平提前在低强度段走完到全跨 ±8**（半跨渐入是假杠杆：
 *   不到 ±8 端面投影不参与；到达那一格的跳变要放在 sq 还小的位置）。
 * 线稿实测相邻形态距离全 12 步落在 0.69–1.76（均值 1.30，最大/最小 2.6×），
 * 对比首版 0.72–5.17（7.2×）。两个端点的**形态**仍是站上原谱（蘑菇 = 全套站方
 * 修正、阶梯 = boxSquare 全量；键位图只整体平移、跨度集与键长逐位不动），
 * 等长键与「键谱两端 ≥4 节缓冲」全程守住。
 *
 * **放置规律（2026-08-20 用户第三轮定案：「根据理想的最终形态反推位置，找出一条规律」）**
 *
 * 终态时轴上的账是封闭的，位置可以解析反推，不必试凑：
 *   S = f·SEG·r          自由段的轴向跨度（终态 r=R1=0.3 ⇒ S = 0.6f px）
 *   M = 100·rb           嘴（最外键对）在轴上占的高度 —— **理想终态的高度由它定义**
 *   S − M                剩给上下缓冲的轴向余量，按节数比 bT:bB 分掉（缓冲被压缩，
 *                        拉伸约束让压缩按节数均摊 —— boxSquare 的均匀排布亦然）
 *   嘴心深度 = 2·lead + (S − M)·bT/(bT+bB) + M/2
 *   体心     = 嘴心 + Δ(形态)
 *
 * **Δ = 该形态自身的下垂量**（实测：松散卷料的蘑菇端 +1.8px，越方越小，方箱恰 0
 * ——箱体被嘴对钳住不下垂）。Δ 跨全族差 2.8px，**故体心与嘴心不可能同时对齐**：
 * 对齐其一，另一必然散开 Δ 的幅度。用户 2026-08-20 拍板取**嘴心**为基准
 * （接合处居中；嘴的开口 = 键长 rb，是理想终态直接定义的量）。
 *
 * **对齐必须在全程成立，不能只对终态**（2026-08-20 第五轮：用户「网站上的也没有
 * 真正对齐」——查明首版标定只做了终态）。把 S = 2f·r 代回去，嘴心是 r 的一次式：
 *   嘴心(r) = [2·lead + M·(1/2 − φ)] + [2f·φ]·r  ，其中 φ = bT/(bT+bB)
 * ⇒ **斜率由 f·φ 定、截距由 lead 定**。台架 19 秒里绝大部分时间在收缩过程中
 * （r 从 0.95 走到 0.30），只对终态标定的话早期会散开——实测首版早期 4.78px、
 * 终态才 1.01px，屏幕上看到的就是那 4.78px。
 * 两个整数旋钮：**dFan**（扇形在自由段内的位置 ⇒ 调 φ = 斜率；f 不变 ⇒ 折叠体
 * 形状与高度逐位不变，实测高度差 0.00、键数不变）与 **lead**（2px/节，调截距，
 * 严格线性纯平移）。标定脚本 scripts/skin-array/calibrate.mjs 在四个检查点
 * （r≈0.87/0.66/0.44/0.30）上取整数最优，**全程最大散布 4.78 → 1.66px**。
 * 改任何形状后须重标（守门卡全程散布）。
 *
 * lead 的量还兼顾条纹相位：贴合段以未收缩间距钉轴，故各带的横向条纹靠它对齐，
 * dLead 限在 ±1 节以内，主要位移交给 dFan。
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

/** 把自由段里的键位图（含面板）整体沿带子平移 d 节——纯位置，形状与高度逐位不变 */
function shiftFan(seg: SkinSeg, d: number): SkinSeg {
  if (seg[0] !== 'f' || d === 0) return seg;
  const bonds = seg[2].map(([i, j, rb]) => [i + d, j + d, rb] as const);
  return seg.length === 4
    ? ['f', seg[1], bonds, seg[3].map(([a, b]) => [a + d, b + d] as const)]
    : ['f', seg[1], bonds];
}

/** 定版时间表（用户 2026-08-20 线稿拍板，含端点占位——端点实际走原谱键谱段） */
const RB = [0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26, 0.28, 0.30, 0.32];
const PW = [0, 0, 0, 2, 4, 6, 8, 8, 8, 8, 8, 8];
const SQ = [0, 0, 0.05, 0.12, 0.20, 0.30, 0.40, 0.51, 0.61, 0.70, 0.85, 1];
/**
 * 位置标定表（scripts/skin-array/calibrate.mjs 实跑四个检查点取整数最优 ⇒ **全程**对齐）。
 * DFAN = 扇形在自由段内的位置（调 φ = 嘴心随 r 的斜率；f 不变 ⇒ 形状与高度逐位不变）；
 * LEAD = 贴合段节数（2px/节，调截距）；TAIL 配平使各带总长恒定（帘子下缘齐——
 * 尾段是贴合段、逐迭代钉轴、不对折叠体施力，纯外观量）。
 */
const LEAD = [53, 53, 52, 52, 52, 54, 55, 55, 55, 55, 53, 54];
const DFAN = [3, 3, 3, 3, 3, 2, 0, 0, 0, 0, 1, 0];
const TAIL = [57, 57, 57, 57, 57, 54, 53, 52, 52, 52, 53, 52];

/** 带总长（所有单元相同——守门用） */
export const ARRAY_TOTAL = LEAD[0] + 62 + TAIL[0];
export { DFAN as ARRAY_DFAN };

/** 左右端点 + 10 级中间单元 = 12 条带（定版表只支持这一个规模） */
export function buildTransitionArray(): SkinArrayUnit[] {
  const A = SKIN_UNITS.find((d) => d.key === 'bulb')!;
  const B = SKIN_UNITS.find((d) => d.key === 'stepped')!;
  const n = RB.length;
  const out: SkinArrayUnit[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (i === 0 || i === n - 1) {
      // 端点：**形态**逐字取原谱（键位图的跨度集/键长/面板跨度全不动，即用户逐轮
      // 磨定的那两台）；只把它在带子上平移到对位处——位置不属形态（用户拍板）
      const d = i === 0 ? A : B;
      const spec: SkinSpec = [['g', LEAD[i]], shiftFan(d.spec[1], DFAN[i]), ['g', TAIL[i]]];
      out.push({
        t, spec,
        opts: skinSiteOpts(d),
        smooth: i === 0 ? (A.smooth ?? [3, 1]) : [3, 1],
      });
      continue;
    }
    const f = Math.round(lerp(62, 66, t));
    const c = Math.round(lerp(30, 33, t));
    let kMax = 24 + 2 * Math.round(t); // 梯挡数的唯一离散跳变（t=0.5 加一颗）
    // 键谱两端 ≥4 节缓冲（交接件纪律）——取整后不满足就退一级
    while (c - kMax < 4 || c + kMax > f - 1 - 4) kMax -= 2;
    const cc = c + DFAN[i]; // 扇形在自由段内的位置（放置规律的细旋钮）
    const bonds = fan(cc, 8, kMax + 1, 2, RB[i]);
    const seg: SkinSeg =
      PW[i] > 0 ? ['f', f, bonds, [[cc - PW[i], cc + PW[i]]]] : ['f', f, bonds];
    const spec: SkinSpec = [['g', LEAD[i]], seg, ['g', TAIL[i]]];
    const opts: SkinUnitOpts = { ...SKIN_ROOT_FIX };
    if (SQ[i] > 0) opts.boxSquare = SQ[i];
    // 绘图平滑：低强度段梯身微皱仍要 [5,2] 盖住；sq≥0.5 后箱体自带压平，回 [3,1]
    out.push({ t, spec, opts, smooth: SQ[i] >= 0.5 ? [3, 1] : [5, 2] });
  }
  return out;
}
