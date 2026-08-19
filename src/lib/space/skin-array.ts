/**
 * 项目二 · 阵列过渡（Lab.08 的键谱序列）——纯数据，零 DOM。
 *
 * 用户 2026-08-19 立项：「想象每一个竖向的是一个单元，可能这个单元很窄。
 * 左边是第二个（蘑菇挑台），右边是第四个（阶梯方箱），中间存在十个单元，
 * 每一个单元都有微小的形变，最后实现从 2 到 4 的过渡。」
 * 这是交接件「下一步任务①：单元阵列化——多根带子、不同键谱」的第一口。
 *
 * 原则：**过渡从物理里长出来，不是形状插值**——十二条带每条都是独立的真引擎
 * 单元，形变差异全部来自键谱的逐级微变：
 * - 主驱动 = 键长 rb 0.10 → 0.32（梯身高度；v7 注释「端面弧长=键长→必然拉直」，
 *   rb 逼近端面弧长 0.32 时头部环自然摊平成方箱端面——过渡的机理本身）；
 * - 梯挡数 9 → 10（kMax 24→26，t=0.5 处离散加一颗——离散键位图之间只能如此）；
 * - 段落表同步微调（前贴合段 58→50、自由段 62→66、键谱中心 30→33，四舍五入）。
 * 两个端点**就是站上原谱**（蘑菇 = 全套站方修正、阶梯 = 含 boxSquare 方箱整形）；
 * 中间十级 = 纯 fan 键谱 + 根部修正，不加 panel/boxSquare——方正度在末端「补完」，
 * 读作渐变的收尾而非断层。等长键纪律与「键谱两端 ≥4 节缓冲」全程守住。
 *
 * 边界申明：交接件明令「行为矩阵 → 键谱的翻译规则由使用者手写」。这里的插值
 * 只是两张既有键谱之间的形态学串联（演示编排），不是那套翻译规则；用户交来
 * 正式规则后本文件随时按其替换。
 */
import { SKIN_ROOT_FIX, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { SKIN_UNITS, fan, skinSiteOpts } from './skin-data';

export interface SkinArrayUnit {
  /** 过渡参数 0..1（0 = 蘑菇挑台，1 = 阶梯方箱） */
  t: number;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 左右端点 + mid 级中间单元（默认 10 → 共 12 条带） */
export function buildTransitionArray(mid = 10): SkinArrayUnit[] {
  const A = SKIN_UNITS.find((d) => d.key === 'bulb')!;
  const B = SKIN_UNITS.find((d) => d.key === 'stepped')!;
  const n = mid + 2;
  const out: SkinArrayUnit[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    if (i === 0) {
      out.push({ t, spec: A.spec, opts: skinSiteOpts(A), smooth: A.smooth ?? [3, 1] });
      continue;
    }
    if (i === n - 1) {
      out.push({ t, spec: B.spec, opts: skinSiteOpts(B), smooth: B.smooth ?? [3, 1] });
      continue;
    }
    const lead = Math.round(lerp(58, 50, t));
    const f = Math.round(lerp(62, 66, t));
    const center = Math.round(lerp(30, 33, t));
    const rb = Math.round(lerp(0.1, 0.32, t) * 1000) / 1000;
    let kMax = 24 + 2 * Math.round(t); // 梯挡数的唯一离散跳变（t=0.5 加一颗）
    // 键谱两端 ≥4 节缓冲（交接件纪律）——取整后不满足就退一级
    while (center - kMax < 4 || center + kMax > f - 1 - 4) kMax -= 2;
    const spec: SkinSpec = [
      ['g', lead],
      ['f', f, fan(center, 8, kMax + 1, 2, rb)],
      ['g', 50],
    ];
    out.push({ t, spec, opts: { ...SKIN_ROOT_FIX }, smooth: [3, 1] });
  }
  return out;
}
